'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
  import { geocodeSites } from '@/lib/geocode'
import { computeRespondBy, notifyEmergencyAssignment } from '@/lib/dispatch'

export interface BookCallInput {
  /** 'recurring' = scheduled PPM against an existing site_service. */
  mode: 'recurring' | 'reactive'
  // Recurring mode:
  siteServiceId?: string | null
  visitTypeId?: string | null
  // Reactive / emergency mode:
  siteId?: string | null
  serviceTypeId?: string | null
  systemTypeId?: string | null
  // Shared:
  clientId?: string | null
  assignedEngineerId?: string | null
  /** yyyy-MM-dd */
  scheduledDate: string
  bookedStartTime?: string | null
  bookedEndTime?: string | null
  /** KPI hours for reactive calls (attend within X hours). */
  respondByHours?: number | null
  /** Free-text call description / notes (shown as "Call notes" on the task). */
  notes?: string | null
  /**
   * Send the client/site a complimentary booking confirmation email with an
   * .ics attachment + add-to-calendar links. Defaults to true (opt-out).
   */
  sendConfirmation?: boolean
  /** When booked from a job, the job this call belongs to. */
  sourceJobId?: string | null
  /** Marks this as a commissioning call (copies job info + exposes job folder). */
  isCommissioning?: boolean
}

export interface BookCallResult {
  ok: boolean
  error?: string
  taskId?: string
}

/**
 * Log a call (task). Supports both recurring PPM calls (anchored to a
 * site_service) and reactive / emergency calls (anchored directly to a site +
 * service type + system, with an "attend within X hours" KPI). Emergency calls
 * that are assigned at booking notify the engineer immediately.
 */
export async function bookCall(input: BookCallInput): Promise<BookCallResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { ok: false, error: 'You do not have permission to book calls.' }
  }

  if (!input.scheduledDate) return { ok: false, error: 'A scheduled date is required.' }
  if (
    input.bookedStartTime &&
    input.bookedEndTime &&
    input.bookedEndTime <= input.bookedStartTime
  ) {
    return { ok: false, error: 'End time must be after the start time.' }
  }

  // Common columns.
  const base: Record<string, unknown> = {
    client_id: input.clientId || null,
    assigned_engineer_id: input.assignedEngineerId || null,
    scheduled_date: input.scheduledDate,
    booked_start_time: input.bookedStartTime || null,
    booked_end_time: input.bookedEndTime || null,
    status: 'pending' as const,
    assigned_at: input.assignedEngineerId ? new Date().toISOString() : null,
    notes: input.notes?.trim() || null,
    source_job_id: input.sourceJobId || null,
    is_commissioning: input.isCommissioning ?? false,
  }

  let isEmergency = false
  let respondBy: string | null = null
  let siteName: string | null = null
  let callTypeName: string | null = null
  let insertRow: Record<string, unknown>

  if (input.mode === 'recurring') {
    if (!input.siteServiceId) return { ok: false, error: 'Select a service.' }
    // Derive the direct anchors from the recurring service so reads can rely on
    // site_id / service_type_id regardless of call kind.
    const { data: ss } = await supabase
      .from('site_services')
      .select('site_id, service_type_id, service_type:service_types(name, system_type_id)')
      .eq('id', input.siteServiceId)
      .single()
    const ssRow = ss as
      | {
          site_id: string
          service_type_id: string
          service_type: { name: string | null; system_type_id: string | null } | null
        }
      | null
    callTypeName = ssRow?.service_type?.name ?? 'Service visit'
    insertRow = {
      ...base,
      site_service_id: input.siteServiceId,
      site_id: ssRow?.site_id ?? null,
      service_type_id: ssRow?.service_type_id ?? null,
      system_type_id: ssRow?.service_type?.system_type_id ?? null,
      visit_type_id: input.visitTypeId || null,
      is_emergency: false,
    }
  } else {
    // Reactive / emergency.
    if (!input.siteId) return { ok: false, error: 'Select a site.' }
    if (!input.serviceTypeId) return { ok: false, error: 'Select a call type.' }

    const { data: st } = await supabase
      .from('service_types')
      .select('name, is_emergency, is_recurring, default_kpi_hours, system_type_id')
      .eq('id', input.serviceTypeId)
      .single()
    const stRow = st as
      | {
          name: string
          is_emergency: boolean
          is_recurring: boolean
          default_kpi_hours: number | null
          system_type_id: string | null
        }
      | null
    if (!stRow) return { ok: false, error: 'Call type not found.' }
    if (stRow.is_recurring) {
      return { ok: false, error: 'That is a recurring service type — book it as a scheduled call.' }
    }

    isEmergency = stRow.is_emergency
    callTypeName = stRow.name
    const hours = input.respondByHours ?? stRow.default_kpi_hours ?? null
    respondBy = computeRespondBy(hours)

    insertRow = {
      ...base,
      site_service_id: null,
      site_id: input.siteId,
      service_type_id: input.serviceTypeId,
      system_type_id: input.systemTypeId || stRow.system_type_id || null,
      visit_type_id: null,
      is_emergency: isEmergency,
      respond_by: respondBy,
    }

    // Best-effort: geocode the site if it has no coordinates yet, so it appears
    // on the dispatch map immediately. Uses the street address + postcode for
    // accurate marker placement (falls back to the postcode centroid).
    const { data: site } = await supabase
      .from('sites')
      .select('name, address, postcode, latitude, longitude')
      .eq('id', input.siteId)
      .single()
    const siteRow = site as
      | {
          name: string
          address: string | null
          postcode: string | null
          latitude: number | null
          longitude: number | null
        }
      | null
    siteName = siteRow?.name ?? null
    if (
      siteRow &&
      (siteRow.address || siteRow.postcode) &&
      (siteRow.latitude == null || siteRow.longitude == null)
    ) {
      try {
        const geo = await geocodeSites([
          { id: input.siteId, address: siteRow.address, postcode: siteRow.postcode },
        ])
        const hit = geo.get(input.siteId)
        if (hit) {
          await supabase
            .from('sites')
            .update({
              latitude: hit.latitude,
              longitude: hit.longitude,
              geocoded_at: new Date().toISOString(),
            })
            .eq('id', input.siteId)
        }
      } catch {
        // Non-fatal — the call is still logged, just without coordinates.
      }
    }
  }

  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert(insertRow)
    .select('id')
    .single()

  if (error || !inserted) {
    console.log('[v0] bookCall insert failed:', error?.message)
    return { ok: false, error: 'Failed to book the call. Please try again.' }
  }

  const taskId = (inserted as { id: string }).id

  // Emergency + assigned at booking → notify the engineer immediately.
  if (isEmergency && input.assignedEngineerId) {
    try {
      await notifyEmergencyAssignment({
        taskId,
        engineerId: input.assignedEngineerId,
        siteName,
        callTypeName,
        respondBy,
        actorId: user.id,
      })
    } catch (err) {
      console.log('[v0] Emergency notify failed:', (err as Error).message)
    }
  }

  // Complimentary booking confirmation to the client/site (opt-out). Best-effort
  // — a mail problem must never fail an otherwise-successful booking.
  if (input.sendConfirmation !== false) {
    try {
      await dispatchBookingConfirmation(supabase, {
        taskId,
        siteId: (insertRow.site_id as string | null) ?? null,
        clientId: input.clientId || null,
        callTypeName: callTypeName ?? 'Service visit',
        scheduledDate: input.scheduledDate,
        startTime: input.bookedStartTime || null,
        endTime: input.bookedEndTime || null,
        notes: input.notes || null,
      })
    } catch (err) {
      console.log('[v0] Booking confirmation dispatch failed:', (err as Error).message)
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/schedule/map')
  if (input.siteId) revalidatePath(`/dashboard/sites/${input.siteId}`)

  return { ok: true, taskId }
}

/** Format a yyyy-MM-dd date as e.g. "Tuesday, 14 July 2026" (UK). */
function formatDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(d)
}

/** Format an "HH:mm[:ss]" pair into "09:00 – 11:00", or null when no slot. */
function formatTimeLabel(start: string | null, end: string | null): string | null {
  if (!start) return null
  const hm = (t: string) => t.slice(0, 5)
  return end ? `${hm(start)} – ${hm(end)}` : hm(start)
}

interface ConfirmationContext {
  taskId: string
  siteId: string | null
  clientId: string | null
  callTypeName: string
  scheduledDate: string
  startTime: string | null
  endTime: string | null
  notes: string | null
}

/**
 * Gather recipient emails (site reporting emails + site/client contact) and
 * send the branded booking confirmation with calendar attachments.
 */
async function dispatchBookingConfirmation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: ConfirmationContext,
): Promise<void> {
  const { sendBookingConfirmation } = await import('@/lib/email/booking-confirmation')

  const recipients: string[] = []
  let siteName = 'your site'
  let siteAddress: string | null = null
  let contactName: string | null = null

  if (ctx.siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('name, address, postcode, contact_email, contact_name, reporting_emails')
      .eq('id', ctx.siteId)
      .single()
    const s = site as
      | {
          name: string
          address: string | null
          postcode: string | null
          contact_email: string | null
          contact_name: string | null
          reporting_emails: unknown
        }
      | null
    if (s) {
      siteName = s.name
      siteAddress = [s.address, s.postcode].filter(Boolean).join(', ') || null
      contactName = s.contact_name
      if (s.contact_email) recipients.push(s.contact_email)
      if (Array.isArray(s.reporting_emails)) {
        for (const e of s.reporting_emails) {
          if (typeof e === 'string') recipients.push(e)
        }
      }
    }
  }

  if (ctx.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('contact_email, contact_name')
      .eq('id', ctx.clientId)
      .single()
    const c = client as { contact_email: string | null; contact_name: string | null } | null
    if (c?.contact_email) recipients.push(c.contact_email)
    if (!contactName && c?.contact_name) contactName = c.contact_name
  }

  if (recipients.length === 0) return

  const companyName = process.env.COMPANY_NAME || 'Pyrocel'
  const title = `${ctx.callTypeName} — ${siteName}`

  await sendBookingConfirmation(recipients, {
    contactName,
    siteName,
    siteAddress,
    callTypeName: ctx.callTypeName,
    dateLabel: formatDateLabel(ctx.scheduledDate),
    timeLabel: formatTimeLabel(ctx.startTime, ctx.endTime),
    notes: ctx.notes,
    companyName,
    event: {
      title,
      description: [ctx.callTypeName, siteName, ctx.notes].filter(Boolean).join(' — '),
      location: siteAddress,
      date: ctx.scheduledDate,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      uid: ctx.taskId,
      organiserName: companyName,
    },
  })
}

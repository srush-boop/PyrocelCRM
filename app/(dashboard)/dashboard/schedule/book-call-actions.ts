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
      .select('site_id, service_type_id, service_type:service_types(system_type_id)')
      .eq('id', input.siteServiceId)
      .single()
    const ssRow = ss as
      | { site_id: string; service_type_id: string; service_type: { system_type_id: string | null } | null }
      | null
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

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/schedule/map')
  if (input.siteId) revalidatePath(`/dashboard/sites/${input.siteId}`)

  return { ok: true, taskId }
}

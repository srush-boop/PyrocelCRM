'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'

interface ActionResult {
  ok: boolean
  error?: string
  taskId?: string
}

async function requireOfficeOrAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, role: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role ?? null
  return { supabase, user, role }
}

/** Columns copied onto the new (rebooked) call from the original no-access call. */
const CARRY_OVER_SELECT =
  'id, status, site_id, site_service_id, service_type_id, system_type_id, visit_type_id, ' +
  'client_id, is_emergency, respond_by, attend_time_minutes, expected_on_site_minutes, ' +
  'source_job_id, is_commissioning, notes, reference_number, charge_review_status, ' +
  'no_access_at, no_access_resolved_at'

interface RearrangeInput {
  taskId: string
  /** Engineer to assign the new call to (optional — can be left unassigned). */
  engineerId?: string | null
  /** yyyy-MM-dd for the new visit. */
  scheduledDate: string
  bookedStartTime?: string | null
  bookedEndTime?: string | null
  /** Note recording the client contact made when rearranging (required). */
  contactNote: string
  /**
   * Charge the client an attendance fee for the wasted visit. Only applies to
   * non-recurring calls (reactive / planned) — routes the ORIGINAL call to the
   * chargeable review queue.
   */
  chargeAttendance: boolean
}

/**
 * Office action: contact the client and rearrange a call the engineer returned
 * as "no access". Creates a NEW linked call (a fresh attempt) copying the
 * original's anchors, marks the original resolved='rearranged', and — for
 * non-recurring calls, when requested — flags the original as chargeable so an
 * attendance fee can be invoiced via the existing charge-review queue.
 */
export async function rearrangeNoAccessCall(input: RearrangeInput): Promise<ActionResult> {
  const { supabase, user, role } = await requireOfficeOrAdmin()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (role !== 'admin' && role !== 'office') {
    return { ok: false, error: 'You do not have permission to rearrange calls.' }
  }

  const contactNote = (input.contactNote ?? '').trim()
  if (contactNote.length < 3) {
    return { ok: false, error: 'Please record how the client was contacted.' }
  }
  if (!input.scheduledDate) return { ok: false, error: 'Choose a date for the new visit.' }

  const start = input.bookedStartTime || null
  const end = input.bookedEndTime || null
  if (start && end && end <= start) {
    return { ok: false, error: 'End time must be after the start time.' }
  }

  const { data: task } = await supabase
    .from('tasks')
    .select(CARRY_OVER_SELECT)
    .eq('id', input.taskId)
    .single()
  const t = task as
    | {
        id: string
        status: string
        site_id: string | null
        site_service_id: string | null
        service_type_id: string | null
        system_type_id: string | null
        visit_type_id: string | null
        client_id: string | null
        is_emergency: boolean | null
        respond_by: string | null
        attend_time_minutes: number | null
        expected_on_site_minutes: number | null
        source_job_id: string | null
        is_commissioning: boolean | null
        notes: string | null
        reference_number: string | null
        charge_review_status: string | null
        no_access_at: string | null
        no_access_resolved_at: string | null
      }
    | null
  if (!t) return { ok: false, error: 'Call not found.' }
  if (!t.no_access_at) return { ok: false, error: 'This call is not marked no access.' }
  if (t.no_access_resolved_at) {
    return { ok: false, error: 'This no-access call has already been actioned.' }
  }

  const isNonRecurring = !t.site_service_id

  // Create the new (rebooked) call — a fresh pending attempt.
  const rebookNote = [`Rebooked after no access. ${contactNote}`, t.notes?.trim() || null]
    .filter(Boolean)
    .join('\n\n')
  const { data: inserted, error: insertError } = await supabase
    .from('tasks')
    .insert({
      site_id: t.site_id,
      site_service_id: t.site_service_id,
      service_type_id: t.service_type_id,
      system_type_id: t.system_type_id,
      visit_type_id: t.visit_type_id,
      client_id: t.client_id,
      is_emergency: t.is_emergency ?? false,
      respond_by: t.respond_by,
      attend_time_minutes: t.attend_time_minutes,
      expected_on_site_minutes: t.expected_on_site_minutes,
      source_job_id: t.source_job_id,
      is_commissioning: t.is_commissioning ?? false,
      assigned_engineer_id: input.engineerId || null,
      assigned_at: input.engineerId ? new Date().toISOString() : null,
      scheduled_date: input.scheduledDate,
      booked_start_time: start,
      booked_end_time: end,
      status: 'pending',
      notes: rebookNote || null,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.log('[v0] rearrangeNoAccessCall insert failed:', insertError?.message)
    return { ok: false, error: 'Failed to create the new call. Please try again.' }
  }
  const newTaskId = (inserted as { id: string }).id

  // Resolve the original call. Optionally flag it chargeable (attendance fee) for
  // non-recurring calls — never downgrade a review already completed.
  const update: Record<string, unknown> = {
    no_access_resolved_at: new Date().toISOString(),
    no_access_resolved_by: user.id,
    no_access_resolution: 'rearranged',
    no_access_rebooked_task_id: newTaskId,
  }
  const willCharge = input.chargeAttendance && isNonRecurring
  if (willCharge && t.charge_review_status !== 'reviewed') {
    update.chargeable = true
    update.charge_review_status = 'pending'
    update.charge_reason = 'manual'
  }
  await supabase.from('tasks').update(update).eq('id', input.taskId)

  await logAudit({
    action: 'call.book',
    entityType: 'call',
    entityId: newTaskId,
    targetLabel: t.reference_number ? `Rebooked ${t.reference_number}` : 'Rebooked call',
    metadata: {
      rearrangedFrom: input.taskId,
      scheduledDate: input.scheduledDate,
      chargeAttendance: willCharge,
    },
  })

  revalidatePath('/dashboard/service')
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/schedule/map')
  revalidatePath(`/dashboard/tasks/${input.taskId}`)
  if (willCharge) revalidatePath('/dashboard/chargeable')
  if (t.site_id) revalidatePath(`/dashboard/sites/${t.site_id}`)

  return { ok: true, taskId: newTaskId }
}

interface DismissInput {
  taskId: string
  /** Note recording the outcome / why it was closed without rebooking. */
  note: string
}

/**
 * Office action: close out a no-access call WITHOUT rebooking (e.g. the client
 * no longer wants the visit). Records the outcome and clears it from the queue.
 */
export async function dismissNoAccessCall(input: DismissInput): Promise<ActionResult> {
  const { supabase, user, role } = await requireOfficeOrAdmin()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (role !== 'admin' && role !== 'office') {
    return { ok: false, error: 'You do not have permission to action calls.' }
  }

  const note = (input.note ?? '').trim()
  if (note.length < 3) {
    return { ok: false, error: 'Please record why this is being closed.' }
  }

  const { data: task } = await supabase
    .from('tasks')
    .select('id, site_id, no_access_at, no_access_resolved_at, notes')
    .eq('id', input.taskId)
    .single()
  const t = task as
    | { id: string; site_id: string | null; no_access_at: string | null; no_access_resolved_at: string | null; notes: string | null }
    | null
  if (!t) return { ok: false, error: 'Call not found.' }
  if (!t.no_access_at) return { ok: false, error: 'This call is not marked no access.' }
  if (t.no_access_resolved_at) {
    return { ok: false, error: 'This no-access call has already been actioned.' }
  }

  await supabase
    .from('tasks')
    .update({
      no_access_resolved_at: new Date().toISOString(),
      no_access_resolved_by: user.id,
      no_access_resolution: 'dismissed',
      notes: [t.notes?.trim() || null, `No access closed without rebooking: ${note}`]
        .filter(Boolean)
        .join('\n\n'),
    })
    .eq('id', input.taskId)

  revalidatePath('/dashboard/service')
  revalidatePath(`/dashboard/tasks/${input.taskId}`)
  if (t.site_id) revalidatePath(`/dashboard/sites/${t.site_id}`)

  return { ok: true, taskId: input.taskId }
}

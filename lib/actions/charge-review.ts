'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'

// Server actions backing the Chargeable Calls review flow. A completed call is
// flagged chargeable automatically (service-type default OR parts used); office
// and admin then review it here before it feeds invoicing. Only office/admin
// may change charge/review state — engineers and clients cannot.

type ChargeReviewAction =
  | { kind: 'reviewed' }
  | { kind: 'reopen' }
  | { kind: 'set_chargeable'; chargeable: boolean }
  | { kind: 'invoiced' }
  | { kind: 'uninvoiced' }
  | { kind: 'set_client_ref'; clientRef: string | null }
  | { kind: 'set_deadline_failed'; reason: string; note: string | null }
  | { kind: 'set_po_not_required'; value: boolean }

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'id' | 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return { supabase, userId: user.id }
}

export async function setChargeReview(
  taskId: string,
  action: ChargeReviewAction,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const update: Record<string, unknown> = {}

  if (action.kind === 'reviewed') {
    update.charge_review_status = 'reviewed'
    update.charge_reviewed_at = new Date().toISOString()
    update.charge_reviewed_by = userId
  } else if (action.kind === 'reopen') {
    update.charge_review_status = 'pending'
    update.charge_reviewed_at = null
    update.charge_reviewed_by = null
  } else if (action.kind === 'set_chargeable') {
    update.chargeable = action.chargeable
    if (action.chargeable) {
      // Manual override to chargeable puts the call into the review queue.
      update.charge_reason = 'manual'
      update.charge_review_status = 'pending'
      update.charge_reviewed_at = null
      update.charge_reviewed_by = null
    } else {
      // No longer chargeable: clear it out of the review queue entirely.
      update.charge_review_status = 'none'
      update.charge_reason = null
      update.charge_reviewed_at = null
      update.charge_reviewed_by = null
    }
  } else if (action.kind === 'invoiced') {
    update.charge_invoiced_at = new Date().toISOString()
    update.charge_invoiced_by = userId
  } else if (action.kind === 'uninvoiced') {
    update.charge_invoiced_at = null
    update.charge_invoiced_by = null
  } else if (action.kind === 'set_client_ref') {
    update.client_ref = action.clientRef
  } else if (action.kind === 'set_deadline_failed') {
    update.deadline_failed_reason = action.reason
    update.deadline_failed_note = action.note
  } else if (action.kind === 'set_po_not_required') {
    update.po_not_required = action.value
  }

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
  if (error) {
    console.error('[v0] setChargeReview error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

// The review can't be closed until every applicable point is resolved. We
// re-check these gates on the server (not just in the UI) so the state can't be
// forced by a stale/hand-rolled request.
export interface ReviewGates {
  missedDeadline: boolean
  deadlineReasonSatisfied: boolean
  poRequired: boolean
  poSatisfied: boolean
  chargeable: boolean
}

async function computeGates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
): Promise<{ error: string } | { error: null; gates: ReviewGates }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      chargeable,
      respond_by,
      completed_at,
      deadline_failed_reason,
      client_ref,
      po_not_required,
      site_service:site_services(sites(clients(requires_po))),
      direct_site:sites!tasks_site_id_fkey(clients(requires_po))
    `)
    .eq('id', taskId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Call not found' }
  const t = data as any

  const missedDeadline =
    !!t.respond_by && !!t.completed_at && new Date(t.completed_at) > new Date(t.respond_by)
  const deadlineReasonSatisfied = !missedDeadline || !!t.deadline_failed_reason

  const siteServiceRow = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
  const client = siteServiceRow?.sites?.clients || t.direct_site?.clients
  const clientRequiresPo = !!client?.requires_po
  const poRequired = clientRequiresPo && !t.po_not_required
  const poSatisfied = !poRequired || !!(t.client_ref && String(t.client_ref).trim())

  return {
    error: null,
    gates: {
      missedDeadline,
      deadlineReasonSatisfied,
      poRequired,
      poSatisfied,
      chargeable: !!t.chargeable,
    },
  }
}

/**
 * Close a NON-chargeable review. Requires the missed-deadline reason to be
 * resolved. Marks the call reviewed without invoicing.
 */
export async function markReviewedAndClose(
  taskId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const g = await computeGates(supabase, taskId)
  if (g.error !== null) return { error: g.error }
  if (!g.gates.deadlineReasonSatisfied) {
    return { error: 'Enter a reason for missing the deadline before closing.' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      charge_review_status: 'reviewed',
      charge_reviewed_at: new Date().toISOString(),
      charge_reviewed_by: userId,
    })
    .eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

/**
 * Close a CHARGEABLE review and submit it for invoicing. Requires the
 * missed-deadline reason AND the PO (where the client requires one) to be
 * resolved. Marks reviewed + invoiced in one gated step.
 */
export async function submitForInvoicing(
  taskId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const g = await computeGates(supabase, taskId)
  if (g.error !== null) return { error: g.error }
  if (!g.gates.chargeable) {
    return { error: 'This call is not marked chargeable.' }
  }
  if (!g.gates.deadlineReasonSatisfied) {
    return { error: 'Enter a reason for missing the deadline before submitting.' }
  }
  if (!g.gates.poSatisfied) {
    return { error: 'A PO number is required by this client. Enter it or mark PO not required.' }
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('tasks')
    .update({
      charge_review_status: 'reviewed',
      charge_reviewed_at: now,
      charge_reviewed_by: userId,
      charge_invoiced_at: now,
      charge_invoiced_by: userId,
    })
    .eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

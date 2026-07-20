'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/notifications'
import { summariseFollowUp } from '@/lib/ai/summarise-follow-up'
import {
  PLANNED_CALL_SERVICE_TYPE_ID,
  SERVICE_MANAGER_ROLE_ID,
  STORES_PERSON_ROLE_ID,
  shouldEscalate,
} from '@/lib/follow-up'

// Server actions for the Follow-Up Calls flow:
//  engineer flags "further works required" → office reviews (reserve/order
//  parts) → linked Planned Call is created → fix attempts tracked → a 3rd-visit
//  failure escalates to the Service Manager.

interface StaffCtx {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  role: string
}

async function requireStaff(): Promise<{ ctx?: StaffCtx; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office', 'engineer'].includes(role)) {
    return { error: 'You do not have permission for this action.' }
  }
  return { ctx: { supabase, userId: user.id, role } }
}

async function requireOffice(): Promise<{ ctx?: StaffCtx; error?: string }> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { error: error ?? 'Not authorised.' }
  if (!['admin', 'office'].includes(ctx.role)) {
    return { error: 'Only office staff can review follow-ups.' }
  }
  return { ctx }
}

/** Resolve profile ids that hold a given descriptive role (roles.id). */
async function profilesWithRole(
  supabase: StaffCtx['supabase'],
  roleId: string,
): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').eq('role_id', roleId)
  return (data ?? []).map((r) => (r as { id: string }).id)
}

export interface FollowUpPartInput {
  partId?: string | null
  description?: string | null
  quantity: number
}

export interface ActionResult {
  ok: boolean
  error?: string
  id?: string
}

/**
 * Engineer classifies a non-recurring call as "further works required". Completes
 * the original call, marks emergency originals as first-time-fix = NO, pushes the
 * original into the Chargeable Calls review queue, and creates a pending
 * follow-up request (with suggested parts) for the office to review.
 */
export async function raiseFollowUp(input: {
  originalTaskId: string
  issueSummary: string
  parts?: FollowUpPartInput[]
}): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const summary = input.issueSummary?.trim()
  if (!summary) return { ok: false, error: 'Describe the outstanding issue.' }

  // Load the original call (with context names for the AI brief).
  const { data: taskRow, error: taskErr } = await ctx.supabase
    .from('tasks')
    .select(
      `id, site_id, is_emergency, fix_attempt, site_service_id, assigned_engineer_id, status,
       site:sites(name),
       service_type:service_types(name),
       system_type:system_types(name)`,
    )
    .eq('id', input.originalTaskId)
    .maybeSingle()
  if (taskErr || !taskRow) return { ok: false, error: 'Call not found.' }
  const rawTask = taskRow as {
    id: string
    site_id: string | null
    is_emergency: boolean
    fix_attempt: number
    site_service_id: string | null
    assigned_engineer_id: string | null
    status: string
    // Supabase embeds come back as an object or a single-element array.
    site: { name: string | null } | { name: string | null }[] | null
    service_type: { name: string | null } | { name: string | null }[] | null
    system_type: { name: string | null } | { name: string | null }[] | null
  }
  const embedOne = <T,>(x: T | T[] | null): T | null =>
    Array.isArray(x) ? x[0] ?? null : x
  const task = {
    ...rawTask,
    siteName: embedOne(rawTask.site)?.name ?? null,
    serviceTypeName: embedOne(rawTask.service_type)?.name ?? null,
    systemTypeName: embedOne(rawTask.system_type)?.name ?? null,
  }

  // Guard: one open follow-up per call.
  const { data: existing } = await ctx.supabase
    .from('follow_up_requests')
    .select('id')
    .eq('original_task_id', task.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'A follow-up is already pending review for this call.' }
  }

  const failedAttempt = task.fix_attempt ?? 1
  const escalated = shouldEscalate(failedAttempt)
  const nowIso = new Date().toISOString()

  // Build a human-readable list of the suggested parts for the AI brief:
  // resolve names for catalogue parts, use the free-text description otherwise.
  const partInputs = input.parts ?? []
  const partIds = partInputs
    .map((p) => p.partId)
    .filter((id): id is string => !!id && id.length > 0)
  let partNameById = new Map<string, string>()
  if (partIds.length > 0) {
    const { data: partRows } = await ctx.supabase
      .from('parts')
      .select('id, name')
      .in('id', partIds)
    partNameById = new Map(
      (partRows ?? []).map((r) => [(r as { id: string }).id, (r as { name: string }).name]),
    )
  }
  const partLines = partInputs
    .map((p) => {
      const name = p.partId
        ? partNameById.get(p.partId) ?? 'Part'
        : (p.description?.trim() ?? '')
      return name ? { name, quantity: Math.max(1, Math.floor(p.quantity) || 1) } : null
    })
    .filter((p): p is { name: string; quantity: number } => p !== null)

  // AI-summarise WHAT IS REQUIRED for the return visit. Best-effort: on failure
  // we store null and fall back to the raw issue text when the call is created.
  let aiSummary: string | null = null
  try {
    const res = await summariseFollowUp({
      issueSummary: summary,
      parts: partLines,
      siteName: task.siteName,
      serviceType: task.serviceTypeName,
      systemType: task.systemTypeName,
      isEmergency: task.is_emergency,
      fixAttempt: failedAttempt + 1,
    })
    if (res.ok && res.text) aiSummary = res.text
  } catch (err) {
    console.log('[v0] raiseFollowUp summary failed:', (err as Error).message)
  }

  // Complete the original call + first-time-fix + chargeable review routing.
  const taskUpdate: Record<string, unknown> = {
    status: 'completed',
    completed_at: task.status === 'completed' ? undefined : nowIso,
    chargeable: true,
    charge_review_status: 'pending',
    charge_reason: 'manual',
    updated_at: nowIso,
  }
  if (task.is_emergency) taskUpdate.first_time_fix = false
  // Strip undefined so we don't overwrite an existing completed_at with null.
  Object.keys(taskUpdate).forEach((k) => taskUpdate[k] === undefined && delete taskUpdate[k])
  await ctx.supabase.from('tasks').update(taskUpdate).eq('id', task.id)

  // Create the follow-up request.
  const { data: reqRow, error: reqErr } = await ctx.supabase
    .from('follow_up_requests')
    .insert({
      original_task_id: task.id,
      site_id: task.site_id,
      requested_by: ctx.userId,
      fix_attempt: failedAttempt + 1,
      issue_summary: summary,
      ai_summary: aiSummary,
      status: 'pending',
      escalated,
      escalated_at: escalated ? nowIso : null,
    })
    .select('id')
    .single()
  if (reqErr || !reqRow) {
    console.log('[v0] raiseFollowUp insert failed:', reqErr?.message)
    return { ok: false, error: 'Could not raise the follow-up.' }
  }
  const requestId = (reqRow as { id: string }).id

  // Suggested parts.
  const partRows = (input.parts ?? [])
    .filter((p) => (p.partId && p.partId.length > 0) || (p.description && p.description.trim()))
    .map((p) => ({
      request_id: requestId,
      part_id: p.partId || null,
      description: p.description?.trim() || null,
      quantity: Math.max(1, Math.floor(p.quantity) || 1),
    }))
  if (partRows.length > 0) {
    await ctx.supabase.from('follow_up_parts').insert(partRows)
  }

  // Notify office/admin of the new follow-up to review.
  try {
    const { data: officeProfiles } = await ctx.supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'office'])
    const officeIds = (officeProfiles ?? []).map((r) => (r as { id: string }).id)
    if (officeIds.length > 0) {
      await notifyUsers({
        userIds: officeIds,
        title: 'Follow-up call needs review',
        body: summary.slice(0, 140),
        url: `/dashboard/follow-ups?id=${requestId}`,
        category: 'follow_up',
        createdBy: ctx.userId,
      })
    }

    // Escalation → Service Managers.
    if (escalated) {
      const managers = await profilesWithRole(ctx.supabase, SERVICE_MANAGER_ROLE_ID)
      if (managers.length > 0) {
        await notifyUsers({
          userIds: managers,
          title: 'Escalation: repeated fix failure',
          body: 'A third visit has failed to resolve the issue. Review required.',
          url: `/dashboard/follow-ups?id=${requestId}`,
          category: 'follow_up_escalation',
          createdBy: ctx.userId,
        })
      }
    }
  } catch (err) {
    console.log('[v0] raiseFollowUp notify failed:', (err as Error).message)
  }

  revalidatePath('/dashboard/follow-ups')
  revalidatePath('/dashboard/service')
  if (task.site_id) revalidatePath(`/dashboard/sites/${task.site_id}`)
  return { ok: true, id: requestId }
}

/** Reserve a suggested part at a stock location; notifies the location owner. */
export async function reserveFollowUpPart(
  partRowId: string,
  locationId: string,
): Promise<ActionResult> {
  const { ctx, error } = await requireOffice()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: partRow } = await ctx.supabase
    .from('follow_up_parts')
    .select('id, request_id, part_id, description, quantity')
    .eq('id', partRowId)
    .maybeSingle()
  if (!partRow) return { ok: false, error: 'Part line not found.' }
  const part = partRow as {
    request_id: string
    part_id: string | null
    description: string | null
    quantity: number
  }

  await ctx.supabase
    .from('follow_up_parts')
    .update({ action: 'reserve', location_id: locationId, reservation_status: 'pending', location_ref: null })
    .eq('id', partRowId)

  // Notify the location owner: a van's engineer, else all Stores Persons.
  try {
    const { data: loc } = await ctx.supabase
      .from('stock_locations')
      .select('name, kind, engineer_id')
      .eq('id', locationId)
      .maybeSingle()
    const location = loc as { name: string; kind: string; engineer_id: string | null } | null
    let recipients: string[] = []
    if (location?.kind === 'van' && location.engineer_id) {
      recipients = [location.engineer_id]
    } else {
      recipients = await profilesWithRole(ctx.supabase, STORES_PERSON_ROLE_ID)
    }
    if (recipients.length > 0) {
      await notifyUsers({
        userIds: recipients,
        title: 'Parts reservation requested',
        body: `Please confirm and locate: ${part.description || 'part'} × ${part.quantity} at ${location?.name ?? 'stores'}.`,
        url: `/dashboard/follow-ups?id=${part.request_id}`,
        category: 'parts_reservation',
        createdBy: ctx.userId,
      })
    }
  } catch (err) {
    console.log('[v0] reserveFollowUpPart notify failed:', (err as Error).message)
  }

  revalidatePath('/dashboard/follow-ups')
  return { ok: true }
}

/** Stores person confirms a reservation and records where it's held in stores. */
export async function confirmFollowUpPart(
  partRowId: string,
  locationRef: string,
): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: partRow } = await ctx.supabase
    .from('follow_up_parts')
    .select('id, request_id, description, quantity, request:follow_up_requests(requested_by)')
    .eq('id', partRowId)
    .maybeSingle()
  if (!partRow) return { ok: false, error: 'Part line not found.' }
  const rawPart = partRow as {
    request_id: string
    description: string | null
    quantity: number
    request: { requested_by: string | null } | { requested_by: string | null }[] | null
  }
  const part = {
    request_id: rawPart.request_id,
    description: rawPart.description,
    quantity: rawPart.quantity,
    request: Array.isArray(rawPart.request) ? rawPart.request[0] ?? null : rawPart.request,
  }

  await ctx.supabase
    .from('follow_up_parts')
    .update({ reservation_status: 'confirmed', location_ref: locationRef.trim() || null })
    .eq('id', partRowId)

  // Let the requesting engineer know where the parts are held.
  try {
    if (part.request?.requested_by) {
      await notifyUsers({
        userIds: [part.request.requested_by],
        title: 'Parts reserved and located',
        body: `${part.description || 'Part'} × ${part.quantity} held at: ${locationRef}.`,
        url: `/dashboard/follow-ups?id=${part.request_id}`,
        category: 'parts_reservation',
        createdBy: ctx.userId,
      })
    }
  } catch (err) {
    console.log('[v0] confirmFollowUpPart notify failed:', (err as Error).message)
  }

  revalidatePath('/dashboard/follow-ups')
  return { ok: true }
}

/** Flag a suggested part to be ordered; notifies Stores Persons to raise it. */
export async function orderFollowUpPart(partRowId: string): Promise<ActionResult> {
  const { ctx, error } = await requireOffice()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: partRow } = await ctx.supabase
    .from('follow_up_parts')
    .select('id, request_id, description, quantity')
    .eq('id', partRowId)
    .maybeSingle()
  if (!partRow) return { ok: false, error: 'Part line not found.' }
  const part = partRow as { request_id: string; description: string | null; quantity: number }

  await ctx.supabase
    .from('follow_up_parts')
    .update({ action: 'order', location_id: null, reservation_status: null, location_ref: null })
    .eq('id', partRowId)

  try {
    const stores = await profilesWithRole(ctx.supabase, STORES_PERSON_ROLE_ID)
    if (stores.length > 0) {
      await notifyUsers({
        userIds: stores,
        title: 'Parts order required',
        body: `Please order: ${part.description || 'part'} × ${part.quantity} for a follow-up call.`,
        url: `/dashboard/follow-ups?id=${part.request_id}`,
        category: 'parts_order',
        createdBy: ctx.userId,
      })
    }
  } catch (err) {
    console.log('[v0] orderFollowUpPart notify failed:', (err as Error).message)
  }

  revalidatePath('/dashboard/follow-ups')
  return { ok: true }
}

/** Clear a part line's action back to none. */
export async function clearFollowUpPartAction(partRowId: string): Promise<ActionResult> {
  const { ctx, error } = await requireOffice()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }
  await ctx.supabase
    .from('follow_up_parts')
    .update({ action: 'none', location_id: null, reservation_status: null, location_ref: null })
    .eq('id', partRowId)
  revalidatePath('/dashboard/follow-ups')
  return { ok: true }
}

/**
 * Approve a follow-up: create the linked Planned Call (with the follow-up chain
 * and fix-attempt carried over), copy any reserved/ordered parts onto the new
 * call, and close the request.
 */
export async function approveFollowUp(
  requestId: string,
  input: { scheduledDate: string; assignedEngineerId?: string | null },
): Promise<ActionResult> {
  const { ctx, error } = await requireOffice()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  if (!input.scheduledDate) return { ok: false, error: 'Choose a date for the follow-up call.' }

  const { data: reqRow } = await ctx.supabase
    .from('follow_up_requests')
    .select('id, original_task_id, site_id, fix_attempt, issue_summary, ai_summary, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!reqRow) return { ok: false, error: 'Follow-up not found.' }
  const req = reqRow as {
    original_task_id: string
    site_id: string | null
    fix_attempt: number
    issue_summary: string
    ai_summary: string | null
    status: string
  }
  if (req.status !== 'pending') return { ok: false, error: 'This follow-up has already been reviewed.' }

  // Copy anchors from the original call.
  const { data: origRow } = await ctx.supabase
    .from('tasks')
    .select('site_id, service_type_id, system_type_id, client_id')
    .eq('id', req.original_task_id)
    .maybeSingle()
  const orig = (origRow ?? {}) as {
    site_id?: string | null
    service_type_id?: string | null
    system_type_id?: string | null
    client_id?: string | null
  }

  // Create the linked Planned Call.
  const nowIso = new Date().toISOString()
  const { data: newTask, error: insErr } = await ctx.supabase
    .from('tasks')
    .insert({
      site_service_id: null,
      site_id: req.site_id ?? orig.site_id ?? null,
      service_type_id: PLANNED_CALL_SERVICE_TYPE_ID,
      system_type_id: orig.system_type_id ?? null,
      client_id: orig.client_id ?? null,
      assigned_engineer_id: input.assignedEngineerId || null,
      assigned_at: input.assignedEngineerId ? nowIso : null,
      scheduled_date: input.scheduledDate,
      status: 'pending',
      is_emergency: false,
      follow_up_to_id: req.original_task_id,
      fix_attempt: req.fix_attempt,
      // Prefer the AI brief of the works required; fall back to the raw issue
      // text if generation was unavailable when the follow-up was raised.
      notes: req.ai_summary?.trim()
        ? `Follow-up works required:\n\n${req.ai_summary.trim()}\n\nEngineer's original account:\n${req.issue_summary}`
        : `Follow-up works.\n\nOutstanding issue:\n${req.issue_summary}`,
    })
    .select('id')
    .single()
  if (insErr || !newTask) {
    console.log('[v0] approveFollowUp create task failed:', insErr?.message)
    return { ok: false, error: 'Could not create the follow-up call.' }
  }
  const newTaskId = (newTask as { id: string }).id

  // Copy actioned parts onto the new call (call_parts) so the attending engineer
  // sees exactly what's held / on order and where.
  const { data: parts } = await ctx.supabase
    .from('follow_up_parts')
    .select('part_id, quantity, action, location_id, location_ref, description')
    .eq('request_id', requestId)
    .neq('action', 'none')

  // Snapshot the current catalogue unit cost (parts.unit_cost is £ numeric) onto
  // each call_part so the completed call carries a cost for profitability and
  // invoicing, rather than leaving it blank. Sale price is still set by the
  // office during chargeable review.
  const partIds = [
    ...new Set(
      (parts ?? [])
        .map((p) => (p as { part_id: string | null }).part_id)
        .filter((id): id is string => !!id),
    ),
  ]
  const costByPartId = new Map<string, number>()
  if (partIds.length > 0) {
    const { data: partRows } = await ctx.supabase
      .from('parts')
      .select('id, unit_cost')
      .in('id', partIds)
    for (const pr of (partRows ?? []) as { id: string; unit_cost: number | string | null }[]) {
      const cost = typeof pr.unit_cost === 'string' ? Number(pr.unit_cost) : pr.unit_cost
      if (cost != null && !Number.isNaN(cost)) {
        costByPartId.set(pr.id, Math.round(cost * 100))
      }
    }
  }

  const callParts = (parts ?? [])
    .filter((p) => (p as { part_id: string | null }).part_id)
    .map((p) => {
      const row = p as {
        part_id: string
        quantity: number
        action: string
        location_id: string | null
        location_ref: string | null
        description: string | null
      }
      const noteBits = [
        row.action === 'reserve' ? 'Reserved' : 'On order',
        row.location_ref ? `@ ${row.location_ref}` : null,
      ].filter(Boolean)
      return {
        task_id: newTaskId,
        part_id: row.part_id,
        quantity: row.quantity,
        stock_location_id: row.location_id,
        unit_cost_pence: costByPartId.get(row.part_id) ?? null,
        notes: noteBits.join(' '),
      }
    })
  if (callParts.length > 0) {
    await ctx.supabase.from('call_parts').insert(callParts)
  }

  // Close the request.
  await ctx.supabase
    .from('follow_up_requests')
    .update({
      status: 'approved',
      reviewed_by: ctx.userId,
      reviewed_at: nowIso,
      proposed_date: input.scheduledDate,
      assigned_engineer_id: input.assignedEngineerId || null,
      created_task_id: newTaskId,
      resolved_at: nowIso,
    })
    .eq('id', requestId)

  revalidatePath('/dashboard/follow-ups')
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/service')
  if (req.site_id) revalidatePath(`/dashboard/sites/${req.site_id}`)
  return { ok: true, id: newTaskId }
}

/** Reject a follow-up request with a reason. */
export async function rejectFollowUp(requestId: string, reason: string): Promise<ActionResult> {
  const { ctx, error } = await requireOffice()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }
  await ctx.supabase
    .from('follow_up_requests')
    .update({
      status: 'rejected',
      reject_reason: reason?.trim() || null,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  revalidatePath('/dashboard/follow-ups')
  revalidatePath('/dashboard/service')
  return { ok: true }
}

/** Service Manager clears an escalation once it has been dealt with. */
export async function resolveEscalation(requestId: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }
  // Admin or Service Manager only.
  let allowed = ctx.role === 'admin'
  if (!allowed) {
    const { data: prof } = await ctx.supabase
      .from('profiles')
      .select('role_id')
      .eq('id', ctx.userId)
      .maybeSingle()
    allowed = (prof as { role_id?: string } | null)?.role_id === SERVICE_MANAGER_ROLE_ID
  }
  if (!allowed) return { ok: false, error: 'Only the Service Manager can clear escalations.' }

  // Clear only the escalation flag — the request itself stays pending until it is
  // approved into a call or rejected.
  await ctx.supabase
    .from('follow_up_requests')
    .update({ escalated: false, escalated_at: null })
    .eq('id', requestId)
  revalidatePath('/dashboard/service')
  revalidatePath('/dashboard/follow-ups')
  return { ok: true }
}

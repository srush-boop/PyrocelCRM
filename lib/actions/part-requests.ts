'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/notifications'

type Result = { ok: boolean; error?: string; message?: string }

type RequestRow = {
  id: string
  part_id: string
  location_id: string
  requested_by: string
  quantity: number
  collected_qty: number
  status: string
  part: { name: string } | null
  location: { name: string; engineer_id: string | null } | null
}

async function loadContext(requestId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const [{ data: profile }, { data: request }] = await Promise.all([
    supabase.from('profiles').select('id, role, full_name').eq('id', user.id).single(),
    supabase
      .from('part_requests')
      .select(
        'id, part_id, location_id, requested_by, quantity, collected_qty, status, part:parts(name), location:stock_locations!part_requests_location_id_fkey(name, engineer_id)',
      )
      .eq('id', requestId)
      .maybeSingle(),
  ])
  if (!profile) return { error: 'Not authorised' as const }
  if (!request) return { error: 'Request not found' as const }

  const req = request as unknown as RequestRow
  const role = (profile as { role: string }).role
  return {
    supabase,
    userId: user.id,
    userName: (profile as { full_name: string | null }).full_name || 'Someone',
    req,
    isManager: role === 'admin' || role === 'office',
    isOwner: req.location?.engineer_id === user.id,
    isRequester: req.requested_by === user.id,
  }
}

function revalidate() {
  revalidatePath('/dashboard/stock')
  revalidatePath('/dashboard')
}

/**
 * Record that some or all of a requested part has been collected. Stock is
 * adjusted immediately: moved from the source location into the requester's
 * van (a transfer), or booked out as usage if they have no van. Partial
 * collections keep the request open until the full quantity is collected.
 */
export async function collectPartRequest(input: {
  requestId: string
  quantity: number
}): Promise<Result> {
  const ctx = await loadContext(input.requestId)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase, req, userId, userName } = ctx

  if (!ctx.isManager && !ctx.isOwner && !ctx.isRequester) {
    return { ok: false, error: 'Not authorised' }
  }
  if (req.status !== 'pending' && req.status !== 'approved') {
    return { ok: false, error: 'This request is already closed' }
  }

  const remaining = req.quantity - req.collected_qty
  const qty = Math.floor(input.quantity)
  if (!qty || qty < 1) return { ok: false, error: 'Enter a quantity of at least 1' }
  if (qty > remaining) return { ok: false, error: `Only ${remaining} left to collect` }

  const { data: van } = await supabase
    .from('stock_locations')
    .select('id')
    .eq('engineer_id', req.requested_by)
    .eq('is_active', true)
    .neq('id', req.location_id)
    .limit(1)
    .maybeSingle()
  const toLocationId = (van as { id: string } | null)?.id ?? null

  const newCollected = req.collected_qty + qty
  const fullyCollected = newCollected >= req.quantity
  const now = new Date().toISOString()

  // Claim the quantity first (guarded on the previous count) so two people
  // collecting at once can't both move stock for the same units.
  const { data: claimed, error: claimError } = await supabase
    .from('part_requests')
    .update({
      collected_qty: newCollected,
      status: fullyCollected ? 'collected' : 'approved',
      collected_at: now,
      collected_by: userId,
      to_location_id: toLocationId,
      resolved_by: fullyCollected ? userId : null,
      resolved_at: fullyCollected ? now : null,
      updated_at: now,
    })
    .eq('id', req.id)
    .eq('collected_qty', req.collected_qty)
    .select('id')
  if (claimError) return { ok: false, error: claimError.message }
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: 'This request was just updated by someone else — refresh and try again' }
  }

  const { error: moveError } = await supabase.rpc('record_stock_movement', {
    p_part_id: req.part_id,
    p_quantity: qty,
    p_type: toLocationId ? 'transfer' : 'usage',
    p_from_location_id: req.location_id,
    p_to_location_id: toLocationId,
    p_notes: `Collected against part request (${qty} of ${req.quantity})`,
  })

  if (moveError) {
    await supabase
      .from('part_requests')
      .update({
        collected_qty: req.collected_qty,
        status: req.status,
        resolved_by: null,
        resolved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.id)
    const msg = moveError.message.includes('Not enough stock')
      ? `Not enough stock at ${req.location?.name ?? 'the source location'}`
      : moveError.message
    return { ok: false, error: msg }
  }

  if (req.requested_by !== userId) {
    await notifyUsers({
      userIds: [req.requested_by],
      title: fullyCollected ? 'Part collected' : 'Part partly collected',
      body: `${userName} marked ${qty}× ${req.part?.name ?? 'part'} as collected from ${req.location?.name ?? 'stock'}.`,
      url: '/dashboard/stock#part-requests',
      category: 'part_request',
      data: { partRequestId: req.id },
      createdBy: userId,
    })
  }

  revalidate()
  return {
    ok: true,
    message: fullyCollected
      ? 'Collected — stock updated'
      : `${qty} collected — ${req.quantity - newCollected} still to collect`,
  }
}

/** The location holder (or office) declines a request. */
export async function declinePartRequest(input: {
  requestId: string
  reason: string
}): Promise<Result> {
  const ctx = await loadContext(input.requestId)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase, req, userId, userName } = ctx

  if (!ctx.isManager && !ctx.isOwner) return { ok: false, error: 'Not authorised' }
  if (req.status !== 'pending' && req.status !== 'approved') {
    return { ok: false, error: 'This request is already closed' }
  }
  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, error: 'Give a short reason' }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('part_requests')
    .update({
      status: 'declined',
      resolution_note: reason,
      resolved_by: userId,
      resolved_at: now,
      updated_at: now,
    })
    .eq('id', req.id)
  if (error) return { ok: false, error: error.message }

  if (req.requested_by !== userId) {
    await notifyUsers({
      userIds: [req.requested_by],
      title: 'Part request declined',
      body: `${userName} declined your request for ${req.part?.name ?? 'a part'}: ${reason}`,
      url: '/dashboard/stock#part-requests',
      category: 'part_request',
      data: { partRequestId: req.id },
      createdBy: userId,
    })
  }

  revalidate()
  return { ok: true, message: 'Request declined' }
}

/** The requester withdraws their own request. */
export async function cancelPartRequest(requestId: string): Promise<Result> {
  const ctx = await loadContext(requestId)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase, req, userId } = ctx

  if (!ctx.isRequester && !ctx.isManager) return { ok: false, error: 'Not authorised' }
  if (req.status !== 'pending' && req.status !== 'approved') {
    return { ok: false, error: 'This request is already closed' }
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('part_requests')
    .update({ status: 'cancelled', resolved_by: userId, resolved_at: now, updated_at: now })
    .eq('id', req.id)
  if (error) return { ok: false, error: error.message }

  revalidate()
  return { ok: true, message: 'Request cancelled' }
}

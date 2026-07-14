'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile, ContractReviewItem } from '@/lib/types/database'

// Server actions for the Contract Review workflow: reviewers (admin/office)
// amend the draft items produced from an accepted Routine Maintenance quote and
// then commit, turning drafts into live clients/sites/systems/services/charges.

async function requireReviewer() {
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

const QUEUE_PATH = '/dashboard/sales/contract-reviews'

// --- Item edits ---------------------------------------------------------

// Update a single draft item's resolution (action/link) and/or payload fields.
export async function updateContractReviewItem(
  itemId: string,
  patch: {
    action?: 'create' | 'link' | 'skip'
    linkedId?: string | null
    payload?: Record<string, unknown>
  },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireReviewer()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: item, error: loadErr } = await supabase
    .from('contract_review_items')
    .select('id, review_id, payload')
    .eq('id', itemId)
    .single()
  if (loadErr || !item) return { ok: false, error: 'Item not found.' }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.action) update.action = patch.action
  if ('linkedId' in patch) update.linked_id = patch.linkedId
  if (patch.payload) {
    update.payload = { ...(item.payload as Record<string, unknown>), ...patch.payload }
  }

  const { error } = await supabase.from('contract_review_items').update(update).eq('id', itemId)
  if (error) return { ok: false, error: 'Could not update the item.' }

  // Ensure the parent review is still editable.
  await supabase
    .from('contract_reviews')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', item.review_id)

  revalidatePath(`${QUEUE_PATH}/${item.review_id}`)
  return { ok: true }
}

export async function updateContractReviewNotes(
  reviewId: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireReviewer()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('contract_reviews')
    .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) return { ok: false, error: 'Could not save notes.' }
  revalidatePath(`${QUEUE_PATH}/${reviewId}`)
  return { ok: true }
}

export async function cancelContractReview(
  reviewId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireReviewer()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('contract_reviews')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
    .eq('status', 'draft')
  if (error) return { ok: false, error: 'Could not cancel the review.' }
  revalidatePath(QUEUE_PATH)
  revalidatePath(`${QUEUE_PATH}/${reviewId}`)
  revalidatePath('/dashboard/service')
  return { ok: true }
}

// --- Commit -------------------------------------------------------------

// The live id a 'link' item resolves to (explicit link, else the suggestion).
function resolvedLinkId(item: ContractReviewItem): string | null {
  return item.action === 'link' ? item.linked_id ?? item.suggested_id : null
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function int(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const v = payload[key]
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
}

/**
 * Commit a contract review: create/link live records in dependency order
 * (client -> site -> system -> service -> charge) and mark the site(s) live.
 *
 * Idempotent per item via `committed_id`, so a partial failure can be retried.
 */
export async function commitContractReview(
  reviewId: string,
): Promise<{ ok: boolean; error?: string; siteId?: string }> {
  const auth = await requireReviewer()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: review, error: rErr } = await supabase
    .from('contract_reviews')
    .select('id, status')
    .eq('id', reviewId)
    .single()
  if (rErr || !review) return { ok: false, error: 'Review not found.' }
  if (review.status === 'committed') return { ok: true }
  if (review.status !== 'draft') return { ok: false, error: 'Review is not editable.' }

  const { data: itemsData } = await supabase
    .from('contract_review_items')
    .select('*')
    .eq('review_id', reviewId)
    .order('position')
  const items = (itemsData ?? []) as ContractReviewItem[]

  // Map local_key -> resolved live id, so children can reference parents.
  const resolved = new Map<string, string>()
  // Cache the committed id where already set (idempotency / retry).
  for (const it of items) {
    if (it.committed_id) resolved.set(it.local_key, it.committed_id)
  }

  const setCommitted = async (itemId: string, liveId: string) => {
    await supabase
      .from('contract_review_items')
      .update({ committed_id: liveId, updated_at: new Date().toISOString() })
      .eq('id', itemId)
  }

  try {
    // 1) Client
    const clientItem = items.find((i) => i.entity_type === 'client')
    let clientId: string | null = null
    if (clientItem) {
      if (resolved.has(clientItem.local_key)) {
        clientId = resolved.get(clientItem.local_key)!
      } else if (clientItem.action === 'skip') {
        return { ok: false, error: 'A client is required to commit.' }
      } else if (clientItem.action === 'link') {
        clientId = resolvedLinkId(clientItem)
        if (!clientId) return { ok: false, error: 'Select a client to link, or choose Create.' }
      } else {
        const p = clientItem.payload
        const { data, error } = await supabase
          .from('clients')
          .insert({
            name: str(p, 'name') ?? 'New client',
            contact_name: str(p, 'contact_name'),
            contact_email: str(p, 'contact_email'),
            contact_phone: str(p, 'contact_phone'),
            address: str(p, 'address'),
          })
          .select('id')
          .single()
        if (error || !data) return { ok: false, error: 'Could not create the client.' }
        clientId = data.id as string
      }
      resolved.set(clientItem.local_key, clientId!)
      if (clientItem.committed_id !== clientId) await setCommitted(clientItem.id, clientId!)
    }
    if (!clientId) return { ok: false, error: 'A client is required to commit.' }

    // Ensure a billing account for the client (needed by recurring charges).
    let billingAccountId: string | null = null
    {
      const { data: accounts } = await supabase
        .from('billing_accounts')
        .select('id, is_default')
        .eq('client_id', clientId)
        .order('is_default', { ascending: false })
      if (accounts && accounts.length > 0) {
        billingAccountId = (accounts.find((a) => a.is_default) ?? accounts[0]).id as string
      } else {
        const { data: clientRow } = await supabase
          .from('clients')
          .select('name')
          .eq('id', clientId)
          .single()
        const { data: acct, error: acctErr } = await supabase
          .from('billing_accounts')
          .insert({
            client_id: clientId,
            name: (clientRow?.name as string) || 'Default account',
            is_default: true,
            status: 'live',
          })
          .select('id')
          .single()
        if (acctErr || !acct) return { ok: false, error: 'Could not create a billing account.' }
        billingAccountId = acct.id as string
      }
    }

    // 2) Site
    const siteItem = items.find((i) => i.entity_type === 'site')
    let siteId: string | null = null
    if (siteItem) {
      if (resolved.has(siteItem.local_key)) {
        siteId = resolved.get(siteItem.local_key)!
      } else if (siteItem.action === 'skip') {
        return { ok: false, error: 'A site is required to commit.' }
      } else if (siteItem.action === 'link') {
        siteId = resolvedLinkId(siteItem)
        if (!siteId) return { ok: false, error: 'Select a site to link, or choose Create.' }
        // Re-parent to the resolved client and set live.
        await supabase
          .from('sites')
          .update({ client_id: clientId, status: 'live', updated_at: new Date().toISOString() })
          .eq('id', siteId)
      } else {
        const p = siteItem.payload
        const { data, error } = await supabase
          .from('sites')
          .insert({
            name: str(p, 'name') ?? 'New site',
            address: str(p, 'address') ?? '',
            postcode: str(p, 'postcode'),
            contact_name: str(p, 'contact_name'),
            contact_email: str(p, 'contact_email'),
            contact_phone: str(p, 'contact_phone'),
            client_id: clientId,
            status: 'live',
            created_by: userId,
          })
          .select('id')
          .single()
        if (error || !data) return { ok: false, error: 'Could not create the site.' }
        siteId = data.id as string
      }
      resolved.set(siteItem.local_key, siteId!)
      if (siteItem.committed_id !== siteId) await setCommitted(siteItem.id, siteId!)
    }
    if (!siteId) return { ok: false, error: 'A site is required to commit.' }

    // 3) Systems
    for (const sys of items.filter((i) => i.entity_type === 'system')) {
      if (resolved.has(sys.local_key)) continue
      if (sys.action === 'skip') continue
      let systemId: string | null
      if (sys.action === 'link') {
        systemId = resolvedLinkId(sys)
        if (!systemId) return { ok: false, error: 'Select a system to link, or choose Create.' }
      } else {
        const p = sys.payload
        const { data, error } = await supabase
          .from('site_systems')
          .insert({
            site_id: siteId,
            system_type_id: (p.system_type_id as string) ?? null,
            name: str(p, 'name') ?? 'System',
            description: str(p, 'description'),
          })
          .select('id')
          .single()
        if (error || !data) return { ok: false, error: 'Could not create a system.' }
        systemId = data.id as string
      }
      resolved.set(sys.local_key, systemId!)
      await setCommitted(sys.id, systemId!)
    }

    // 4) Services
    for (const svc of items.filter((i) => i.entity_type === 'service')) {
      if (resolved.has(svc.local_key)) continue
      if (svc.action === 'skip') continue
      const systemId = svc.parent_key ? resolved.get(svc.parent_key) ?? null : null
      let serviceId: string | null
      if (svc.action === 'link') {
        serviceId = resolvedLinkId(svc)
        if (!serviceId) return { ok: false, error: 'Select a service to link, or choose Create.' }
      } else {
        const p = svc.payload
        const months = int(p, 'frequency_months', int(p, 'frequency_value', 12))
        const workerType = str(p, 'worker_type') ?? 'cdo'
        const { data, error } = await supabase
          .from('site_services')
          .insert({
            site_id: siteId,
            site_system_id: systemId,
            service_type_id: (p.service_type_id as string) ?? null,
            frequency_value: int(p, 'frequency_value', months),
            frequency_unit: str(p, 'frequency_unit') ?? 'months',
            frequency_months: months,
            worker_type: workerType,
            subcontractor_id: workerType === 'subcontractor' ? (p.subcontractor_id as string) ?? null : null,
            subcontractor_annual_cost_pence:
              workerType === 'subcontractor' ? (p.subcontractor_annual_cost_pence as number) ?? null : null,
            active: true,
          })
          .select('id')
          .single()
        if (error || !data) return { ok: false, error: 'Could not create a service.' }
        serviceId = data.id as string
      }
      resolved.set(svc.local_key, serviceId!)
      await setCommitted(svc.id, serviceId!)
    }

    // 5) Charges
    for (const ch of items.filter((i) => i.entity_type === 'charge')) {
      if (resolved.has(ch.local_key)) continue
      if (ch.action === 'skip') continue
      const serviceId = ch.parent_key ? resolved.get(ch.parent_key) ?? null : null
      const p = ch.payload
      const isSub = p.is_subcontracted === true
      const { data, error } = await supabase
        .from('recurring_charges')
        .insert({
          billing_account_id: billingAccountId,
          site_service_id: serviceId,
          client_id: clientId,
          site_id: siteId,
          description: str(p, 'description') ?? 'Routine maintenance',
          unit_price_pence: int(p, 'unit_price_pence', 0),
          quantity: 1,
          frequency: str(p, 'frequency') ?? 'annual',
          price_basis: str(p, 'price_basis') ?? 'per_period',
          is_subcontracted: isSub,
          subcontract_price_pence: isSub ? (p.subcontract_price_pence as number) ?? null : null,
          active: true,
          created_by: userId,
        })
        .select('id')
        .single()
      if (error || !data) return { ok: false, error: 'Could not create a charge.' }
      resolved.set(ch.local_key, data.id as string)
      await setCommitted(ch.id, data.id as string)
    }

    // Finalise the review.
    await supabase
      .from('contract_reviews')
      .update({
        status: 'committed',
        committed_by: userId,
        committed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    revalidatePath(QUEUE_PATH)
    revalidatePath(`${QUEUE_PATH}/${reviewId}`)
    revalidatePath('/dashboard/service')
    revalidatePath(`/dashboard/sites/${siteId}`)
    return { ok: true, siteId }
  } catch (e) {
    console.log('[v0] commitContractReview error', (e as Error).message)
    return { ok: false, error: 'Unexpected error while committing.' }
  }
}

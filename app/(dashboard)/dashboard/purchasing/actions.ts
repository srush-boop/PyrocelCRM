'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  nextPurchaseOrderNumber,
  previewJobPurchasing,
  poLineTotalPence,
  isFullyReceived,
} from '@/lib/jobs/purchasing'
import type { PurchaseOrderStatus } from '@/lib/types/database'

// Staff (admin/office) only, mirroring the jobs module.
async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

type Supabase = Awaited<ReturnType<typeof requireStaff>>['supabase']

function revalidatePurchasing(poId?: string, jobId?: string | null) {
  revalidatePath('/dashboard/purchasing')
  if (poId) revalidatePath(`/dashboard/purchasing/${poId}`)
  if (jobId) revalidatePath(`/dashboard/jobs/${jobId}`)
}

/** Recompute and persist a PO's subtotal from its current lines. */
async function recomputeSubtotal(supabase: Supabase, poId: string): Promise<number> {
  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('line_total_pence')
    .eq('purchase_order_id', poId)
  const subtotal = ((lines ?? []) as { line_total_pence: number }[]).reduce(
    (sum, l) => sum + (l.line_total_pence ?? 0),
    0,
  )
  await supabase
    .from('purchase_orders')
    .update({ subtotal_pence: subtotal, updated_at: new Date().toISOString() })
    .eq('id', poId)
  return subtotal
}

/**
 * Generate one draft purchase order per supplier from a job's quoted parts.
 * Skips supplier groups that already have a live PO for the job, so it's safe to
 * run more than once. Returns how many POs were created.
 */
export async function generatePurchaseOrdersForJob(
  jobId: string,
): Promise<{ ok: boolean; created?: number; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, quote_id, branch_id')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return { ok: false, error: 'Job not found.' }
  const branchId = (job as { branch_id: string | null }).branch_id
  const quoteId = (job as { quote_id: string | null }).quote_id

  const { groups } = await previewJobPurchasing(supabase, jobId)
  const pending = groups.filter((g) => !g.alreadyOrdered && g.lines.length > 0)
  if (pending.length === 0) {
    return { ok: false, error: 'No new parts to order for this job.' }
  }

  let created = 0
  for (const group of pending) {
    // Fetch a fresh PO number per insert; retry once on a numbering collision.
    let poId: string | null = null
    for (let attempt = 0; attempt < 2 && !poId; attempt++) {
      const poNumber = await nextPurchaseOrderNumber(supabase)
      const { data: inserted, error: insErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          job_id: jobId,
          quote_id: quoteId,
          supplier_id: group.supplierId,
          branch_id: branchId,
          status: 'draft',
          subtotal_pence: group.subtotalPence,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (!insErr && inserted) {
        poId = (inserted as { id: string }).id
      } else if (insErr && !insErr.message.toLowerCase().includes('duplicate')) {
        console.log('[v0] generatePOs insert error:', insErr.message)
        break
      }
    }
    if (!poId) continue

    const lineRows = group.lines.map((l, idx) => ({
      purchase_order_id: poId,
      catalogue_item_id: l.catalogueItemId,
      quote_line_item_id: l.quoteLineItemId,
      description: l.description,
      product_code: l.productCode,
      quantity: l.quantity,
      unit: l.unit,
      unit_cost_pence: l.unitCostPence,
      line_total_pence: l.lineTotalPence,
      position: idx,
    }))
    const { error: linesErr } = await supabase.from('purchase_order_lines').insert(lineRows)
    if (linesErr) {
      console.log('[v0] generatePOs lines error:', linesErr.message)
    }
    created += 1
  }

  revalidatePurchasing(undefined, jobId)
  return { ok: true, created }
}

/** Editing lines is only allowed while a PO is still a draft. */
async function assertDraft(supabase: Supabase, poId: string) {
  const { data } = await supabase.from('purchase_orders').select('status, job_id').eq('id', poId).maybeSingle()
  const po = data as { status: PurchaseOrderStatus; job_id: string | null } | null
  return po
}

export async function addPurchaseOrderLine(
  poId: string,
  input: { description: string; productCode?: string | null; quantity: number; unit?: string; unitCostPence: number },
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const po = await assertDraft(supabase, poId)
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Only draft orders can be edited.' }

  const description = input.description.trim()
  if (!description) return { ok: false, error: 'A description is required.' }
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'Quantity must be greater than zero.' }
  const unitCostPence = Math.max(0, Math.round(Number(input.unitCostPence) || 0))

  // Append to the end.
  const { data: last } = await supabase
    .from('purchase_order_lines')
    .select('position')
    .eq('purchase_order_id', poId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last as { position?: number } | null)?.position ?? -1) + 1

  const { error: insErr } = await supabase.from('purchase_order_lines').insert({
    purchase_order_id: poId,
    description,
    product_code: input.productCode?.trim() || null,
    quantity,
    unit: input.unit?.trim() || 'each',
    unit_cost_pence: unitCostPence,
    line_total_pence: poLineTotalPence(unitCostPence, quantity),
    position,
  })
  if (insErr) {
    console.log('[v0] addPurchaseOrderLine error:', insErr.message)
    return { ok: false, error: 'Could not add the line.' }
  }

  await recomputeSubtotal(supabase, poId)
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

export async function updatePurchaseOrderLine(
  lineId: string,
  input: { description?: string; productCode?: string | null; quantity?: number; unit?: string; unitCostPence?: number },
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: line } = await supabase
    .from('purchase_order_lines')
    .select('id, purchase_order_id, quantity, unit_cost_pence')
    .eq('id', lineId)
    .maybeSingle()
  if (!line) return { ok: false, error: 'Line not found.' }
  const poId = (line as { purchase_order_id: string }).purchase_order_id

  const po = await assertDraft(supabase, poId)
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Only draft orders can be edited.' }

  const patch: Record<string, unknown> = {}
  if (input.description !== undefined) {
    const d = input.description.trim()
    if (!d) return { ok: false, error: 'A description is required.' }
    patch.description = d
  }
  if (input.productCode !== undefined) patch.product_code = input.productCode?.trim() || null
  if (input.unit !== undefined) patch.unit = input.unit.trim() || 'each'

  const quantity =
    input.quantity !== undefined ? Number(input.quantity) : Number((line as { quantity: number }).quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'Quantity must be greater than zero.' }
  const unitCostPence =
    input.unitCostPence !== undefined
      ? Math.max(0, Math.round(Number(input.unitCostPence) || 0))
      : Number((line as { unit_cost_pence: number }).unit_cost_pence)

  patch.quantity = quantity
  patch.unit_cost_pence = unitCostPence
  patch.line_total_pence = poLineTotalPence(unitCostPence, quantity)

  const { error: upErr } = await supabase.from('purchase_order_lines').update(patch).eq('id', lineId)
  if (upErr) {
    console.log('[v0] updatePurchaseOrderLine error:', upErr.message)
    return { ok: false, error: 'Could not update the line.' }
  }

  await recomputeSubtotal(supabase, poId)
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

export async function removePurchaseOrderLine(lineId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: line } = await supabase
    .from('purchase_order_lines')
    .select('purchase_order_id')
    .eq('id', lineId)
    .maybeSingle()
  if (!line) return { ok: false, error: 'Line not found.' }
  const poId = (line as { purchase_order_id: string }).purchase_order_id

  const po = await assertDraft(supabase, poId)
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Only draft orders can be edited.' }

  const { error: delErr } = await supabase.from('purchase_order_lines').delete().eq('id', lineId)
  if (delErr) {
    console.log('[v0] removePurchaseOrderLine error:', delErr.message)
    return { ok: false, error: 'Could not remove the line.' }
  }

  await recomputeSubtotal(supabase, poId)
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

/** Set (or clear) the supplier for a draft PO — used for the Unassigned group. */
export async function setPurchaseOrderSupplier(
  poId: string,
  supplierId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const po = await assertDraft(supabase, poId)
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Supplier can only be changed on a draft.' }

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({ supplier_id: supplierId, updated_at: new Date().toISOString() })
    .eq('id', poId)
  if (upErr) {
    console.log('[v0] setPurchaseOrderSupplier error:', upErr.message)
    return { ok: false, error: 'Could not update the supplier.' }
  }
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

export async function updatePurchaseOrderNotes(
  poId: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  const po = await assertDraft(supabase, poId)
  if (!po) return { ok: false, error: 'Purchase order not found.' }

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', poId)
  if (upErr) return { ok: false, error: 'Could not save notes.' }
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

/**
 * Mark a draft PO as sent to the supplier. Requires a supplier and at least one
 * line, and snapshots the supplier's order email for the record. (Delivering the
 * email itself is done manually / by a later phase.)
 */
export async function markPurchaseOrderSent(poId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data } = await supabase
    .from('purchase_orders')
    .select('status, job_id, supplier_id, supplier:suppliers(order_email, contact_email)')
    .eq('id', poId)
    .maybeSingle()
  const po = data as {
    status: PurchaseOrderStatus
    job_id: string | null
    supplier_id: string | null
    supplier: { order_email: string | null; contact_email: string | null } | null
  } | null
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Only a draft can be sent.' }
  if (!po.supplier_id) return { ok: false, error: 'Assign a supplier before sending.' }

  const { count } = await supabase
    .from('purchase_order_lines')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', poId)
  if (!count) return { ok: false, error: 'Add at least one line before sending.' }

  const orderEmail = po.supplier?.order_email || po.supplier?.contact_email || null

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({
      status: 'sent',
      order_email: orderEmail,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', poId)
  if (upErr) {
    console.log('[v0] markPurchaseOrderSent error:', upErr.message)
    return { ok: false, error: 'Could not mark the order as sent.' }
  }
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

/**
 * Record received quantities against a sent PO. Sets status to received when all
 * lines are complete, otherwise part_received.
 */
export async function receivePurchaseOrder(
  poId: string,
  receipts: { lineId: string; quantityReceived: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data } = await supabase.from('purchase_orders').select('status, job_id').eq('id', poId).maybeSingle()
  const po = data as { status: PurchaseOrderStatus; job_id: string | null } | null
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (!['sent', 'part_received'].includes(po.status)) {
    return { ok: false, error: 'Only a sent order can be received.' }
  }

  for (const r of receipts) {
    const qty = Math.max(0, Number(r.quantityReceived) || 0)
    await supabase.from('purchase_order_lines').update({ quantity_received: qty }).eq('id', r.lineId).eq('purchase_order_id', poId)
  }

  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('quantity, quantity_received')
    .eq('purchase_order_id', poId)
  const allLines = (lines ?? []) as { quantity: number; quantity_received: number }[]
  const anyReceived = allLines.some((l) => Number(l.quantity_received) > 0)
  const status: PurchaseOrderStatus = isFullyReceived(allLines)
    ? 'received'
    : anyReceived
      ? 'part_received'
      : 'sent'

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({
      status,
      received_at: status === 'received' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', poId)
  if (upErr) {
    console.log('[v0] receivePurchaseOrder error:', upErr.message)
    return { ok: false, error: 'Could not record the receipt.' }
  }
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

export async function cancelPurchaseOrder(poId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data } = await supabase.from('purchase_orders').select('status, job_id').eq('id', poId).maybeSingle()
  const po = data as { status: PurchaseOrderStatus; job_id: string | null } | null
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status === 'received') return { ok: false, error: 'A fully received order cannot be cancelled.' }

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', poId)
  if (upErr) return { ok: false, error: 'Could not cancel the order.' }
  revalidatePurchasing(poId, po.job_id)
  return { ok: true }
}

/** Delete a draft PO outright (only drafts). */
export async function deletePurchaseOrder(poId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data } = await supabase.from('purchase_orders').select('status, job_id').eq('id', poId).maybeSingle()
  const po = data as { status: PurchaseOrderStatus; job_id: string | null } | null
  if (!po) return { ok: false, error: 'Purchase order not found.' }
  if (po.status !== 'draft') return { ok: false, error: 'Only draft orders can be deleted.' }

  const { error: delErr } = await supabase.from('purchase_orders').delete().eq('id', poId)
  if (delErr) return { ok: false, error: 'Could not delete the order.' }
  revalidatePurchasing(undefined, po.job_id)
  return { ok: true }
}

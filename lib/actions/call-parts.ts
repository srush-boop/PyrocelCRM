'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CallPartLine } from '@/lib/types/database'

// Server actions backing the "Parts used on this call" picker. Distinct from
// the defect "suggested parts" flow: always available (no defect required),
// tracks parts actually fitted/used, and captures a cost snapshot (pence) for a
// future charging pass. Row-level security is the real backstop: staff can
// manage anytime, the assigned engineer only while the task is in_progress,
// and clients never. These helpers mirror lib/actions/suggested-parts.ts.

/**
 * Find the stock location (vehicle) to draw from for a call: the first active
 * location linked to the task's assigned engineer, preferring a vehicle
 * (`kind='van'`, the internal stored value) over any other linked location.
 * Returns null when there's no assigned engineer or no linked location, in
 * which case parts are recorded without touching stock (log-only).
 */
async function resolveEngineerVehicle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
): Promise<string | null> {
  const { data: task } = await supabase
    .from('tasks')
    .select('assigned_engineer_id')
    .eq('id', taskId)
    .maybeSingle()

  const engineerId = (task as { assigned_engineer_id: string | null } | null)?.assigned_engineer_id
  if (!engineerId) return null

  const { data: locations } = await supabase
    .from('stock_locations')
    .select('id, kind')
    .eq('engineer_id', engineerId)
    .eq('is_active', true)

  if (!locations || locations.length === 0) return null
  const vehicle = (locations as { id: string; kind: string }[]).find((l) => l.kind === 'van')
  return (vehicle ?? (locations as { id: string }[])[0]).id
}

/**
 * Reconcile stock for a call part line towards `targetQty`, given what was
 * previously deducted (`prevDeducted`) from `prevLocationId`. Deducts up to what
 * the vehicle holds when increasing (log-only if short) and returns stock when
 * decreasing. Never throws — a stock hiccup must not block recording the part.
 * Returns the new deducted qty + location to persist on the call_parts row.
 */
async function reconcileStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    taskId: string
    partId: string
    targetQty: number
    prevDeducted: number
    prevLocationId: string | null
  },
): Promise<{ stock_deducted_qty: number; stock_location_id: string | null }> {
  const { taskId, partId, targetQty, prevDeducted, prevLocationId } = opts
  let deducted = prevDeducted
  let locationId = prevLocationId

  try {
    const delta = targetQty - deducted

    if (delta > 0) {
      // Need to pull more. Draw from the previously-used location if set,
      // otherwise resolve the engineer's vehicle.
      const location = locationId ?? (await resolveEngineerVehicle(supabase, taskId))
      if (location) {
        const { data: item } = await supabase
          .from('stock_items')
          .select('quantity')
          .eq('location_id', location)
          .eq('part_id', partId)
          .maybeSingle()
        const available = (item as { quantity: number } | null)?.quantity ?? 0
        const take = Math.min(delta, available)
        if (take > 0) {
          const { error } = await supabase.rpc('record_stock_movement', {
            p_part_id: partId,
            p_quantity: take,
            p_type: 'usage',
            p_from_location_id: location,
            p_task_id: taskId,
            p_notes: 'Used on call',
          })
          if (!error) {
            deducted += take
            locationId = location
          }
        }
      }
    } else if (delta < 0 && deducted > 0 && locationId) {
      // Quantity reduced (or line being removed): return the difference.
      const giveBack = Math.min(-delta, deducted)
      if (giveBack > 0) {
        const { error } = await supabase.rpc('record_stock_movement', {
          p_part_id: partId,
          p_quantity: giveBack,
          p_type: 'receipt',
          p_to_location_id: locationId,
          p_task_id: taskId,
          p_notes: 'Returned from call',
        })
        if (!error) {
          deducted -= giveBack
        }
      }
    }
  } catch {
    // Swallow: recording the part must succeed even if stock movement fails.
  }

  return { stock_deducted_qty: deducted, stock_location_id: deducted > 0 ? locationId : null }
}

async function requireStaffOrEngineer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Clients must never touch parts data.
  if (!profile || (profile as { role: string }).role === 'client') {
    return { supabase, user: null }
  }
  return { supabase, user }
}

/** Search active catalogue parts by name or SKU for the picker dropdown. */
export async function searchCallParts(query: string): Promise<CallPartLine[]> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return []

  const q = query.trim()
  let builder = supabase
    .from('parts')
    .select('id, name, sku, unit, unit_cost, catalogue_item:quote_catalogue_items(unit_cost_pence)')
    .eq('is_active', true)
    .order('name')
    .limit(20)

  if (q.length > 0) {
    builder = builder.or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
  }

  const { data } = await builder
  return (data ?? []).map((p: any) => ({
    part_id: p.id,
    quantity: 1,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    unit_cost_pence: costToPence(p),
  }))
}

/** Current parts used on a task (with part details joined). */
export async function getCallParts(taskId: string): Promise<CallPartLine[]> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return []

  // Only embed the part; do NOT embed tasks back (keeps the relationship
  // unambiguous and avoids the recurring ambiguous-embed error).
  const { data } = await supabase
    .from('call_parts')
    .select('part_id, quantity, unit_cost_pence, stock_deducted_qty, part:parts(name, sku, unit)')
    .eq('task_id', taskId)
    .order('created_at')

  return (data ?? []).map((r: any) => ({
    part_id: r.part_id,
    quantity: r.quantity,
    name: r.part?.name ?? 'Unknown part',
    sku: r.part?.sku ?? null,
    unit: r.part?.unit ?? 'unit',
    unit_cost_pence: r.unit_cost_pence ?? null,
    stock_deducted_qty: r.stock_deducted_qty ?? 0,
  }))
}

/**
 * Add a catalogue part to a call, or update its quantity if already present.
 * On first insert the cost snapshot is captured; on quantity updates the
 * original snapshot is preserved (cost is "as at time added").
 */
export async function upsertCallPart(
  taskId: string,
  partId: string,
  quantity: number,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return { error: 'Not authorised' }

  const qty = Math.max(1, Math.floor(quantity) || 1)

  // Is this part already on the call? If so, only bump the quantity so the
  // original cost snapshot is retained.
  const { data: existing } = await supabase
    .from('call_parts')
    .select('id, stock_deducted_qty, stock_location_id')
    .eq('task_id', taskId)
    .eq('part_id', partId)
    .maybeSingle()

  if (existing) {
    const row = existing as {
      stock_deducted_qty: number | null
      stock_location_id: string | null
    }
    const stock = await reconcileStock(supabase, {
      taskId,
      partId,
      targetQty: qty,
      prevDeducted: row.stock_deducted_qty ?? 0,
      prevLocationId: row.stock_location_id,
    })
    const { error } = await supabase
      .from('call_parts')
      .update({ quantity: qty, ...stock })
      .eq('task_id', taskId)
      .eq('part_id', partId)
    if (error) return { error: error.message }
    revalidatePath(`/dashboard/tasks/${taskId}`)
    return {}
  }

  // New line: snapshot our cost (pence) from the catalogue item, falling back
  // to the legacy pounds cost on the part record.
  const { data: part } = await supabase
    .from('parts')
    .select('unit_cost, catalogue_item:quote_catalogue_items(unit_cost_pence)')
    .eq('id', partId)
    .single()

  // Deduct from the engineer's vehicle (log-only if none / short) before insert.
  const stock = await reconcileStock(supabase, {
    taskId,
    partId,
    targetQty: qty,
    prevDeducted: 0,
    prevLocationId: null,
  })

  const { error } = await supabase.from('call_parts').insert({
    task_id: taskId,
    part_id: partId,
    quantity: qty,
    unit_cost_pence: costToPence(part),
    added_by: user.id,
    ...stock,
  })

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return {}
}

/** Remove a part from a call. */
export async function removeCallPart(
  taskId: string,
  partId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return { error: 'Not authorised' }

  // Return any deducted stock to the vehicle before removing the line.
  const { data: existing } = await supabase
    .from('call_parts')
    .select('stock_deducted_qty, stock_location_id')
    .eq('task_id', taskId)
    .eq('part_id', partId)
    .maybeSingle()

  if (existing) {
    const row = existing as {
      stock_deducted_qty: number | null
      stock_location_id: string | null
    }
    await reconcileStock(supabase, {
      taskId,
      partId,
      targetQty: 0,
      prevDeducted: row.stock_deducted_qty ?? 0,
      prevLocationId: row.stock_location_id,
    })
  }

  const { error } = await supabase
    .from('call_parts')
    .delete()
    .eq('task_id', taskId)
    .eq('part_id', partId)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return {}
}

/**
 * Resolve a part's cost to integer pence. Prefer the linked catalogue item's
 * pence cost; fall back to the legacy numeric pounds `parts.unit_cost`.
 */
function costToPence(part: any): number | null {
  const cat = Array.isArray(part?.catalogue_item) ? part.catalogue_item[0] : part?.catalogue_item
  if (cat && typeof cat.unit_cost_pence === 'number') return cat.unit_cost_pence
  if (typeof part?.unit_cost === 'number') return Math.round(part.unit_cost * 100)
  return null
}

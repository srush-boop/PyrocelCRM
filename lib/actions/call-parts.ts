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
    .select('part_id, quantity, unit_cost_pence, part:parts(name, sku, unit)')
    .eq('task_id', taskId)
    .order('created_at')

  return (data ?? []).map((r: any) => ({
    part_id: r.part_id,
    quantity: r.quantity,
    name: r.part?.name ?? 'Unknown part',
    sku: r.part?.sku ?? null,
    unit: r.part?.unit ?? 'unit',
    unit_cost_pence: r.unit_cost_pence ?? null,
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
    .select('id')
    .eq('task_id', taskId)
    .eq('part_id', partId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('call_parts')
      .update({ quantity: qty })
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

  const { error } = await supabase.from('call_parts').insert({
    task_id: taskId,
    part_id: partId,
    quantity: qty,
    unit_cost_pence: costToPence(part),
    added_by: user.id,
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

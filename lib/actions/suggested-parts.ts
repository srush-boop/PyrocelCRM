'use server'

import { createClient } from '@/lib/supabase/server'
import type { SuggestedPartLine } from '@/lib/types/database'

// Server actions backing the internal "suggested parts" picker shown to
// engineers when a defect is present on an inspection. All rows are keyed by
// task_id and are for internal use only (never surfaced to clients). Row-level
// security additionally restricts writes to staff or the task's engineer.

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

/** Search active parts by name or SKU for the picker dropdown. */
export async function searchSuggestedParts(query: string): Promise<SuggestedPartLine[]> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return []

  const q = query.trim()
  let builder = supabase
    .from('parts')
    .select('id, name, sku, unit')
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
  }))
}

/** Current suggested parts for a task (with part details joined). */
export async function getSuggestedParts(taskId: string): Promise<SuggestedPartLine[]> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return []

  const { data } = await supabase
    .from('defect_suggested_parts')
    .select('part_id, quantity, part:parts(name, sku, unit)')
    .eq('task_id', taskId)
    .order('created_at')

  return (data ?? []).map((r: any) => ({
    part_id: r.part_id,
    quantity: r.quantity,
    name: r.part?.name ?? 'Unknown part',
    sku: r.part?.sku ?? null,
    unit: r.part?.unit ?? 'unit',
  }))
}

/** Add or update the quantity of a suggested part on a task. */
export async function upsertSuggestedPart(
  taskId: string,
  partId: string,
  quantity: number,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return { error: 'Not authorised' }

  const qty = Math.max(1, Math.floor(quantity) || 1)
  const { error } = await supabase.from('defect_suggested_parts').upsert(
    {
      task_id: taskId,
      part_id: partId,
      quantity: qty,
      suggested_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'task_id,part_id' },
  )

  if (error) return { error: error.message }
  return {}
}

/** Remove a suggested part from a task. */
export async function removeSuggestedPart(
  taskId: string,
  partId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireStaffOrEngineer()
  if (!user) return { error: 'Not authorised' }

  const { error } = await supabase
    .from('defect_suggested_parts')
    .delete()
    .eq('task_id', taskId)
    .eq('part_id', partId)

  if (error) return { error: error.message }
  return {}
}

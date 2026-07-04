import { createClient } from '@/lib/supabase/server'
import type { SuggestedPartLine } from '@/lib/types/database'

// Server-side data helpers for defects. Kept separate from lib/defects.ts so the
// latter stays client-safe (it is imported by client components for labels).

/** Full list of internal suggested parts for a task, with part details. */
export async function getSuggestedPartsForTask(
  taskId: string,
): Promise<SuggestedPartLine[]> {
  const supabase = await createClient()
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

/**
 * Map of task_id -> number of distinct suggested parts, for a set of tasks.
 * Used to show a "parts suggested" indicator on the defects list.
 */
export async function getSuggestedPartCounts(
  taskIds: string[],
): Promise<Record<string, number>> {
  const ids = taskIds.filter(Boolean)
  if (ids.length === 0) return {}

  const supabase = await createClient()
  const { data } = await supabase
    .from('defect_suggested_parts')
    .select('task_id')
    .in('task_id', ids)

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { task_id: string }[]) {
    counts[row.task_id] = (counts[row.task_id] ?? 0) + 1
  }
  return counts
}

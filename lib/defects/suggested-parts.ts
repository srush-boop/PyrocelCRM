import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuoteCatalogueItem } from '@/lib/types/database'

/**
 * A part the engineer suggested for a defect, enriched with its cost and the
 * quote-catalogue item it is linked to (if any) so it can be confirmed onto a
 * remedial quote line or a remedial call's parts list.
 */
export interface DefectSuggestedPart {
  partId: string
  name: string
  sku: string | null
  unit: string | null
  quantity: number
  unitCostPence: number
  catalogueItem: QuoteCatalogueItem | null
}

/** Suggested parts recorded against the defect's originating inspection call. */
export async function loadDefectSuggestedParts(
  supabase: SupabaseClient,
  taskId: string | null | undefined,
): Promise<DefectSuggestedPart[]> {
  if (!taskId) return []
  const { data } = await supabase
    .from('defect_suggested_parts')
    .select(
      `part_id, quantity,
       part:parts(name, sku, unit, unit_cost,
         catalogue_item:quote_catalogue_items!parts_catalogue_item_id_fkey(*))`,
    )
    .eq('task_id', taskId)
    .order('created_at')

  return ((data ?? []) as any[]).map((r) => {
    const part = Array.isArray(r.part) ? r.part[0] : r.part
    const cat = part ? (Array.isArray(part.catalogue_item) ? part.catalogue_item[0] : part.catalogue_item) : null
    return {
      partId: r.part_id as string,
      name: (part?.name as string) ?? 'Unknown part',
      sku: (part?.sku as string | null) ?? null,
      unit: (part?.unit as string | null) ?? null,
      quantity: Math.max(1, Number(r.quantity) || 1),
      unitCostPence: Math.round((Number(part?.unit_cost) || 0) * 100),
      catalogueItem: (cat as QuoteCatalogueItem | null) ?? null,
    }
  })
}

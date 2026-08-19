'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sellFromCost, poundsToPence } from '@/lib/sales'

export interface UpdatePartInput {
  id: string
  name: string
  sku: string | null
  manufacturer: string | null
  unit: string
  /** Unit cost in pounds (as entered in the parts form). */
  unit_cost: number
  default_min_level: number
  description: string | null
  is_active: boolean
  supplier_id: string | null
  nominal_code_id: string | null
}

export interface UpdatePartResult {
  ok: boolean
  error?: string
  /** True when a linked quote-catalogue item was found and updated. */
  catalogueSynced: boolean
}

/**
 * Update a part in the parts catalogue and, if it is linked to a quote
 * catalogue item, push the cost + core details across so the two stay in step.
 *
 * The part is the master (one-way sync). The catalogue item's own margin is
 * preserved: only its cost is set from the part and its default sell price is
 * recomputed via `sellFromCost(cost, margin)`. Independent prices on the
 * catalogue item (service sale price, ecommerce price) are never touched.
 *
 * The link is `parts.catalogue_item_id`. When a part has no stored link we try
 * to resolve one by an exact (case-insensitive) SKU ⇒ `product_code` match; a
 * single unambiguous match is remembered on the part for next time.
 *
 * Runs under the caller's session: writing parts needs `is_stock_manager()`
 * and the catalogue needs `is_staff()`, both of which a stock manager holds.
 */
export async function updatePart(input: UpdatePartInput): Promise<UpdatePartResult> {
  const supabase = await createClient()

  const sku = input.sku?.trim() ? input.sku.trim() : null

  // Read the current catalogue link before writing.
  const { data: existing, error: readErr } = await supabase
    .from('parts')
    .select('id, catalogue_item_id')
    .eq('id', input.id)
    .single()

  if (readErr || !existing) {
    return { ok: false, error: readErr?.message ?? 'Part not found.', catalogueSynced: false }
  }

  const { error: updErr } = await supabase
    .from('parts')
    .update({
      name: input.name,
      sku,
      manufacturer: input.manufacturer?.trim() ? input.manufacturer.trim() : null,
      unit: input.unit || 'each',
      unit_cost: Number.isFinite(input.unit_cost) ? input.unit_cost : 0,
      default_min_level: Math.max(0, Math.trunc(input.default_min_level) || 0),
      description: input.description?.trim() ? input.description.trim() : null,
      is_active: input.is_active,
      supplier_id: input.supplier_id || null,
      nominal_code_id: input.nominal_code_id,
    })
    .eq('id', input.id)

  if (updErr) {
    return { ok: false, error: updErr.message, catalogueSynced: false }
  }

  // Resolve the catalogue item to sync: stored link first, else SKU match.
  let catalogueItemId = (existing.catalogue_item_id as string | null) ?? null

  if (!catalogueItemId && sku) {
    const { data: matches } = await supabase
      .from('quote_catalogue_items')
      .select('id')
      .ilike('product_code', sku)
      .limit(2)
    // Only adopt an unambiguous single match, then remember it on the part.
    if (matches && matches.length === 1) {
      catalogueItemId = matches[0].id as string
      await supabase
        .from('parts')
        .update({ catalogue_item_id: catalogueItemId })
        .eq('id', input.id)
    }
  }

  let catalogueSynced = false
  if (catalogueItemId) {
    const { data: item } = await supabase
      .from('quote_catalogue_items')
      .select('id, margin_percent')
      .eq('id', catalogueItemId)
      .single()

    if (item) {
      const costPence = poundsToPence(input.unit_cost)
      const margin = Number(item.margin_percent) || 0
      const { error: catErr } = await supabase
        .from('quote_catalogue_items')
        .update({
          name: input.name,
          product_code: sku,
          default_unit: input.unit || 'each',
          description: input.description?.trim() ? input.description.trim() : null,
          active: input.is_active,
          unit_cost_pence: costPence,
          // Keep the item's own margin; recompute its default sell price.
          default_unit_price_pence: sellFromCost(costPence, margin),
        })
        .eq('id', catalogueItemId)
      catalogueSynced = !catErr
    }
  }

  revalidatePath('/dashboard/stock/parts')
  revalidatePath('/dashboard/stock/catalogue')
  return { ok: true, catalogueSynced }
}

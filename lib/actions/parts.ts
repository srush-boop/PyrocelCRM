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

export interface BulkAdjustPartCostsInput {
  /** Parts to adjust. */
  partIds: string[]
  /**
   * Signed percentage change applied to each part's unit cost. Positive = a
   * price increase (e.g. 5 for +5%), negative = a decrease (e.g. -2.5 for -2.5%).
   */
  percent: number
}

export interface BulkAdjustPartCostsResult {
  ok: boolean
  error?: string
  /** Number of parts whose cost was updated. */
  updated: number
  /** Of those, how many were also synced to a linked quote-catalogue item. */
  catalogueSynced: number
}

/**
 * Apply a percentage price change to the unit cost of many parts at once
 * (e.g. a supplier-wide price increase). Only the unit cost changes; every
 * other field is left alone. Any part linked to a quote-catalogue item has its
 * catalogue cost updated and default sell price recomputed at the item's own
 * margin (independent service/ecommerce prices are never touched).
 *
 * Runs under the caller's session, same permissions as `updatePart`.
 */
export async function bulkAdjustPartCosts(
  input: BulkAdjustPartCostsInput,
): Promise<BulkAdjustPartCostsResult> {
  const ids = Array.from(new Set(input.partIds.filter(Boolean)))
  if (ids.length === 0) {
    return { ok: false, error: 'No parts selected.', updated: 0, catalogueSynced: 0 }
  }
  if (!Number.isFinite(input.percent) || input.percent === 0) {
    return { ok: false, error: 'Enter a non-zero percentage.', updated: 0, catalogueSynced: 0 }
  }
  // Guard against a fat-fingered change wiping value out entirely.
  if (input.percent <= -100) {
    return {
      ok: false,
      error: 'A decrease of 100% or more is not allowed.',
      updated: 0,
      catalogueSynced: 0,
    }
  }

  const supabase = await createClient()

  const { data: parts, error: readErr } = await supabase
    .from('parts')
    .select('id, unit_cost, catalogue_item_id')
    .in('id', ids)

  if (readErr) {
    return { ok: false, error: readErr.message, updated: 0, catalogueSynced: 0 }
  }
  if (!parts || parts.length === 0) {
    return { ok: false, error: 'No matching parts found.', updated: 0, catalogueSynced: 0 }
  }

  const factor = 1 + input.percent / 100
  let updated = 0
  let catalogueSynced = 0

  for (const part of parts) {
    const currentCost = Number(part.unit_cost) || 0
    // Round to whole pence so pounds and catalogue pence stay consistent.
    const newCost = Math.max(0, Math.round(currentCost * factor * 100) / 100)

    const { error: updErr } = await supabase
      .from('parts')
      .update({ unit_cost: newCost })
      .eq('id', part.id)
    if (updErr) continue
    updated += 1

    const catalogueItemId = (part.catalogue_item_id as string | null) ?? null
    if (!catalogueItemId) continue

    const { data: item } = await supabase
      .from('quote_catalogue_items')
      .select('id, margin_percent')
      .eq('id', catalogueItemId)
      .single()
    if (!item) continue

    const costPence = poundsToPence(newCost)
    const margin = Number(item.margin_percent) || 0
    const { error: catErr } = await supabase
      .from('quote_catalogue_items')
      .update({
        unit_cost_pence: costPence,
        default_unit_price_pence: sellFromCost(costPence, margin),
      })
      .eq('id', catalogueItemId)
    if (!catErr) catalogueSynced += 1
  }

  revalidatePath('/dashboard/stock/parts')
  revalidatePath('/dashboard/stock/catalogue')
  return { ok: true, updated, catalogueSynced }
}

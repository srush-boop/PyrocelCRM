/**
 * Quote Studio assembly engine (pure, no DB / no IO).
 *
 * Takeoff-driven quoting: the confirmed device schedule IS the assembly. Each
 * counted device maps to a catalogue part; a set of "kit rules" then derive the
 * shared components (panel, PSU, standby batteries, cable) and labour
 * (installation, commissioning) from the device counts.
 *
 * This module turns a confirmed takeoff + the catalogue + the kit rules into a
 * priced list of `QuoteLineInput`s ready to hand to the existing `saveQuote`
 * server action. It is deliberately pure so the maths can be reasoned about and
 * unit-tested in isolation.
 *
 * Money is integer pence throughout; the sell price is derived from unit cost +
 * gross margin using the same `sellFromCost` helper the rest of the quoting
 * system uses, so Studio prices reconcile exactly with hand-built quotes.
 */

import { sellFromCost, resolveLineMargin } from '@/lib/sales'
import type { QuoteLineInput } from '@/app/(dashboard)/dashboard/sales/actions'

// ---- Inputs -----------------------------------------------------------

/** A catalogue item resolved to just what pricing needs. */
export interface AssemblyCatalogueRef {
  id: string
  product_code: string | null
  name: string
  unit: string | null
  unit_cost_pence: number
  margin_percent: number
}

/** A confirmed row of the counted device schedule. */
export interface AssemblyTakeoffItem {
  device_key: string
  label: string
  quantity: number
  catalogue_item_id: string | null
  /** Whether this device feeds the per-device kit/labour rules. */
  contributes_to_device_count: boolean
}

export type KitRuleType = 'fixed' | 'per_device' | 'per_loop' | 'per_zone' | 'per_metre'

/** An ancillary / labour quantity rule applied from the device counts. */
export interface AssemblyKitRule {
  id: string
  label: string
  rule_type: KitRuleType
  factor: number
  /** Restrict a per_device/per_metre rule to one device type (null = all). */
  applies_to_device_key: string | null
  is_service: boolean
  catalogue_item_id: string
  notes: string | null
}

export interface AssemblyContext {
  items: AssemblyTakeoffItem[]
  kitRules: AssemblyKitRule[]
  /** Catalogue items keyed by id. */
  catalogue: Record<string, AssemblyCatalogueRef>
  /** Number of detection loops (for per_loop rules). */
  loops?: number | null
  /** Number of zones (for per_zone rules). */
  zones?: number | null
  /** Default gross margin % for lines whose catalogue margin is unavailable. */
  systemMargin: number
}

// ---- Outputs ----------------------------------------------------------

export interface AssemblyLine extends QuoteLineInput {
  /** Stable client key for React lists. */
  key: string
  sourceType: 'device' | 'kit'
  /** The kit rule that produced this line (kit lines only). */
  ruleId?: string
  /** True when no catalogue item could be resolved (cost unknown). */
  unmapped: boolean
  /** Derived preview values (server recomputes authoritatively on save). */
  unit_price_pence: number
  line_total_pence: number
}

export interface AssemblyResult {
  lines: AssemblyLine[]
  /** Total field devices feeding per-device rules. */
  deviceCount: number
  /** Sum of all counted devices (incl. non-contributing). */
  totalDevices: number
  totalCostPence: number
  totalSellPence: number
  /** Device types / rules that could not be priced (missing catalogue item). */
  unmappedKeys: string[]
}

// ---- Engine -----------------------------------------------------------

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** The device count a per-device / per-metre rule multiplies against. */
function deviceCountForRule(
  rule: AssemblyKitRule,
  items: AssemblyTakeoffItem[],
): number {
  const relevant = rule.applies_to_device_key
    ? items.filter((i) => i.device_key === rule.applies_to_device_key)
    : items.filter((i) => i.contributes_to_device_count)
  return relevant.reduce((sum, i) => sum + (i.quantity || 0), 0)
}

/** Resolve the quantity a kit rule contributes. */
function kitRuleQuantity(
  rule: AssemblyKitRule,
  ctx: AssemblyContext,
): number {
  switch (rule.rule_type) {
    case 'fixed':
      return round2(rule.factor)
    case 'per_device':
    case 'per_metre':
      return round2(rule.factor * deviceCountForRule(rule, ctx.items))
    case 'per_loop':
      return round2(rule.factor * (ctx.loops ?? 0))
    case 'per_zone':
      return round2(rule.factor * (ctx.zones ?? 0))
    default:
      return 0
  }
}

function makeLine(
  key: string,
  sourceType: 'device' | 'kit',
  quantity: number,
  cat: AssemblyCatalogueRef | undefined,
  systemMargin: number,
  opts: { is_service?: boolean; description?: string; ruleId?: string; detail?: string | null },
): AssemblyLine {
  const unitCost = cat?.unit_cost_pence ?? 0
  const margin = resolveLineMargin(cat?.margin_percent ?? null, systemMargin)
  const unitSell = sellFromCost(unitCost, margin)
  const qty = round2(quantity)
  return {
    key,
    sourceType,
    ruleId: opts.ruleId,
    unmapped: !cat,
    description: opts.description ?? cat?.name ?? 'Item',
    detail: opts.detail ?? null,
    catalogue_item_id: cat?.id ?? null,
    product_code: cat?.product_code ?? null,
    is_service: opts.is_service ?? false,
    service_type_id: null,
    quantity: qty,
    unit: cat?.unit ?? null,
    unit_cost_pence: unitCost,
    margin_percent: cat?.margin_percent ?? null,
    unit_price_pence: unitSell,
    line_total_pence: Math.round(qty * unitSell),
  }
}

/**
 * Build the priced assembly from a confirmed takeoff.
 * Device lines come first (in takeoff order), then kit/labour lines (in rule
 * order). Zero-quantity lines are dropped.
 */
export function buildAssembly(ctx: AssemblyContext): AssemblyResult {
  const lines: AssemblyLine[] = []
  const unmappedKeys: string[] = []

  // 1) Device lines — one per counted device type with qty > 0.
  for (const item of ctx.items) {
    if (!item.quantity || item.quantity <= 0) continue
    const cat = item.catalogue_item_id ? ctx.catalogue[item.catalogue_item_id] : undefined
    if (!cat) unmappedKeys.push(item.device_key)
    lines.push(
      makeLine(`dev:${item.device_key}`, 'device', item.quantity, cat, ctx.systemMargin, {
        description: cat?.name ?? item.label,
      }),
    )
  }

  // 2) Kit / labour lines from the rules.
  for (const rule of ctx.kitRules) {
    const qty = kitRuleQuantity(rule, ctx)
    if (!qty || qty <= 0) continue
    const cat = ctx.catalogue[rule.catalogue_item_id]
    if (!cat) unmappedKeys.push(rule.label)
    lines.push(
      makeLine(`kit:${rule.id}`, 'kit', qty, cat, ctx.systemMargin, {
        is_service: rule.is_service,
        description: cat?.name ?? rule.label,
        detail: rule.notes,
        ruleId: rule.id,
      }),
    )
  }

  const deviceCount = ctx.items
    .filter((i) => i.contributes_to_device_count)
    .reduce((sum, i) => sum + (i.quantity || 0), 0)
  const totalDevices = ctx.items.reduce((sum, i) => sum + (i.quantity || 0), 0)
  const totalCostPence = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unit_cost_pence), 0)
  const totalSellPence = lines.reduce((sum, l) => sum + l.line_total_pence, 0)

  return { lines, deviceCount, totalDevices, totalCostPence, totalSellPence, unmappedKeys }
}

/** Strip an AssemblyLine down to the QuoteLineInput the save action expects. */
export function toQuoteLineInput(line: AssemblyLine): QuoteLineInput {
  return {
    description: line.description,
    detail: line.detail ?? null,
    service_type_id: line.service_type_id ?? null,
    is_service: line.is_service,
    catalogue_item_id: line.catalogue_item_id ?? null,
    product_code: line.product_code ?? null,
    quantity: line.quantity,
    unit: line.unit ?? null,
    unit_cost_pence: line.unit_cost_pence,
    margin_percent: line.margin_percent ?? null,
  }
}

// Sales / quoting shared helpers: quote-type catalogue, money math, and
// status metadata. Money is always integer pence internally.

import type { QuoteLineItem, QuoteStatus } from '@/lib/types/database'

// --- Quote types -------------------------------------------------------
// Futureproof: the canonical list lives here (not a DB enum) so new offer
// types can be added without a migration. `value` is what we persist.
export interface QuoteTypeDef {
  value: string
  label: string
  description: string
}

export const QUOTE_TYPES: QuoteTypeDef[] = [
  { value: 'supply_only', label: 'Supply Only', description: 'Equipment supplied, no installation or commissioning.' },
  { value: 'supply_commission', label: 'Supply & Commission', description: 'Equipment supplied and commissioned.' },
  {
    value: 'supply_install_commission',
    label: 'Supply, Install & Commission',
    description: 'Full turnkey: supply, installation and commissioning.',
  },
  { value: 'remedial', label: 'Remedial Work', description: 'Fault rectification and remedial actions.' },
  { value: 'service_contract', label: 'Service Contract', description: 'Recurring maintenance / service agreement.' },
  { value: 'other', label: 'Other', description: 'Bespoke or one-off work.' },
]

export function quoteTypeLabel(value: string): string {
  return QUOTE_TYPES.find((t) => t.value === value)?.label ?? value
}

// --- Work types (per system) ------------------------------------------
// Fixed coded list. The `code` is stored on each quote system and used for
// quote-bank querying; it's intentionally short and stable. Conditional
// "IF" fields are attached to these codes via the work_type_fields table.
export interface WorkTypeDef {
  code: string
  label: string
  description: string
}

export const WORK_TYPES: WorkTypeDef[] = [
  { code: 'SO', label: 'Supply Only', description: 'Equipment supplied, no installation or commissioning.' },
  { code: 'SC', label: 'Supply & Commission', description: 'Equipment supplied and commissioned.' },
  { code: 'SIC', label: 'Supply, Install & Commission', description: 'Full turnkey: supply, installation and commissioning.' },
  { code: 'REM', label: 'Remedial', description: 'Fault rectification and remedial actions.' },
  { code: 'SVC', label: 'Service Contract', description: 'Recurring maintenance / service agreement.' },
  { code: 'OTH', label: 'Other', description: 'Bespoke or one-off work.' },
]

export function workTypeLabel(code: string): string {
  return WORK_TYPES.find((t) => t.code === code)?.label ?? code
}

// Maps a per-system work-type code to the quote-level quote_type value.
// The quote type is no longer chosen in the header — it's derived from the
// first system's work type so the persisted quote_type stays meaningful.
const WORK_TYPE_TO_QUOTE_TYPE: Record<string, string> = {
  SO: 'supply_only',
  SC: 'supply_commission',
  SIC: 'supply_install_commission',
  REM: 'remedial',
  SVC: 'service_contract',
  OTH: 'other',
}

export function quoteTypeFromWorkType(code: string | null | undefined): string {
  if (!code) return 'other'
  return WORK_TYPE_TO_QUOTE_TYPE[code] ?? 'other'
}

// Who produced the design for a system.
export const DESIGNED_BY_OPTIONS = [
  { value: 'pyrocel', label: 'Pyrocel' },
  { value: 'other', label: 'Other' },
] as const

export function designedByLabel(value: string | null, name?: string | null): string {
  if (value === 'pyrocel') return 'Pyrocel'
  if (value === 'other') return name?.trim() ? name : 'Other'
  return '—'
}

// --- Quote bank stats --------------------------------------------------
export interface QuoteBankStats {
  count: number
  minPence: number
  avgPence: number
  maxPence: number
}

export function computeBankStats(values: number[]): QuoteBankStats {
  if (!values.length) return { count: 0, minPence: 0, avgPence: 0, maxPence: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
  return { count: values.length, minPence: min, avgPence: avg, maxPence: max }
}

// --- Status metadata ---------------------------------------------------
export const QUOTE_STATUS_META: Record<
  QuoteStatus,
  { label: string; badgeClass: string }
> = {
  draft: { label: 'Draft', badgeClass: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  accepted: {
    label: 'Accepted',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  },
  rejected: { label: 'Declined', badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  expired: { label: 'Expired', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
}

// --- Money helpers -----------------------------------------------------
export function formatPence(pence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format((pence ?? 0) / 100)
}

// Parse a user-entered pounds string (e.g. "1,234.50") into integer pence.
export function poundsToPence(value: string | number): number {
  if (typeof value === 'number') return Math.round(value * 100)
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// Convert integer pence into a plain pounds string for inputs (no symbol).
export function penceToPounds(pence: number): string {
  return ((pence ?? 0) / 100).toFixed(2)
}

// --- Margin-based pricing ---------------------------------------------
// Single source of truth for turning a unit cost + gross margin % into a
// sell price (in pence), matching the PPM calculator: sell = cost / (1 - m).
// A margin of 100% (or more) is clamped just below 100% to avoid division by
// zero / negative prices.
export function sellFromCost(costPence: number, marginPercent: number): number {
  const cost = Number.isFinite(costPence) ? costPence : 0
  if (cost <= 0) return 0
  const m = Number.isFinite(marginPercent) ? marginPercent : 0
  if (m <= 0) return Math.round(cost)
  const safeMargin = Math.min(m, 99.9)
  return Math.round(cost / (1 - safeMargin / 100))
}

// Resolve the margin that applies to a line: an explicit per-line margin wins,
// otherwise fall back to the system margin (which itself defaults to company).
export function resolveLineMargin(
  lineMargin: number | null | undefined,
  systemMargin: number | null | undefined,
): number {
  if (lineMargin !== null && lineMargin !== undefined && Number.isFinite(lineMargin)) {
    return lineMargin
  }
  return Number.isFinite(systemMargin as number) ? (systemMargin as number) : 0
}

// Resolve the default margin pre-filled on a new quote: the quote author's
// department margin takes precedence, falling back to the company default.
export function resolveDefaultMargin(
  departmentMargin: number | null | undefined,
  companyMargin: number | null | undefined,
): number {
  if (departmentMargin !== null && departmentMargin !== undefined && Number.isFinite(departmentMargin)) {
    return departmentMargin
  }
  return Number.isFinite(companyMargin as number) ? (companyMargin as number) : 0
}

// --- Totals ------------------------------------------------------------
export interface QuoteTotals {
  subtotalPence: number
  vatPence: number
  totalPence: number
}

export interface LineForTotal {
  quantity: number
  unit_price_pence: number
}

export function lineTotalPence(line: LineForTotal): number {
  return Math.round((line.quantity || 0) * (line.unit_price_pence || 0))
}

// Compute subtotal/VAT/total from line items. Discount is applied to the
// subtotal before VAT. Single source of truth for both client preview and
// server persistence.
export function computeQuoteTotals(
  lines: Array<Pick<QuoteLineItem, 'quantity' | 'unit_price_pence'>>,
  opts: { vatRate: number; discountPence: number },
): QuoteTotals {
  const gross = lines.reduce((sum, l) => sum + lineTotalPence(l), 0)
  const discount = Math.min(Math.max(opts.discountPence || 0, 0), gross)
  const subtotalPence = gross - discount
  const vatPence = Math.round(subtotalPence * ((opts.vatRate || 0) / 100))
  const totalPence = subtotalPence + vatPence
  return { subtotalPence, vatPence, totalPence }
}

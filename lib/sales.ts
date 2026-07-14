// Sales / quoting shared helpers: quote-type catalogue, money math, and
// status metadata. Money is always integer pence internally.

import type { QuoteLineItem, QuoteStatus } from '@/lib/types/database'
import { STATUS_TONE_CLASS } from '@/lib/status-colors'

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
  { value: 'supply_install', label: 'Supply & Install', description: 'Equipment supplied and installed (no commissioning).' },
  {
    value: 'design_supply_install_commission',
    label: 'Design, Supply, Install & Commission',
    description: 'Full design responsibility plus supply, installation and commissioning.',
  },
  { value: 'commission_only', label: 'Commission Only', description: 'Commissioning of equipment supplied/installed by others.' },
  { value: 'takeover', label: 'Takeover', description: 'Taking over an existing system for service/responsibility.' },
  { value: 'remedial', label: 'Remedial Work', description: 'Fault rectification and remedial actions.' },
  { value: 'upgrade', label: 'Upgrade', description: 'Upgrade or extension works to an existing system.' },
  { value: 'additions', label: 'Additions', description: 'Additions to an existing system.' },
  { value: 'service_contract', label: 'Routine Maintenance', description: 'Recurring maintenance / service agreement.' },
  { value: 'monitoring', label: 'Monitoring Provision', description: 'ARC / monitoring connection and charges.' },
  { value: 'call_out', label: 'Call-out', description: 'Reactive call-out / attendance quotation.' },
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
  { code: 'SI', label: 'Supply & Install', description: 'Equipment supplied and installed (no commissioning).' },
  { code: 'SC', label: 'Supply & Commission', description: 'Equipment supplied and commissioned.' },
  { code: 'SIC', label: 'Supply, Install & Commission', description: 'Full turnkey: supply, installation and commissioning.' },
  { code: 'DSIC', label: 'Design, Supply, Install & Commission', description: 'Design responsibility plus supply, install and commission.' },
  { code: 'CO', label: 'Commission Only', description: 'Commissioning of equipment supplied/installed by others.' },
  { code: 'TO', label: 'Takeover', description: 'Taking over an existing system for service / responsibility.' },
  { code: 'REM', label: 'Remedial', description: 'Fault rectification and remedial actions.' },
  { code: 'UPG', label: 'Upgrade', description: 'Upgrade or extension works to an existing system.' },
  { code: 'ADD', label: 'Additions', description: 'Additions to an existing system.' },
  { code: 'SVC', label: 'Routine Maintenance', description: 'Recurring maintenance / service agreement.' },
  { code: 'MON', label: 'Monitoring Provision', description: 'ARC / monitoring connection and charges.' },
  { code: 'CALL', label: 'Call-out', description: 'Reactive call-out / attendance quotation.' },
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
  SI: 'supply_install',
  SC: 'supply_commission',
  SIC: 'supply_install_commission',
  DSIC: 'design_supply_install_commission',
  CO: 'commission_only',
  TO: 'takeover',
  REM: 'remedial',
  UPG: 'upgrade',
  ADD: 'additions',
  SVC: 'service_contract',
  MON: 'monitoring',
  CALL: 'call_out',
  OTH: 'other',
}

export function quoteTypeFromWorkType(code: string | null | undefined): string {
  if (!code) return 'other'
  return WORK_TYPE_TO_QUOTE_TYPE[code] ?? 'other'
}

// A quote can hold several systems (e.g. an empty default "System 1" plus the
// real work). Deriving the quote type from ONLY the first system is wrong — a
// stray empty Supply-Only system would mask a Routine-Maintenance quote and
// mis-route acceptance to a Job instead of Contract Review. These helpers
// derive the quote type / maintenance classification from the *meaningful*
// systems only (those with at least one line item), falling back to all
// systems when none have content yet (e.g. a brand-new draft).
export interface SystemClassification {
  work_type: string | null | undefined
  // True when the system has at least one line item (i.e. carries real content).
  hasContent: boolean
}

function meaningfulSystems<T extends SystemClassification>(systems: T[]): T[] {
  const withContent = systems.filter((s) => s.hasContent)
  return withContent.length > 0 ? withContent : systems
}

// Derive the persisted quote_type from the systems. Routine Maintenance wins
// only when EVERY meaningful system is SVC; otherwise a non-SVC system defines
// the type (first non-SVC meaningful system, else the first meaningful system).
export function deriveQuoteTypeFromSystems(systems: SystemClassification[]): string {
  const meaningful = meaningfulSystems(systems)
  if (meaningful.length === 0) return 'other'
  if (meaningful.every((s) => s.work_type === 'SVC')) return 'service_contract'
  const firstNonSvc = meaningful.find((s) => s.work_type !== 'SVC')
  return quoteTypeFromWorkType((firstNonSvc ?? meaningful[0]).work_type)
}

// True when the quote is entirely Routine Maintenance (ignoring empty systems),
// i.e. it should route to Contract Review rather than a delivery Job on accept.
export function isRoutineMaintenanceOnly(systems: SystemClassification[]): boolean {
  const meaningful = meaningfulSystems(systems)
  return meaningful.length > 0 && meaningful.every((s) => s.work_type === 'SVC')
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
  draft: { label: 'Draft', badgeClass: STATUS_TONE_CLASS.neutral },
  sent: { label: 'Sent for approval', badgeClass: STATUS_TONE_CLASS.info },
  accepted: { label: 'Accepted', badgeClass: STATUS_TONE_CLASS.success },
  rejected: { label: 'Declined', badgeClass: STATUS_TONE_CLASS.danger },
  expired: { label: 'Expired', badgeClass: STATUS_TONE_CLASS.warning },
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

// Resolve the admin-defined "set margin" for a system type + work type from
// the system_work_type_margins table. Returns null when no entry exists so the
// caller can fall back to its existing default.
export function resolveSystemWorkTypeMargin(
  margins: { system_type_id: string; work_type: string; margin_percent: number }[],
  systemTypeId: string | null | undefined,
  workType: string | null | undefined,
): number | null {
  if (!systemTypeId || !workType) return null
  const match = margins.find(
    (m) => m.system_type_id === systemTypeId && m.work_type === workType,
  )
  return match ? match.margin_percent : null
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

// A client-selectable optional line only counts toward the total once the
// client has explicitly selected it (client_selected === true). Non-optional
// lines always count.
export function lineCountsTowardTotal(
  line: Pick<QuoteLineItem, 'is_optional' | 'client_selected'>,
): boolean {
  if (!line.is_optional) return true
  return line.client_selected === true
}

// Compute subtotal/VAT/total from line items. Discount is applied to the
// subtotal before VAT. Single source of truth for both client preview and
// server persistence. Optional lines are excluded until the client selects them.
export function computeQuoteTotals(
  lines: Array<Pick<QuoteLineItem, 'quantity' | 'unit_price_pence' | 'is_optional' | 'client_selected'>>,
  opts: { vatRate: number; discountPence: number },
): QuoteTotals {
  const gross = lines
    .filter((l) => lineCountsTowardTotal(l))
    .reduce((sum, l) => sum + lineTotalPence(l), 0)
  const discount = Math.min(Math.max(opts.discountPence || 0, 0), gross)
  const subtotalPence = gross - discount
  const vatPence = Math.round(subtotalPence * ((opts.vatRate || 0) / 100))
  const totalPence = subtotalPence + vatPence
  return { subtotalPence, vatPence, totalPence }
}

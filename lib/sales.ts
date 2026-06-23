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

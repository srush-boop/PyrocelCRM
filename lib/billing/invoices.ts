import type { BillingFrequency, InvoiceStatus } from '@/lib/types/database'

export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  bi_monthly: 'Every 2 months',
  four_monthly: 'Every 4 months',
  annual: 'Annual',
  on_demand: 'On demand',
}

// UK financial year starts 1 April. Change here if the business FY differs.
export const FINANCIAL_YEAR_START_MONTH = 4 // April (1-indexed)
export const INVOICE_NUMBER_PREFIX = 'INV'
export const DEFAULT_TAX_RATE = 20

/**
 * Return the financial-year START year for a date. With an April start,
 * 2026-03-15 belongs to FY 2025 and 2026-04-06 belongs to FY 2026.
 */
export function financialYearOf(date: Date, startMonth = FINANCIAL_YEAR_START_MONTH): number {
  const month = date.getMonth() + 1 // 1-indexed
  return month >= startMonth ? date.getFullYear() : date.getFullYear() - 1
}

/** Human label for a financial year, e.g. 2026 -> "2026/27". */
export function financialYearLabel(fy: number): string {
  const end = (fy + 1) % 100
  return `${fy}/${String(end).padStart(2, '0')}`
}

/** Format a reserved sequence into a full invoice number, e.g. INV-2026-0001. */
export function formatInvoiceNumber(fy: number, seq: number): string {
  return `${INVOICE_NUMBER_PREFIX}-${fy}-${String(seq).padStart(4, '0')}`
}

export const CREDIT_NOTE_NUMBER_PREFIX = 'CRN'

/** Format a reserved sequence into a full credit-note number, e.g. CRN-2026-0001. */
export function formatCreditNoteNumber(fy: number, seq: number): string {
  return `${CREDIT_NOTE_NUMBER_PREFIX}-${fy}-${String(seq).padStart(4, '0')}`
}

/** Format integer pence as GBP, e.g. 123456 -> "£1,234.56". */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format((pence ?? 0) / 100)
}

/** Round a quantity × unit-price (pence) product to whole pence. */
export function lineAmountPence(quantity: number, unitPricePence: number): number {
  return Math.round((quantity ?? 0) * (unitPricePence ?? 0))
}

/** Compute subtotal/tax/total (pence) from line items and a percentage rate. */
export function computeInvoiceTotals(
  lines: { amount_pence: number }[],
  taxRate: number,
): { subtotalPence: number; taxPence: number; totalPence: number } {
  const subtotalPence = lines.reduce((sum, l) => sum + (l.amount_pence ?? 0), 0)
  const taxPence = Math.round((subtotalPence * (taxRate ?? 0)) / 100)
  return { subtotalPence, taxPence, totalPence: subtotalPence + taxPence }
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  void: 'Void',
}

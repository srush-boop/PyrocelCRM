import type {
  RecurringCharge,
  RecurringFrequency,
  RecurringTiming,
} from '@/lib/types/database'

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannual: 'Every 6 months',
  annual: 'Annual',
}

export const RECURRING_TIMING_LABELS: Record<RecurringTiming, string> = {
  advance: 'In advance',
  arrears: 'In arrears',
  on_completion: 'On completion',
}

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** How many months (or a fractional month for weekly) a frequency spans. */
function frequencyMonths(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 0 // handled separately (7-day step)
    case 'monthly':
      return 1
    case 'quarterly':
      return 3
    case 'biannual':
      return 6
    case 'annual':
      return 12
  }
}

/**
 * How many times a charge of the given frequency is billed in a year. Weekly is
 * treated as 52. Used to convert between an annual total and a per-period price.
 */
export function annualOccurrences(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 52
    case 'monthly':
      return 12
    case 'quarterly':
      return 4
    case 'biannual':
      return 2
    case 'annual':
      return 1
  }
}

/**
 * Given an annual total (pence), the whole-pence amount to bill each period.
 * Rounded to the nearest penny; over a year the small rounding drift is at most
 * a few pence, which is acceptable for recurring billing.
 */
export function perPeriodFromAnnual(annualPence: number, frequency: RecurringFrequency): number {
  return Math.round(annualPence / annualOccurrences(frequency))
}

/** Given a per-period price (pence), the implied annual total. */
export function annualFromPerPeriod(perPeriodPence: number, frequency: RecurringFrequency): number {
  return Math.round(perPeriodPence * annualOccurrences(frequency))
}

/** Advance a date by one period of the given frequency (UTC-safe date math). */
export function addPeriod(from: Date, frequency: RecurringFrequency): Date {
  const d = new Date(from)
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7)
    return d
  }
  d.setMonth(d.getMonth() + frequencyMonths(frequency))
  return d
}

/**
 * The next date this charge should be invoiced, as a YYYY-MM-DD string.
 * Based on last_invoiced_date (or start_date) + one period. Charges never
 * invoiced default to their start date (or today when unset).
 */
export function nextDueDate(charge: Pick<RecurringCharge, 'frequency' | 'last_invoiced_date' | 'start_date'>): string {
  const today = new Date()
  if (!charge.last_invoiced_date) {
    return (charge.start_date ?? toISODate(today))
  }
  const last = parseISODate(charge.last_invoiced_date)
  return toISODate(addPeriod(last, charge.frequency))
}

/**
 * Whether the charge is due for invoicing as of `asOf`. `on_completion` charges
 * are never surfaced by date alone — they are gated on the linked call being
 * completed (handled in the assembly layer), so this returns false for them.
 */
export function isDueNow(
  charge: Pick<RecurringCharge, 'frequency' | 'last_invoiced_date' | 'start_date' | 'timing' | 'active'>,
  asOf: Date = new Date(),
): boolean {
  if (!charge.active) return false
  if (charge.timing === 'on_completion') return false
  const due = parseISODate(nextDueDate(charge))
  // Advance charges become due at the start of the period; arrears at the end.
  // nextDueDate already reflects the period boundary, so a simple compare works.
  return due.getTime() <= startOfDay(asOf).getTime()
}

/** Gross margin in pence: sell − buy (only meaningful when subcontracted). */
export function marginPence(
  charge: Pick<RecurringCharge, 'is_subcontracted' | 'unit_price_pence' | 'subcontract_price_pence' | 'quantity'>,
): number | null {
  if (!charge.is_subcontracted || charge.subcontract_price_pence == null) return null
  const qty = charge.quantity ?? 1
  return Math.round((charge.unit_price_pence - charge.subcontract_price_pence) * qty)
}

/** Margin as a percentage of the sell price, or null when not subcontracted / sell is 0. */
export function marginPct(
  charge: Pick<RecurringCharge, 'is_subcontracted' | 'unit_price_pence' | 'subcontract_price_pence'>,
): number | null {
  if (!charge.is_subcontracted || charge.subcontract_price_pence == null) return null
  if (!charge.unit_price_pence) return null
  return ((charge.unit_price_pence - charge.subcontract_price_pence) / charge.unit_price_pence) * 100
}

/** Apply a % or fixed-pence uplift to a price, returning whole pence. */
export function applyUplift(
  currentPence: number,
  uplift: { mode: 'percent'; value: number } | { mode: 'fixed'; valuePence: number },
): number {
  if (uplift.mode === 'percent') {
    return Math.round(currentPence * (1 + uplift.value / 100))
  }
  return Math.max(0, currentPence + uplift.valuePence)
}

// --- small date utilities (kept local to avoid a new dependency) ---

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

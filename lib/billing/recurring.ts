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
  per_visit: 'Per completed visit',
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

// --- Per-visit (on-completion split) billing -------------------------------
// A `per_visit` charge bills the FULL ANNUAL VALUE spread across the visits that
// occur in one service cycle: 1 visit = 100%, 2 = 50% each, 3 = 33.3% with the
// last visit absorbing the rounding remainder so the cycle sums exactly.

/**
 * The full annual value of a charge in pence. `unit_price_pence` is always the
 * per-period amount, so the annual total is that times the periods in a year.
 * For an annual-billed contract (the usual per_visit case) this is simply
 * unit_price_pence × quantity.
 */
export function fullAnnualValuePence(
  charge: Pick<RecurringCharge, 'unit_price_pence' | 'quantity' | 'frequency'>,
): number {
  const qty = charge.quantity ?? 1
  return Math.round(charge.unit_price_pence * qty * annualOccurrences(charge.frequency))
}

/**
 * Visits per year implied by a service's visit interval in months. Rounded and
 * clamped to at least 1 (e.g. 6-monthly → 2, 3-monthly → 4, 12-monthly → 1,
 * 24-monthly → 1 as it is billed once on the single visit that occurs).
 */
export function visitsPerYearFromMonths(frequencyMonthsValue: number | null | undefined): number {
  if (!frequencyMonthsValue || frequencyMonthsValue <= 0) return 1
  return Math.max(1, Math.round(12 / frequencyMonthsValue))
}

/**
 * How many visits the full value is split across for this charge: the manual
 * per-charge override when set, otherwise derived from the linked service's
 * visit frequency (in months). Always ≥ 1.
 */
export function visitsPerCycle(
  charge: Pick<RecurringCharge, 'visits_per_cycle'>,
  serviceFrequencyMonths: number | null | undefined,
): number {
  if (charge.visits_per_cycle && charge.visits_per_cycle >= 1) return charge.visits_per_cycle
  return visitsPerYearFromMonths(serviceFrequencyMonths)
}

/**
 * Split a full value (pence) into `n` whole-pence shares. Every share is the
 * floor of the even split except the LAST, which absorbs the remainder so the
 * shares sum to exactly `fullPence`.
 */
export function splitFullValue(fullPence: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n))
  const base = Math.floor(fullPence / count)
  const shares = Array.from({ length: count }, () => base)
  shares[count - 1] = fullPence - base * (count - 1)
  return shares
}

/**
 * The 0-based cycle position for the next visit to be billed, given how many
 * visits have already been billed for this charge. Wraps every `n` visits so a
 * new cycle starts cleanly (visit 3 of a 2-visit cycle is index 0 again).
 */
export function cycleIndexForVisit(priorBilledCount: number, n: number): number {
  const count = Math.max(1, Math.floor(n))
  return ((priorBilledCount % count) + count) % count
}

/**
 * The pence amount to bill for the next visit of a `per_visit` charge: the share
 * at the current cycle index of the full-value split.
 */
export function perVisitAmountPence(
  charge: Pick<RecurringCharge, 'unit_price_pence' | 'quantity' | 'frequency' | 'visits_per_cycle'>,
  serviceFrequencyMonths: number | null | undefined,
  priorBilledCount: number,
): { amountPence: number; cycleIndex: number; visitsInCycle: number } {
  const n = visitsPerCycle(charge, serviceFrequencyMonths)
  const shares = splitFullValue(fullAnnualValuePence(charge), n)
  const cycleIndex = cycleIndexForVisit(priorBilledCount, n)
  return { amountPence: shares[cycleIndex], cycleIndex, visitsInCycle: n }
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

/** Step a date back by one period of the given frequency. */
export function subPeriod(from: Date, frequency: RecurringFrequency): Date {
  const d = new Date(from)
  if (frequency === 'weekly') {
    d.setDate(d.getDate() - 7)
    return d
  }
  d.setMonth(d.getMonth() - frequencyMonths(frequency))
  return d
}

// --- Coverage period (what a billed occurrence covers) ---------------------

/**
 * The date window a single billed occurrence covers, given the date being
 * invoiced (`dueDateISO`, from nextDueDate). Advance charges cover the upcoming
 * period starting at the due date; arrears cover the period that just ended.
 * Completion-driven timings (on_completion / per_visit) are treated like the
 * upcoming period from the due date as a reasonable default label.
 */
export function coverageWindow(
  charge: Pick<RecurringCharge, 'frequency' | 'timing'>,
  dueDateISO: string,
): { start: Date; end: Date } {
  const due = parseISODate(dueDateISO)
  if (charge.timing === 'arrears') {
    const start = subPeriod(due, charge.frequency)
    const end = new Date(due)
    end.setDate(end.getDate() - 1)
    return { start, end }
  }
  const start = due
  const end = subPeriod(addPeriod(due, charge.frequency), charge.frequency)
  // end should be one day before the next period boundary.
  const boundary = addPeriod(due, charge.frequency)
  const inclusiveEnd = new Date(boundary)
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
  return { start, end: inclusiveEnd }
}

const MONTH_SHORT = MONTH_LABELS.map((m) => m.slice(0, 3))

/**
 * A concise human label for the period a billed occurrence covers, e.g.
 * "Jul 2026" (monthly), "Jul–Sep 2026" (quarterly), "Oct 2026 – Mar 2027"
 * (spanning years), or "7–13 Jul 2026" (weekly).
 */
export function formatCoveragePeriod(
  charge: Pick<RecurringCharge, 'frequency' | 'timing'>,
  dueDateISO: string,
): string {
  const { start, end } = coverageWindow(charge, dueDateISO)
  const sMon = MONTH_SHORT[start.getMonth()]
  const eMon = MONTH_SHORT[end.getMonth()]
  const sYr = start.getFullYear()
  const eYr = end.getFullYear()

  if (charge.frequency === 'weekly') {
    // Day-level range for weekly cover.
    if (start.getMonth() === end.getMonth() && sYr === eYr) {
      return `${start.getDate()}–${end.getDate()} ${sMon} ${sYr}`
    }
    return `${start.getDate()} ${sMon} ${sYr} – ${end.getDate()} ${eMon} ${eYr}`
  }

  if (charge.frequency === 'monthly') {
    return `${sMon} ${sYr}`
  }

  // Multi-month periods: collapse the year when the range stays within it.
  if (sYr === eYr) {
    return sMon === eMon ? `${sMon} ${sYr}` : `${sMon}–${eMon} ${sYr}`
  }
  return `${sMon} ${sYr} – ${eMon} ${eYr}`
}

/**
 * Build a "System / Service" label from the (possibly partial) names linked to
 * a recurring charge's site_service. Returns null when nothing is known.
 *
 * The system portion always surfaces the system TYPE (e.g. "Fire Alarm") when
 * known so recurring invoice lines identify the service type + system type, and
 * appends the specific system's own name in parentheses when it differs. The
 * service portion is the service type name.
 */
export function systemServiceLabel(input: {
  systemName?: string | null
  systemTypeName?: string | null
  serviceName?: string | null
}): string | null {
  const type = input.systemTypeName?.trim() || null
  const name = input.systemName?.trim() || null
  let sys: string | null
  if (type && name && name !== type) sys = `${type} (${name})`
  else sys = type || name
  const svc = input.serviceName?.trim() || null
  if (sys && svc) return `${sys} / ${svc}`
  return sys || svc || null
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
  // Completion-driven timings are never due by date alone — they are gated on a
  // linked call completing (handled in the assembly / visit-billing layers).
  if (charge.timing === 'on_completion' || charge.timing === 'per_visit') return false
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

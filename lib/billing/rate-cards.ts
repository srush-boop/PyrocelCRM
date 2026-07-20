// Pure, framework-agnostic pricing helpers for banded call-out + labour rate
// cards. No 'use server' / server-only imports so this can be unit-tested and
// reused by both server actions and (potentially) client previews.

export type RateBand = 'standard' | 'evening' | 'weekend' | 'bank_holiday'

export const RATE_BANDS: RateBand[] = ['standard', 'evening', 'weekend', 'bank_holiday']

export const RATE_BAND_LABELS: Record<RateBand, string> = {
  standard: 'Standard',
  evening: 'Evening',
  weekend: 'Weekend',
  bank_holiday: 'Bank holiday',
}

export interface RateCardBand {
  band: RateBand
  /** Fixed call-out / attendance charge, in pence. */
  attendance_fee_pence: number
  /** Labour hours already covered by the attendance fee. */
  attendance_included_hours: number
  /** Per-hour labour charge beyond the included hours, in pence. */
  hourly_rate_pence: number
}

export interface RateCard {
  id: string
  name: string
  is_default: boolean
  /** When true, per-call travel hours are added to billable labour hours. */
  include_travel_time: boolean
  /** Floor applied to on-site hours. */
  min_labour_hours: number
  /** On-site hours are rounded up to a multiple of this. */
  round_increment_hours: number
  active: boolean
  /** Nominal code for attendance / call-out fee lines (falls back to service type). */
  attendance_nominal_code_id: string | null
  /** Nominal code for hourly labour lines (falls back to service type). */
  labour_nominal_code_id: string | null
  bands: RateCardBand[]
}

// Standard (daytime) working window, local time. Outside this on a weekday is
// treated as the "evening" band. Weekend / bank holiday take precedence.
const STANDARD_START_HOUR = 8
const STANDARD_END_HOUR = 18

/** Local yyyy-mm-dd for a Date (used for bank-holiday set lookups). */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/**
 * Classify a call's attendance moment into a rate band. Bank holidays and
 * weekends take precedence over weekday time-of-day. Outside standard daytime
 * hours on a weekday is "evening". `isEmergency` only nudges an otherwise
 * "standard" classification to "evening" when the time is unknown/ambiguous
 * (emergencies are inherently out-of-hours work).
 */
export function deriveRateBand(
  when: Date,
  opts: { bankHolidays: Set<string>; isEmergency?: boolean; timeKnown?: boolean },
): RateBand {
  const iso = toLocalISODate(when)
  if (opts.bankHolidays.has(iso)) return 'bank_holiday'
  const day = when.getDay() // 0 = Sun ... 6 = Sat
  if (day === 0 || day === 6) return 'weekend'

  const timeKnown = opts.timeKnown !== false
  if (!timeKnown) {
    // No reliable time: an emergency defaults to the out-of-hours evening band,
    // otherwise assume a normal daytime visit.
    return opts.isEmergency ? 'evening' : 'standard'
  }
  const hour = when.getHours()
  if (hour < STANDARD_START_HOUR || hour >= STANDARD_END_HOUR) return 'evening'
  return 'standard'
}

/** Round a value up to the nearest multiple of `increment`. */
function roundUpTo(value: number, increment: number): number {
  if (increment <= 0) return value
  return Math.ceil(value / increment) * increment
}

/**
 * On-site hours from the actual start/finish timestamps, rounded up to the
 * card's increment and floored at its minimum. Returns the minimum when the
 * timestamps are missing or non-positive.
 */
export function computeOnSiteHours(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  opts: { minHours: number; incrementHours: number },
): number {
  const min = Math.max(0, opts.minHours)
  if (!startedAt || !completedAt) return min
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return min
  const rawHours = (end - start) / (1000 * 60 * 60)
  const rounded = roundUpTo(rawHours, opts.incrementHours)
  return Math.max(min, Number(rounded.toFixed(2)))
}

export interface PricedCall {
  band: RateBand
  onSiteHours: number
  travelHours: number
  /** Labour hours charged at the hourly rate (after included hours). */
  chargeHours: number
  /** Per-hour labour rate for the band, in pence (line unit price). */
  hourlyRatePence: number
  /** Hours already covered by the attendance fee. */
  includedHours: number
  attendancePence: number
  labourPence: number
}

/**
 * Price a single call against a resolved rate card + already-derived band.
 * attendance = fixed fee; labour = (onSite + optional travel − included) × rate,
 * never negative.
 */
export function priceCall(params: {
  card: RateCard
  band: RateBand
  onSiteHours: number
  travelHours?: number
}): PricedCall {
  const { card, band } = params
  const bandRow =
    card.bands.find((b) => b.band === band) ??
    ({
      band,
      attendance_fee_pence: 0,
      attendance_included_hours: 0,
      hourly_rate_pence: 0,
    } satisfies RateCardBand)

  const travelHours = card.include_travel_time ? Math.max(0, params.travelHours ?? 0) : 0
  const billableHours = params.onSiteHours + travelHours
  const chargeHours = Math.max(0, Number((billableHours - bandRow.attendance_included_hours).toFixed(2)))
  const labourPence = Math.round(chargeHours * bandRow.hourly_rate_pence)

  return {
    band,
    onSiteHours: params.onSiteHours,
    travelHours,
    chargeHours,
    hourlyRatePence: bandRow.hourly_rate_pence,
    includedHours: bandRow.attendance_included_hours,
    attendancePence: bandRow.attendance_fee_pence,
    labourPence,
  }
}

/**
 * Resolve which rate card applies: the billing account's explicit override when
 * set and available, otherwise the company default. Returns null when neither
 * exists (caller falls back to zero-priced lines).
 */
export function resolveRateCard(
  overrideCardId: string | null | undefined,
  cardsById: Map<string, RateCard>,
  defaultCard: RateCard | null,
): RateCard | null {
  if (overrideCardId) {
    const override = cardsById.get(overrideCardId)
    if (override && override.active) return override
  }
  return defaultCard
}

/**
 * Resolve a rate card from the scoped override chain, most specific first:
 * service -> site -> customer (billing account) -> company default. A client can
 * therefore pay different rates for different sites and services. The first
 * override that points at an active card wins; otherwise the company default.
 */
export function resolveRateCardFromChain(
  overrides: {
    serviceCardId?: string | null
    siteCardId?: string | null
    customerCardId?: string | null
  },
  cardsById: Map<string, RateCard>,
  defaultCard: RateCard | null,
): RateCard | null {
  for (const id of [overrides.serviceCardId, overrides.siteCardId, overrides.customerCardId]) {
    if (!id) continue
    const card = cardsById.get(id)
    if (card && card.active) return card
  }
  return defaultCard
}

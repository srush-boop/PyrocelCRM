import type { RecurringFrequency } from '@/lib/types/database'
import { annualOccurrences } from '@/lib/billing/recurring'

/**
 * Labour cost & profitability maths.
 *
 * All money is in integer pence. These helpers are PURE (no I/O) so they can be
 * unit-tested in isolation; the server actions in
 * `app/(dashboard)/dashboard/labour-costs/actions.ts` and the per-call card
 * feed them data loaded from the database.
 *
 * Cost   = time-on-site (minus pauses) × the engineer's cost/hour.
 * Revenue for a recurring visit = the service's annual net value (comprehensive
 *          uplift stripped) split across the year's visits, weighted by visit
 *          type. Reactive/one-off calls use their actual charge value.
 * Profit  = revenue − cost. Margin % = profit / revenue.
 */

const SECONDS_PER_HOUR = 3600

// --- Cost/hour resolution ---------------------------------------------------

/**
 * The effective cost/hour for an engineer: their personal override wins, else
 * the role default, else null (unknown — cost cannot be computed).
 */
export function resolveCostPerHourPence(
  userCostPerHourPence: number | null | undefined,
  roleCostPerHourPence: number | null | undefined,
): number | null {
  if (typeof userCostPerHourPence === 'number' && userCostPerHourPence >= 0) {
    return userCostPerHourPence
  }
  if (typeof roleCostPerHourPence === 'number' && roleCostPerHourPence >= 0) {
    return roleCostPerHourPence
  }
  return null
}

// --- Time on site -----------------------------------------------------------

/**
 * On-site hours for a single call: (completed − started − paused), clamped to
 * zero. `totalPausedSeconds` is the accumulated paused time recorded on the
 * task. Returns 0 when either timestamp is missing.
 */
export function onSiteHours(
  startedAt: string | Date | null | undefined,
  completedAt: string | Date | null | undefined,
  totalPausedSeconds = 0,
): number {
  if (!startedAt || !completedAt) return 0
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const grossSeconds = (end - start) / 1000
  const netSeconds = grossSeconds - Math.max(0, totalPausedSeconds)
  return Math.max(0, netSeconds / SECONDS_PER_HOUR)
}

/**
 * Effective paused seconds for a task, folding in an OPEN pause. Normally
 * `resumeTask`/completion accumulate pauses into `total_paused_seconds`, but a
 * call can be completed while still paused (its `paused_at` is set and
 * `completed_at` exists). In that case the still-open pause is counted up to the
 * completion time so on-site cost never includes the trailing paused period.
 */
export function effectivePausedSeconds(
  totalPausedSeconds: number | null | undefined,
  pausedAt: string | Date | null | undefined,
  completedAt: string | Date | null | undefined,
): number {
  let total = Math.max(0, totalPausedSeconds ?? 0)
  if (pausedAt && completedAt) {
    const pStart = new Date(pausedAt).getTime()
    const pEnd = new Date(completedAt).getTime()
    if (Number.isFinite(pStart) && Number.isFinite(pEnd) && pEnd > pStart) {
      total += Math.floor((pEnd - pStart) / 1000)
    }
  }
  return total
}

/** Labour cost in pence for a given number of on-site hours. */
export function labourCostPence(hours: number, costPerHourPence: number | null): number {
  if (costPerHourPence == null || costPerHourPence < 0) return 0
  return Math.round(Math.max(0, hours) * costPerHourPence)
}

// --- Recurring revenue per visit -------------------------------------------

/**
 * Strip a comprehensive-cover uplift out of an annual charge value to leave the
 * "actual service" revenue. A comprehensive contract bakes an uplift percentage
 * into the price (e.g. +25%); the underlying service revenue is therefore
 * `annual / (1 + pct/100)`. When the service is not comprehensive, or no uplift
 * is set, the annual value is returned unchanged.
 */
export function stripComprehensiveUpliftPence(
  annualPence: number,
  comprehensiveCover: boolean | null | undefined,
  upliftPct: number | null | undefined,
): number {
  if (!comprehensiveCover) return annualPence
  if (upliftPct == null || upliftPct <= 0) return annualPence
  return Math.round(annualPence / (1 + upliftPct / 100))
}

/**
 * Revenue attributed to a single visit, splitting the service's annual net
 * value across the year's visits weighted by visit type.
 *
 * - `actualAnnualPence`  — annual net service revenue (uplift already stripped).
 * - `thisVisitWeight`    — the revenue weight of this visit's type.
 * - `totalAnnualWeight`  — sum of the weights of EVERY visit scheduled in the
 *                          rolling year for this service.
 *
 * When the total weight is unknown/zero, falls back to an even split across
 * `visitsPerYear` (or the whole annual value if that is also unknown).
 */
export function weightedVisitRevenuePence(args: {
  actualAnnualPence: number
  thisVisitWeight: number
  totalAnnualWeight: number
  visitsPerYear?: number
}): number {
  const { actualAnnualPence, thisVisitWeight, totalAnnualWeight, visitsPerYear } = args
  if (totalAnnualWeight > 0 && thisVisitWeight > 0) {
    return Math.round(actualAnnualPence * (thisVisitWeight / totalAnnualWeight))
  }
  if (visitsPerYear && visitsPerYear > 0) {
    return Math.round(actualAnnualPence / visitsPerYear)
  }
  return actualAnnualPence
}

/** A visit type's configured yearly cadence and relative value. */
export interface VisitTypeWeighting {
  id: string
  revenue_weight: number | null
  occurrences_per_year: number | null
}

/**
 * Revenue for a single visit using the occurrences × weight model. Each visit
 * type declares how many times per year it happens and its relative value, so
 * one visit of type T is worth:
 *
 *   annual_net × weight_T / Σ_over_types( occurrences × weight )
 *
 * This correctly handles high-frequency cycles (e.g. weekly fire alarm =
 * 1 Annual + 51 Periodic). When occurrences aren't configured for the service
 * (total weighted occurrences is 0) it falls back to an even split across
 * `visitsPerYear`. Returns `{ revenuePence, weighted }` so the UI can show
 * whether a real weighting was applied.
 */
export function occurrenceWeightedVisitRevenuePence(args: {
  actualAnnualPence: number
  visitTypeId: string | null
  visitTypes: VisitTypeWeighting[]
  visitsPerYear: number
}): { revenuePence: number; weighted: boolean } {
  const { actualAnnualPence, visitTypeId, visitTypes, visitsPerYear } = args

  const totalWeightedOccurrences = visitTypes.reduce(
    (sum, v) => sum + (v.occurrences_per_year ?? 0) * (v.revenue_weight ?? 1),
    0,
  )
  const thisWeight =
    (visitTypeId && visitTypes.find((v) => v.id === visitTypeId)?.revenue_weight) || 1

  if (totalWeightedOccurrences > 0 && visitTypeId) {
    return {
      revenuePence: Math.round(actualAnnualPence * (thisWeight / totalWeightedOccurrences)),
      weighted: true,
    }
  }
  // Even split fallback.
  const revenuePence =
    visitsPerYear > 0 ? Math.round(actualAnnualPence / visitsPerYear) : actualAnnualPence
  return { revenuePence, weighted: false }
}

/** Annual net value (pence) of a recurring charge at a given frequency. */
export function chargeAnnualPence(
  unitPricePence: number,
  quantity: number,
  frequency: RecurringFrequency,
): number {
  return Math.round(unitPricePence * (quantity || 1) * annualOccurrences(frequency))
}

// --- Profit / margin --------------------------------------------------------

export interface CallProfit {
  costPence: number
  revenuePence: number
  profitPence: number
  /** null when revenue is unknown/zero (margin is undefined). */
  marginPct: number | null
}

/**
 * Combine a cost and revenue into profit + margin. Margin % is profit as a
 * percentage of revenue; null when revenue is zero (avoids divide-by-zero and
 * signals "revenue not known" to the UI).
 */
export function callProfit(costPence: number, revenuePence: number): CallProfit {
  const profitPence = revenuePence - costPence
  const marginPct = revenuePence > 0 ? (profitPence / revenuePence) * 100 : null
  return { costPence, revenuePence, profitPence, marginPct }
}

// --- Weekly / route day mode -----------------------------------------------

/**
 * Productive on-site hours for a whole day/route: from the first call's start to
 * the last call's finish, minus the engineer's break. Used for weekly services
 * where per-visit apportionment is impractical, so profitability is measured at
 * the day level.
 */
export function dayProductiveHours(args: {
  firstStart: string | Date | null | undefined
  lastFinish: string | Date | null | undefined
  breakMinutes?: number
}): number {
  const { firstStart, lastFinish, breakMinutes = 0 } = args
  if (!firstStart || !lastFinish) return 0
  const start = new Date(firstStart).getTime()
  const end = new Date(lastFinish).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const spanHours = (end - start) / 1000 / SECONDS_PER_HOUR
  return Math.max(0, spanHours - Math.max(0, breakMinutes) / 60)
}

/** Format a margin percentage for display (1 dp), or an em-dash when unknown. */
export function formatMarginPct(marginPct: number | null): string {
  if (marginPct == null) return '\u2014'
  return `${marginPct.toFixed(1)}%`
}

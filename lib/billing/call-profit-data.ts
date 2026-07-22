import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  callProfit,
  chargeAnnualPence,
  effectivePausedSeconds,
  labourCostPence,
  onSiteHours,
  resolveCostPerHourPence,
  stripComprehensiveUpliftPence,
  occurrenceWeightedVisitRevenuePence,
  type CallProfit,
  type VisitTypeWeighting,
} from '@/lib/billing/labour-profit'
import { visitsPerYearFromMonths } from '@/lib/billing/recurring'
import type { RecurringFrequency } from '@/lib/types/database'

/**
 * Per-call cost / profit / margin, resolved server-side. This is the single
 * source of truth for the per-call card and the completed-list margin column,
 * so the number a viewer sees is always consistent.
 *
 * Revenue is resolved in priority order:
 *   1. Invoiced amount — if the call is on an invoice, use the net (ex-VAT)
 *      total of its line items. This is the truest "what it earned".
 *   2. Recurring visit share — for a PPM visit on a recurring service, split the
 *      annual net value (comprehensive uplift stripped) across the year's
 *      visits, weighted by visit type.
 *   3. Unknown — revenue null; the UI shows cost only.
 */
export interface CallProfitResult extends CallProfit {
  onSiteHours: number
  costPerHourPence: number | null
  /**
   * Cost breakdown. `costPence` (from CallProfit) is the TOTAL and always
   * includes parts. These expose the split for the UI.
   */
  labourCostPence: number
  /** Cost of every part used on the call (unit cost × qty), always included. */
  partsCostPence: number
  /** Where the revenue figure came from, for the UI to label/caveat. */
  revenueSource: 'invoice' | 'recurring_visit' | 'none'
  /** True when we have enough to show anything (a cost/hour was resolved). */
  costKnown: boolean
  /** The call's human reference (PYR-YYYY-NNNNNN), for display. */
  referenceNumber: string | null
  /**
   * How a recurring-visit revenue figure was apportioned, so the UI can show
   * the working (e.g. "£18,000/yr ÷ 52 visits"). Null unless the revenue came
   * from a recurring visit share.
   */
  revenueBasis: {
    annualNetPence: number
    visitsPerYear: number
    /** True when a per-visit-type weight was applied; false for an even split. */
    weighted: boolean
  } | null
}

export async function getCallProfit(taskId: string): Promise<CallProfitResult | null> {
  const supabase = await createClient()

  const { data: task } = await supabase
    .from('tasks')
    .select(
      `id, reference_number, status, started_at, completed_at, paused_at, total_paused_seconds,
       assigned_engineer_id, site_service_id, visit_type_id, invoice_id,
       engineer:profiles!tasks_assigned_engineer_id_fkey(
         cost_per_hour_pence, role_ref:roles(cost_per_hour_pence)
       )`,
    )
    .eq('id', taskId)
    .maybeSingle()

  if (!task) return null

  // --- Cost -----------------------------------------------------------------
  const engineer = (task as any).engineer as
    | { cost_per_hour_pence: number | null; role_ref: { cost_per_hour_pence: number | null } | null }
    | null
  const costPerHourPence = resolveCostPerHourPence(
    engineer?.cost_per_hour_pence,
    engineer?.role_ref?.cost_per_hour_pence,
  )
  const pausedSeconds = effectivePausedSeconds(
    (task as any).total_paused_seconds,
    (task as any).paused_at,
    (task as any).completed_at,
  )
  const hours = onSiteHours((task as any).started_at, (task as any).completed_at, pausedSeconds)
  const labourPence = labourCostPence(hours, costPerHourPence)

  // Parts cost — ALWAYS part of the true cost of the call, whether or not the
  // parts are on-charged to the client. Uses each part's unit COST (not sale
  // price) × quantity. Falls back to 0 for parts with no cost recorded.
  const { data: partRows } = await supabase
    .from('call_parts')
    .select('unit_cost_pence, quantity')
    .eq('task_id', taskId)
  const partsCostPence = (partRows ?? []).reduce(
    (sum, p) =>
      sum +
      ((p as { unit_cost_pence: number | null }).unit_cost_pence ?? 0) *
        ((p as { quantity: number | null }).quantity ?? 1),
    0,
  )

  const costPence = labourPence + partsCostPence

  // --- Revenue --------------------------------------------------------------
  let revenuePence = 0
  let revenueSource: CallProfitResult['revenueSource'] = 'none'
  let revenueBasis: CallProfitResult['revenueBasis'] = null

  // 1. Invoiced amount (net of VAT) if the call is on an invoice.
  if ((task as any).invoice_id) {
    const { data: lines } = await supabase
      .from('invoice_line_items')
      .select('amount_pence')
      .eq('task_id', taskId)
    const invoiced = (lines ?? []).reduce(
      (sum, l) => sum + ((l as { amount_pence: number }).amount_pence ?? 0),
      0,
    )
    if (invoiced > 0) {
      revenuePence = invoiced
      revenueSource = 'invoice'
    }
  }

  // 2. Recurring visit share.
  if (revenueSource === 'none' && (task as any).site_service_id) {
    const revenue = await recurringVisitRevenue(
      supabase,
      (task as any).site_service_id,
      (task as any).visit_type_id,
    )
    if (revenue != null) {
      revenuePence = revenue.revenuePence
      revenueSource = 'recurring_visit'
      revenueBasis = {
        annualNetPence: revenue.annualNetPence,
        visitsPerYear: revenue.visitsPerYear,
        weighted: revenue.weighted,
      }
    }
  }

  const profit = callProfit(costPence, revenuePence)
  return {
    ...profit,
    // When revenue is unknown, expose null rather than a misleading 0.
    revenuePence: revenueSource === 'none' ? 0 : profit.revenuePence,
    marginPct: revenueSource === 'none' ? null : profit.marginPct,
    onSiteHours: hours,
    costPerHourPence,
    labourCostPence: labourPence,
    partsCostPence,
    revenueSource,
    costKnown: costPerHourPence != null,
    referenceNumber: (task as any).reference_number ?? null,
    revenueBasis: revenueSource === 'recurring_visit' ? revenueBasis : null,
  }
}

/**
 * Weighted per-visit revenue for a recurring service: annual net value (uplift
 * stripped) split across the year's visits, weighted by visit type. Returns
 * null when the service has no active recurring charge (revenue unknown).
 */
async function recurringVisitRevenue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteServiceId: string,
  visitTypeId: string | null,
): Promise<{
  revenuePence: number
  annualNetPence: number
  visitsPerYear: number
  weighted: boolean
} | null> {
  const { data: siteService } = await supabase
    .from('site_services')
    .select(
      `id, frequency_value, frequency_unit, comprehensive_cover,
       comprehensive_uplift_pct, service_type_id`,
    )
    .eq('id', siteServiceId)
    .maybeSingle()
  if (!siteService) return null

  // Active recurring charges for this service → annual net value.
  const { data: charges } = await supabase
    .from('recurring_charges')
    .select('unit_price_pence, quantity, frequency, active')
    .eq('site_service_id', siteServiceId)
    .eq('active', true)
  if (!charges || charges.length === 0) return null

  const grossAnnual = charges.reduce(
    (sum, c) =>
      sum +
      chargeAnnualPence(
        (c as any).unit_price_pence ?? 0,
        (c as any).quantity ?? 1,
        (c as any).frequency as RecurringFrequency,
      ),
    0,
  )
  const netAnnual = stripComprehensiveUpliftPence(
    grossAnnual,
    (siteService as any).comprehensive_cover,
    (siteService as any).comprehensive_uplift_pct,
  )

  // Normalise the service's visit interval to months (weeks → months) so we can
  // derive visits/year for the even-split fallback.
  const freqValue = (siteService as any).frequency_value as number | null
  const freqUnit = (siteService as any).frequency_unit as 'weeks' | 'months' | null
  const freqMonths =
    freqValue && freqValue > 0
      ? freqUnit === 'weeks'
        ? (freqValue * 7) / 30.44
        : freqValue
      : null
  const visitsPerYear = visitsPerYearFromMonths(freqMonths)

  // Visit-type cadence + weight for this service (to apportion across visits).
  const { data: visitTypes } = await supabase
    .from('service_visit_types')
    .select('id, revenue_weight, occurrences_per_year')
    .eq('service_type_id', (siteService as any).service_type_id)

  const { revenuePence, weighted } = occurrenceWeightedVisitRevenuePence({
    actualAnnualPence: netAnnual,
    visitTypeId,
    visitTypes: (visitTypes ?? []) as VisitTypeWeighting[],
    visitsPerYear,
  })

  return {
    revenuePence,
    annualNetPence: netAnnual,
    visitsPerYear,
    weighted,
  }
}

/**
 * Value-based visit time allocation.
 *
 * Suggests how long a recurring visit "should" take, working back from the
 * visit's value and a target profit margin:
 *
 *   per-visit value = annual service value ÷ visits per year
 *   labour budget   = per-visit value × (1 − margin)
 *   suggested time  = labour budget ÷ hourly cost   (converted to minutes)
 *
 * Worked example (from the brief): a service worth £120/yr over 12 monthly
 * visits is £10/visit. With an engineer cost of £30.93/hr and, say, a 60% target
 * margin, the labour budget is £4/visit → ~7.8 min. Change the margin or cost
 * and the suggested time moves accordingly.
 *
 * The hourly cost is chosen by the service's worker type (CDO vs engineer);
 * subcontractor work falls back to the engineer cost/margin. The margin comes
 * from the department nominated in Maintenance settings (its
 * `default_margin_percent`). All money is handled in pence.
 *
 * The maths is pure; `getVisitTimeConfig` is an isomorphic loader that takes an
 * injected Supabase client (same pattern as lib/task-duration.ts) so this module
 * is safe to import from both server and client code.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveMaintenanceRates,
  type MaintenanceRates,
} from '@/lib/maintenance-calculator'

export type VisitWorkerType = 'cdo' | 'engineer' | 'subcontractor'

export interface VisitTimeConfig {
  /** Engineer cost-to-serve, pounds/hour. */
  engineerCostPerHour: number
  /** CDO cost-to-serve, pounds/hour. */
  cdoCostPerHour: number
  /** Target margin for engineer/subcontractor work, as a percentage (0–100). */
  engineerMarginPct: number
  /** Target margin for CDO work, as a percentage (0–100). */
  cdoMarginPct: number
}

export interface SuggestedVisitTime {
  /** Suggested time on site, rounded to whole minutes. */
  minutes: number
  perVisitValuePence: number
  labourBudgetPence: number
  hourlyCostPence: number
  marginPct: number
  workerType: VisitWorkerType
}

/** Number of visits per year implied by a recurring frequency. */
export function visitsPerYear(
  frequencyValue: number,
  frequencyUnit: 'weeks' | 'months',
): number {
  if (!Number.isFinite(frequencyValue) || frequencyValue <= 0) return 0
  return frequencyUnit === 'weeks' ? 52 / frequencyValue : 12 / frequencyValue
}

/**
 * Suggest a per-visit time allocation from the visit's value. Returns null when
 * there isn't enough to compute (no value, no visits, or a non-positive cost).
 */
export function suggestVisitMinutes(opts: {
  annualValuePence: number
  visitsPerYear: number
  workerType: VisitWorkerType
  config: VisitTimeConfig
}): SuggestedVisitTime | null {
  const { annualValuePence, visitsPerYear: vpy, workerType, config } = opts
  if (vpy <= 0 || !Number.isFinite(annualValuePence) || annualValuePence <= 0) return null

  const isCdo = workerType === 'cdo'
  const hourlyCostPence = Math.round(
    (isCdo ? config.cdoCostPerHour : config.engineerCostPerHour) * 100,
  )
  if (hourlyCostPence <= 0) return null

  const marginPct = isCdo ? config.cdoMarginPct : config.engineerMarginPct
  // Clamp so a stray 100%+ margin can't produce a zero/negative budget.
  const marginFraction = Math.min(Math.max(marginPct / 100, 0), 0.99)

  const perVisitValuePence = annualValuePence / vpy
  const labourBudgetPence = perVisitValuePence * (1 - marginFraction)
  const minutes = (labourBudgetPence / hourlyCostPence) * 60

  return {
    minutes: Math.max(0, Math.round(minutes)),
    perVisitValuePence: Math.round(perVisitValuePence),
    labourBudgetPence: Math.round(labourBudgetPence),
    hourlyCostPence,
    marginPct,
    workerType,
  }
}

/**
 * Resolve the live visit-time config: CDO/engineer hourly costs from the
 * Maintenance rates, and each worker type's target margin from the nominated
 * department's `default_margin_percent`. Missing pieces degrade gracefully
 * (unknown margin → 0%, so the suggestion is simply the full value as budget).
 */
export async function getVisitTimeConfig(
  supabase: SupabaseClient,
): Promise<VisitTimeConfig> {
  const { data: company } = await supabase
    .from('company_info')
    .select('maintenance_rates')
    .limit(1)
    .maybeSingle()

  const rates: MaintenanceRates = resolveMaintenanceRates(
    (company?.maintenance_rates ?? null) as Partial<MaintenanceRates> | null,
  )

  const deptIds = [rates.cdoMarginDepartmentId, rates.engineerMarginDepartmentId].filter(
    (id): id is string => !!id,
  )

  const marginByDept = new Map<string, number>()
  if (deptIds.length > 0) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, default_margin_percent')
      .in('id', deptIds)
    for (const d of (depts ?? []) as { id: string; default_margin_percent: number | null }[]) {
      marginByDept.set(d.id, Number(d.default_margin_percent) || 0)
    }
  }

  return {
    engineerCostPerHour: rates.engineerCost,
    cdoCostPerHour: rates.cdoCost,
    cdoMarginPct: rates.cdoMarginDepartmentId
      ? marginByDept.get(rates.cdoMarginDepartmentId) ?? 0
      : 0,
    engineerMarginPct: rates.engineerMarginDepartmentId
      ? marginByDept.get(rates.engineerMarginDepartmentId) ?? 0
      : 0,
  }
}

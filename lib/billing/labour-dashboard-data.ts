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
  weightedVisitRevenuePence,
} from '@/lib/billing/labour-profit'
import { visitsPerYearFromMonths } from '@/lib/billing/recurring'
import type { RecurringFrequency } from '@/lib/types/database'

export interface LabourDashboardFilters {
  engineerId?: string | null
  serviceTypeId?: string | null
  departmentId?: string | null
  roleId?: string | null
  branchId?: string | null
  clientId?: string | null
  siteId?: string | null
  from?: string | null // ISO date (inclusive)
  to?: string | null // ISO date (inclusive)
}

/** A single completed call, costed and (where known) revenued. */
interface CostedCall {
  taskId: string
  completedAt: string | null
  scheduledDate: string | null
  engineerId: string | null
  engineerName: string
  departmentId: string | null
  departmentName: string
  roleId: string | null
  roleName: string
  branchId: string | null
  branchName: string
  clientId: string | null
  clientName: string
  siteId: string | null
  siteName: string
  serviceTypeId: string | null
  serviceTypeName: string
  hours: number
  costPence: number
  revenuePence: number
  profitPence: number
  revenueKnown: boolean
}

export interface LabourBreakdownRow {
  key: string
  label: string
  calls: number
  hours: number
  costPence: number
  revenuePence: number
  profitPence: number
  marginPct: number | null
  /** Calls whose revenue could be resolved (for caveating margin). */
  revenueKnownCalls: number
}

export interface ProductiveDayRow {
  /** ISO date (yyyy-mm-dd). */
  date: string
  calls: number
  hours: number
}

export interface LabourDashboardResult {
  totals: {
    calls: number
    hours: number
    costPence: number
    revenuePence: number
    profitPence: number
    marginPct: number | null
    revenueKnownCalls: number
  }
  byEngineer: LabourBreakdownRow[]
  byServiceType: LabourBreakdownRow[]
  byDepartment: LabourBreakdownRow[]
  byBranch: LabourBreakdownRow[]
  byRole: LabourBreakdownRow[]
  /** On-site hours per calendar day (productive time). */
  productiveTime: ProductiveDayRow[]
  /** Distinct filter options derived from the data set, for the UI selects. */
  options: {
    engineers: { id: string; name: string }[]
    serviceTypes: { id: string; name: string }[]
    departments: { id: string; name: string }[]
    branches: { id: string; name: string }[]
    roles: { id: string; name: string }[]
    clients: { id: string; name: string }[]
    sites: { id: string; name: string }[]
  }
}

/**
 * Bulk labour-cost aggregation for the dashboard. Fetches completed calls in the
 * range, batch-loads the recurring/invoice data needed to value them, costs each
 * call with the shared pure engine, then rolls the results up across dimensions.
 *
 * Kept deliberately query-light: one tasks query plus three batched lookups,
 * rather than per-call round-trips.
 */
export async function getLabourDashboard(
  filters: LabourDashboardFilters,
): Promise<LabourDashboardResult> {
  const supabase = await createClient()

  let query = supabase
    .from('tasks')
    .select(
      `id, status, started_at, completed_at, paused_at, total_paused_seconds,
       scheduled_date, assigned_engineer_id, site_id, client_id, site_service_id,
       visit_type_id, invoice_id,
       engineer:profiles!tasks_assigned_engineer_id_fkey(
         id, full_name, department_id, branch_id, role_id, cost_per_hour_pence,
         role_ref:roles(id, name, cost_per_hour_pence),
         department:departments(id, name),
         branch:branches(id, name)
       ),
       direct_site:sites!tasks_site_id_fkey(id, name, client:clients(id, name)),
       direct_client:clients!tasks_client_id_fkey(id, name),
       site_service:site_services(
         id, service_type_id, frequency_value, frequency_unit,
         comprehensive_cover, comprehensive_uplift_pct,
         service_type:service_types(id, name),
         site:sites(id, name, client:clients(id, name))
       )`,
    )
    .eq('status', 'completed')
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null)

  if (filters.from) query = query.gte('completed_at', `${filters.from}T00:00:00`)
  if (filters.to) query = query.lte('completed_at', `${filters.to}T23:59:59`)

  const { data: tasks, error } = await query.limit(5000)
  if (error) throw new Error(error.message)

  const rows = (tasks ?? []) as any[]

  // --- Batch lookups --------------------------------------------------------
  const siteServiceIds = Array.from(
    new Set(rows.map((t) => t.site_service_id).filter(Boolean)),
  ) as string[]
  const serviceTypeIds = Array.from(
    new Set(rows.map((t) => t.site_service?.service_type_id).filter(Boolean)),
  ) as string[]
  const invoicedTaskIds = rows.filter((t) => t.invoice_id).map((t) => t.id) as string[]
  const allTaskIds = rows.map((t) => t.id) as string[]

  const [chargeRes, weightRes, lineRes, partsRes] = await Promise.all([
    siteServiceIds.length
      ? supabase
          .from('recurring_charges')
          .select('site_service_id, unit_price_pence, quantity, frequency, active')
          .in('site_service_id', siteServiceIds)
          .eq('active', true)
      : Promise.resolve({ data: [] as any[] }),
    serviceTypeIds.length
      ? supabase
          .from('service_visit_types')
          .select('id, service_type_id, revenue_weight')
          .in('service_type_id', serviceTypeIds)
      : Promise.resolve({ data: [] as any[] }),
    invoicedTaskIds.length
      ? supabase
          .from('invoice_line_items')
          .select('task_id, amount_pence')
          .in('task_id', invoicedTaskIds)
      : Promise.resolve({ data: [] as any[] }),
    allTaskIds.length
      ? supabase
          .from('call_parts')
          .select('task_id, unit_cost_pence, quantity')
          .in('task_id', allTaskIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Group charges by site_service, weights by service_type, invoice sums by task.
  const chargesBySvc = new Map<string, any[]>()
  for (const c of (chargeRes.data ?? []) as any[]) {
    const arr = chargesBySvc.get(c.site_service_id) ?? []
    arr.push(c)
    chargesBySvc.set(c.site_service_id, arr)
  }
  const weightsByType = new Map<string, { id: string; revenue_weight: number | null }[]>()
  for (const w of (weightRes.data ?? []) as any[]) {
    const arr = weightsByType.get(w.service_type_id) ?? []
    arr.push(w)
    weightsByType.set(w.service_type_id, arr)
  }
  const invoiceByTask = new Map<string, number>()
  for (const l of (lineRes.data ?? []) as any[]) {
    invoiceByTask.set(l.task_id, (invoiceByTask.get(l.task_id) ?? 0) + (l.amount_pence ?? 0))
  }
  // Parts cost (unit cost × qty) per task — added to every call's cost.
  const partsCostByTask = new Map<string, number>()
  for (const p of (partsRes.data ?? []) as any[]) {
    partsCostByTask.set(
      p.task_id,
      (partsCostByTask.get(p.task_id) ?? 0) + (p.unit_cost_pence ?? 0) * (p.quantity ?? 1),
    )
  }

  // --- Cost + value each call ----------------------------------------------
  const costed: CostedCall[] = []
  for (const t of rows) {
    const eng = t.engineer as any | null
    const costPerHour = resolveCostPerHourPence(
      eng?.cost_per_hour_pence,
      eng?.role_ref?.cost_per_hour_pence,
    )
    const pausedSeconds = effectivePausedSeconds(t.total_paused_seconds, t.paused_at, t.completed_at)
    const hours = onSiteHours(t.started_at, t.completed_at, pausedSeconds)
    // Cost = labour + parts (parts cost is always part of the true call cost).
    const costPence = labourCostPence(hours, costPerHour) + (partsCostByTask.get(t.id) ?? 0)

    // Revenue: invoice → recurring visit → unknown.
    let revenuePence = 0
    let revenueKnown = false
    const invoiced = invoiceByTask.get(t.id)
    if (invoiced && invoiced > 0) {
      revenuePence = invoiced
      revenueKnown = true
    } else if (t.site_service) {
      const rev = recurringVisitRevenue(t, chargesBySvc, weightsByType)
      if (rev != null) {
        revenuePence = rev
        revenueKnown = true
      }
    }

    const { profitPence } = callProfit(costPence, revenuePence)

    // Resolve site/client with fallback through the service's site.
    const svcSite = t.site_service?.site
    const site = t.direct_site ?? svcSite ?? null
    const client =
      t.direct_client ?? t.direct_site?.client ?? svcSite?.client ?? null

    costed.push({
      taskId: t.id,
      completedAt: t.completed_at,
      scheduledDate: t.scheduled_date,
      engineerId: eng?.id ?? null,
      engineerName: eng?.full_name ?? 'Unassigned',
      departmentId: eng?.department?.id ?? eng?.department_id ?? null,
      departmentName: eng?.department?.name ?? 'No department',
      roleId: eng?.role_ref?.id ?? eng?.role_id ?? null,
      roleName: eng?.role_ref?.name ?? 'No role',
      branchId: eng?.branch?.id ?? eng?.branch_id ?? null,
      branchName: eng?.branch?.name ?? 'No branch',
      clientId: client?.id ?? null,
      clientName: client?.name ?? 'Unknown client',
      siteId: site?.id ?? null,
      siteName: site?.name ?? 'Unknown site',
      serviceTypeId: t.site_service?.service_type?.id ?? t.site_service?.service_type_id ?? null,
      serviceTypeName: t.site_service?.service_type?.name ?? 'No service type',
      hours,
      costPence,
      revenuePence,
      profitPence,
      revenueKnown,
    })
  }

  // --- Distinct filter options (from the full costed set, pre in-memory filter) ---
  const options = buildOptions(costed)

  // --- Apply in-memory filters ---------------------------------------------
  const filtered = costed.filter((c) => {
    if (filters.engineerId && c.engineerId !== filters.engineerId) return false
    if (filters.serviceTypeId && c.serviceTypeId !== filters.serviceTypeId) return false
    if (filters.departmentId && c.departmentId !== filters.departmentId) return false
    if (filters.roleId && c.roleId !== filters.roleId) return false
    if (filters.branchId && c.branchId !== filters.branchId) return false
    if (filters.clientId && c.clientId !== filters.clientId) return false
    if (filters.siteId && c.siteId !== filters.siteId) return false
    return true
  })

  // --- Aggregate ------------------------------------------------------------
  const totals = emptyAccum()
  for (const c of filtered) accumulate(totals, c)

  return {
    totals: {
      calls: totals.calls,
      hours: round2(totals.hours),
      costPence: totals.costPence,
      revenuePence: totals.revenuePence,
      profitPence: totals.profitPence,
      marginPct: marginOf(totals.profitPence, totals.revenuePence, totals.revenueKnownCalls),
      revenueKnownCalls: totals.revenueKnownCalls,
    },
    byEngineer: breakdown(filtered, (c) => [c.engineerId ?? 'none', c.engineerName]),
    byServiceType: breakdown(filtered, (c) => [c.serviceTypeId ?? 'none', c.serviceTypeName]),
    byDepartment: breakdown(filtered, (c) => [c.departmentId ?? 'none', c.departmentName]),
    byBranch: breakdown(filtered, (c) => [c.branchId ?? 'none', c.branchName]),
    byRole: breakdown(filtered, (c) => [c.roleId ?? 'none', c.roleName]),
    productiveTime: productiveTime(filtered),
    options,
  }
}

// --- helpers ----------------------------------------------------------------

function recurringVisitRevenue(
  task: any,
  chargesBySvc: Map<string, any[]>,
  weightsByType: Map<string, { id: string; revenue_weight: number | null }[]>,
): number | null {
  const svc = task.site_service
  if (!svc) return null
  const charges = chargesBySvc.get(svc.id)
  if (!charges || charges.length === 0) return null

  const grossAnnual = charges.reduce(
    (sum, c) =>
      sum +
      chargeAnnualPence(
        c.unit_price_pence ?? 0,
        c.quantity ?? 1,
        c.frequency as RecurringFrequency,
      ),
    0,
  )
  const netAnnual = stripComprehensiveUpliftPence(
    grossAnnual,
    svc.comprehensive_cover,
    svc.comprehensive_uplift_pct,
  )

  const freqValue = svc.frequency_value as number | null
  const freqUnit = svc.frequency_unit as 'weeks' | 'months' | null
  const freqMonths =
    freqValue && freqValue > 0
      ? freqUnit === 'weeks'
        ? (freqValue * 7) / 30.44
        : freqValue
      : null
  const visitsPerYear = visitsPerYearFromMonths(freqMonths)

  const weights = weightsByType.get(svc.service_type_id) ?? []
  const totalWeight = weights.reduce((s, w) => s + (w.revenue_weight ?? 1), 0)
  const thisWeight =
    (task.visit_type_id && weights.find((w) => w.id === task.visit_type_id)?.revenue_weight) || 1

  // Visit-type weights only apportion the cycle correctly when each defined
  // visit type occurs exactly once in the year — i.e. the number of distinct
  // types equals the visits/year. When a type recurs (e.g. 11 monthly Periodic
  // + 1 Annual) we don't store per-cycle occurrence counts, so summing distinct
  // weights would over-attribute. In that ambiguous case we fall back to an even
  // split (weights ignored) rather than produce misleading shares.
  const weightsAreUnambiguous =
    weights.length > 1 && visitsPerYear > 0 && weights.length === visitsPerYear

  return weightedVisitRevenuePence({
    actualAnnualPence: netAnnual,
    thisVisitWeight: weightsAreUnambiguous ? thisWeight : 0,
    totalAnnualWeight: weightsAreUnambiguous && totalWeight > 0 ? totalWeight : 0,
    visitsPerYear,
  })
}

interface Accum {
  calls: number
  hours: number
  costPence: number
  revenuePence: number
  profitPence: number
  revenueKnownCalls: number
}

function emptyAccum(): Accum {
  return { calls: 0, hours: 0, costPence: 0, revenuePence: 0, profitPence: 0, revenueKnownCalls: 0 }
}

function accumulate(a: Accum, c: CostedCall) {
  a.calls += 1
  a.hours += c.hours
  a.costPence += c.costPence
  if (c.revenueKnown) {
    a.revenuePence += c.revenuePence
    a.profitPence += c.profitPence
    a.revenueKnownCalls += 1
  }
}

/**
 * Margin only makes sense across calls whose revenue is known. Returns null when
 * no call in the group had resolvable revenue, so the UI shows "—" rather than a
 * misleading 0% or -100%.
 */
function marginOf(profitPence: number, revenuePence: number, revenueKnownCalls: number): number | null {
  if (revenueKnownCalls === 0 || revenuePence <= 0) return null
  return (profitPence / revenuePence) * 100
}

function breakdown(
  calls: CostedCall[],
  keyFn: (c: CostedCall) => [string, string],
): LabourBreakdownRow[] {
  const map = new Map<string, { label: string; acc: Accum }>()
  for (const c of calls) {
    const [key, label] = keyFn(c)
    let entry = map.get(key)
    if (!entry) {
      entry = { label, acc: emptyAccum() }
      map.set(key, entry)
    }
    accumulate(entry.acc, c)
  }
  return Array.from(map.entries())
    .map(([key, { label, acc }]) => ({
      key,
      label,
      calls: acc.calls,
      hours: round2(acc.hours),
      costPence: acc.costPence,
      revenuePence: acc.revenuePence,
      profitPence: acc.profitPence,
      marginPct: marginOf(acc.profitPence, acc.revenuePence, acc.revenueKnownCalls),
      revenueKnownCalls: acc.revenueKnownCalls,
    }))
    .sort((a, b) => b.profitPence - a.profitPence)
}

function productiveTime(calls: CostedCall[]): ProductiveDayRow[] {
  const map = new Map<string, { calls: number; hours: number }>()
  for (const c of calls) {
    // Use the completion date (fallback to scheduled date) as the working day.
    const day = (c.completedAt ?? c.scheduledDate ?? '').slice(0, 10)
    if (!day) continue
    const entry = map.get(day) ?? { calls: 0, hours: 0 }
    entry.calls += 1
    entry.hours += c.hours
    map.set(day, entry)
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({ date, calls: v.calls, hours: round2(v.hours) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function buildOptions(calls: CostedCall[]): LabourDashboardResult['options'] {
  const uniq = (
    pairs: [string | null, string][],
  ): { id: string; name: string }[] => {
    const m = new Map<string, string>()
    for (const [id, name] of pairs) if (id) m.set(id, name)
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return {
    engineers: uniq(calls.map((c) => [c.engineerId, c.engineerName])),
    serviceTypes: uniq(calls.map((c) => [c.serviceTypeId, c.serviceTypeName])),
    departments: uniq(calls.map((c) => [c.departmentId, c.departmentName])),
    branches: uniq(calls.map((c) => [c.branchId, c.branchName])),
    roles: uniq(calls.map((c) => [c.roleId, c.roleName])),
    clients: uniq(calls.map((c) => [c.clientId, c.clientName])),
    sites: uniq(calls.map((c) => [c.siteId, c.siteName])),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

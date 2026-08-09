'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  parseDateString,
  toDateString,
  computeEvenlySplitVisitDates,
  fetchVisitsByServiceType,
} from '@/lib/scheduling'

export interface GenerateMonthlyCallsResult {
  ok: boolean
  error?: string
  created: number
  skipped: number
  monthLabel: string
}

/** A single call the generator would create, enriched for preview display. */
export interface PlannedCall {
  siteServiceId: string
  visitTypeId: string | null
  scheduledDate: string
  siteName: string
  serviceTypeName: string
  visitLabel: string | null
}

export interface PreviewMonthlyCallsResult {
  ok: boolean
  error?: string
  calls: PlannedCall[]
  skipped: number
  monthLabel: string
}

interface ServiceRow {
  id: string
  site_id: string
  service_type_id: string
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  next_service_date: string | null
  active: boolean | null
  status: string | null
  area_id: string | null
  route_id: string | null
  subcontractor_id: string | null
  worker_type: string | null
  site:
    | {
        status: string | null
        name: string | null
        client_id: string | null
        branch_id: string | null
        route_id: string | null
        client: { id: string; name: string | null } | null
        branch: { id: string; name: string | null } | null
        route: { id: string; name: string | null } | null
      }
    | null
  service_type: { id: string; status: string | null; is_recurring: boolean | null; name: string | null } | null
  site_system: {
    status: string | null
    system_type: { id: string; name: string | null; requires_recurring_visits: boolean | null } | null
  } | null
  area: { id: string; name: string | null } | null
  subcontractor: { id: string; name: string | null } | null
}

/**
 * Optional narrowing applied to the monthly generator. Every field is a simple
 * equality match against the service (or, for `dueByDate`, the projected call
 * date). Undefined/null fields are ignored, so an empty object generates
 * everything due that month exactly as before.
 */
export interface GenerateCallsFilters {
  clientId?: string | null
  siteId?: string | null
  branchId?: string | null
  areaId?: string | null
  routeId?: string | null
  subcontractorId?: string | null
  systemTypeId?: string | null
  serviceTypeId?: string | null
  /** 'cdo' | 'engineer' | 'subcontractor' */
  workerType?: string | null
  /** YYYY-MM-DD. Keep only calls whose projected date is on/before this day. */
  dueByDate?: string | null
}

export interface FilterOption {
  id: string
  name: string
}

/** Distinct, sorted option lists derived from the generatable services. */
export interface GenerateCallsFilterOptions {
  clients: FilterOption[]
  sites: FilterOption[]
  branches: FilterOption[]
  areas: FilterOption[]
  routes: FilterOption[]
  subcontractors: FilterOption[]
  systemTypes: FilterOption[]
  serviceTypes: FilterOption[]
  /** Active engineers a generated batch can be assigned to. */
  engineers: FilterOption[]
}

/** Rich select shared by the planner and the filter-options loader. */
const GENERATABLE_SERVICE_SELECT = `id, site_id, service_type_id, frequency_value, frequency_unit,
  next_service_date, active, status, area_id, route_id, subcontractor_id, worker_type,
  site:sites(status, name, client_id, branch_id, route_id,
    client:clients(id, name), branch:branches(id, name), route:routes(id, name)),
  service_type:service_types(id, status, is_recurring, name),
  site_system:site_systems(status, system_type:system_types(id, name, requires_recurring_visits)),
  area:areas(id, name),
  subcontractor:suppliers(id, name)`

/**
 * Shared "is this service one the monthly generator considers?" predicate.
 * active mirrors status==='live' (trigger-synced), so Engaged (new) and Dormant
 * (dead) services are excluded automatically; charge-only system types and
 * non-recurring (reactive/emergency) service types never auto-generate.
 */
function isGeneratableService(s: ServiceRow): boolean {
  return (
    s.active !== false &&
    s.status !== 'new' &&
    s.status !== 'dead' &&
    s.site?.status !== 'dead' &&
    s.service_type?.status !== 'dead' &&
    s.site_system?.status !== 'new' &&
    s.site_system?.status !== 'dead' &&
    s.site_system?.system_type?.requires_recurring_visits !== false &&
    s.service_type?.is_recurring !== false
  )
}

/** Apply the optional user filters to a single service (equality matches). */
function serviceMatchesFilters(s: ServiceRow, f: GenerateCallsFilters): boolean {
  if (f.clientId && s.site?.client_id !== f.clientId) return false
  if (f.siteId && s.site_id !== f.siteId) return false
  if (f.branchId && s.site?.branch_id !== f.branchId) return false
  if (f.areaId && s.area_id !== f.areaId) return false
  // Routes are site-level (a route is an ordered list of sites).
  if (f.routeId && s.site?.route_id !== f.routeId) return false
  if (f.subcontractorId && s.subcontractor_id !== f.subcontractorId) return false
  if (f.systemTypeId && s.site_system?.system_type?.id !== f.systemTypeId) return false
  if (f.serviceTypeId && s.service_type_id !== f.serviceTypeId) return false
  if (f.workerType && s.worker_type !== f.workerType) return false
  return true
}

interface TaskRow {
  site_service_id: string
  visit_type_id: string | null
  scheduled_date: string
}

/** Add the service frequency to a date (local time, no TZ drift). */
function addFrequency(base: Date, value: number, unit: 'weeks' | 'months'): Date {
  const next = new Date(base)
  if (unit === 'weeks') next.setDate(next.getDate() + value * 7)
  else next.setMonth(next.getMonth() + value)
  return next
}

interface MonthPlan {
  ok: boolean
  error?: string
  monthLabel: string
  rows: TaskRow[]
  skipped: number
  /** Name lookups so callers can enrich rows for display. */
  siteNameByService: Map<string, string>
  serviceTypeNameByService: Map<string, string>
  visitLabelById: Map<string, string>
}

/**
 * Shared planning step for the monthly call generator. Authorises the caller,
 * loads live services and their history, then computes exactly which recurring
 * calls fall due in the target month (by frequency rollover) WITHOUT writing
 * anything. Both the preview and the generate actions build on this so the two
 * always agree.
 *
 * Retrospective months are fully supported: the cadence anchor is rolled
 * forward OR backward to land in the target month, so a contract that arrived
 * late in the month, or a site that was dormant and missed a generate, can be
 * back-filled by selecting a current or past month.
 */
async function planMonthlyCalls(
  year: number,
  month: number,
  filters: GenerateCallsFilters = {},
): Promise<MonthPlan> {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0) // last day of target month
  const monthLabel = monthStart.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
  const base: MonthPlan = {
    ok: true,
    monthLabel,
    rows: [],
    skipped: 0,
    siteNameByService: new Map(),
    serviceTypeNameByService: new Map(),
    visitLabelById: new Map(),
  }

  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return { ...base, ok: false, error: 'Invalid month selected.' }
  }

  const supabase = await createClient()

  // Authorise: office or admin only.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ...base, ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { ...base, ok: false, error: 'You do not have permission to generate calls.' }
  }

  // Load live services (site + service type not "dead"), then apply the
  // optional user filters (client / site / branch / area / route / subcontractor
  // / system type / service type / worker type).
  const { data: serviceData, error: svcError } = await supabase
    .from('site_services')
    .select(GENERATABLE_SERVICE_SELECT)
  if (svcError) {
    return { ...base, ok: false, error: 'Could not load services.' }
  }

  const services = ((serviceData || []) as unknown as ServiceRow[])
    .filter(isGeneratableService)
    .filter((s) => serviceMatchesFilters(s, filters))
  if (services.length === 0) {
    return base
  }

  for (const s of services) {
    base.siteNameByService.set(s.id, s.site?.name ?? 'Site')
    base.serviceTypeNameByService.set(s.id, s.service_type?.name ?? 'Service')
  }

  const serviceIds = services.map((s) => s.id)

  // Load existing tasks for these services to (a) anchor the cadence on the
  // latest scheduled call and (b) skip months that already have a call.
  const { data: taskData, error: taskError } = await supabase
    .from('tasks')
    .select('site_service_id, visit_type_id, scheduled_date')
    .in('site_service_id', serviceIds)
  if (taskError) {
    return { ...base, ok: false, error: 'Could not load existing calls.' }
  }
  const tasks = (taskData || []) as TaskRow[]

  // Authoritative visit types per service type (ordered by sort_order). This is
  // what lets us generate a visit that was deferred at setup and therefore has
  // no task history yet.
  const serviceTypeIds = services.map((s) => s.service_type_id)
  const visitsByServiceType = await fetchVisitsByServiceType(supabase, serviceTypeIds)

  // Visit-type names for preview labels.
  const uniqueTypeIds = Array.from(new Set(serviceTypeIds))
  if (uniqueTypeIds.length > 0) {
    const { data: visitRows } = await supabase
      .from('service_visit_types')
      .select('id, name')
      .in('service_type_id', uniqueTypeIds)
    for (const v of (visitRows ?? []) as { id: string; name: string | null }[]) {
      base.visitLabelById.set(v.id, v.name ?? 'Visit')
    }
  }

  const groupKey = (ssId: string, visitId: string | null) => `${ssId}|${visitId ?? 'none'}`

  // Earliest scheduled date per service — the phase reference for deriving a
  // visit's cadence when the visit itself has no history yet.
  const earliestByService = new Map<string, string>()
  // Latest scheduled date per service+visit — the cadence anchor for visits
  // that DO have history (respects a drifted cadence from late completions).
  const latestByGroup = new Map<string, string>()
  // Service+visit combinations that already have a call in the target month.
  const coveredThisMonth = new Set<string>()
  const startStr = toDateString(monthStart)
  const endStr = toDateString(monthEnd)

  for (const t of tasks) {
    const prevEarliest = earliestByService.get(t.site_service_id)
    if (!prevEarliest || t.scheduled_date < prevEarliest) {
      earliestByService.set(t.site_service_id, t.scheduled_date)
    }
    const key = groupKey(t.site_service_id, t.visit_type_id)
    const prev = latestByGroup.get(key)
    if (!prev || t.scheduled_date > prev) latestByGroup.set(key, t.scheduled_date)
    if (t.scheduled_date >= startStr && t.scheduled_date <= endStr) {
      coveredThisMonth.add(key)
    }
  }

  const newRows: TaskRow[] = []
  let skipped = 0

  for (const svc of services) {
    const visits = visitsByServiceType.get(svc.service_type_id) ?? []
    const visitCount = Math.max(1, visits.length)
    // Build the visit-type groups from the service definition (not history), so
    // deferred visits are included. Zero-visit services use a single null group.
    const groupList =
      visits.length > 0
        ? visits.map((v, index) => ({ visitId: v.id as string | null, index }))
        : [{ visitId: null as string | null, index: 0 }]

    const serviceEarliest = earliestByService.get(svc.id) ?? svc.next_service_date

    for (const g of groupList) {
      const key = groupKey(svc.id, g.visitId)
      if (coveredThisMonth.has(key)) {
        skipped += 1
        continue
      }

      // Anchor priority: the visit's own latest call (accurate for a drifted
      // cadence); otherwise derive its first occurrence from the service phase
      // using the evenly-split offset for this visit's index.
      let anchor: string | null = latestByGroup.get(key) ?? null
      if (!anchor) {
        if (!serviceEarliest) continue
        anchor = computeEvenlySplitVisitDates(
          serviceEarliest,
          { frequency_value: svc.frequency_value, frequency_unit: svc.frequency_unit },
          visitCount,
        )[g.index]
      }

      // Roll the fixed cadence from the anchor toward the target month. The
      // anchor is usually before the month, so we roll forward; if it sits
      // beyond the month we roll backward, so a genuine gap is still filled.
      let project = parseDateString(anchor)
      let guard = 0
      while (project < monthStart && guard < 1040) {
        project = addFrequency(project, svc.frequency_value, svc.frequency_unit)
        guard += 1
      }
      guard = 0
      while (project > monthEnd && guard < 1040) {
        project = addFrequency(project, -svc.frequency_value, svc.frequency_unit)
        guard += 1
      }

      if (project >= monthStart && project <= monthEnd) {
        newRows.push({
          site_service_id: svc.id,
          visit_type_id: g.visitId,
          scheduled_date: toDateString(project),
        })
        // Guard against two groups projecting onto the same month slot.
        coveredThisMonth.add(key)
      }
    }
  }

  // "Due by" cap: only keep calls whose projected date lands on/before the
  // chosen day (YYYY-MM-DD string compare is safe for ISO dates).
  const rows = filters.dueByDate
    ? newRows.filter((r) => r.scheduled_date <= filters.dueByDate!)
    : newRows

  return { ...base, rows, skipped }
}

/**
 * Load the distinct filter option lists for the Generate Calls dialog, derived
 * from exactly the services the generator would consider (so the dropdowns only
 * ever show clients / sites / routes / etc. that actually have generatable
 * recurring services). Office/admin only.
 */
export async function getGenerateCallsFilterOptions(): Promise<
  { ok: true; options: GenerateCallsFilterOptions } | { ok: false; error: string }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { ok: false, error: 'You do not have permission to generate calls.' }
  }

  const [{ data, error }, { data: engineerRows }] = await Promise.all([
    supabase.from('site_services').select(GENERATABLE_SERVICE_SELECT),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'engineer')
      .eq('status', 'active')
      .order('full_name'),
  ])
  if (error) return { ok: false, error: 'Could not load filter options.' }

  const services = ((data || []) as unknown as ServiceRow[]).filter(isGeneratableService)

  const clients = new Map<string, string>()
  const sites = new Map<string, string>()
  const branches = new Map<string, string>()
  const areas = new Map<string, string>()
  const routes = new Map<string, string>()
  const subcontractors = new Map<string, string>()
  const systemTypes = new Map<string, string>()
  const serviceTypes = new Map<string, string>()

  for (const s of services) {
    if (s.site?.client?.id) clients.set(s.site.client.id, s.site.client.name ?? 'Client')
    if (s.site_id) sites.set(s.site_id, s.site?.name ?? 'Site')
    if (s.site?.branch?.id) branches.set(s.site.branch.id, s.site.branch.name ?? 'Branch')
    if (s.area?.id) areas.set(s.area.id, s.area.name ?? 'Area')
    if (s.site?.route?.id) routes.set(s.site.route.id, s.site.route.name ?? 'Route')
    if (s.subcontractor?.id)
      subcontractors.set(s.subcontractor.id, s.subcontractor.name ?? 'Sub-contractor')
    if (s.site_system?.system_type?.id)
      systemTypes.set(s.site_system.system_type.id, s.site_system.system_type.name ?? 'System')
    if (s.service_type?.id)
      serviceTypes.set(s.service_type.id, s.service_type.name ?? 'Service')
  }

  const toSorted = (m: Map<string, string>): FilterOption[] =>
    Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

  const engineers: FilterOption[] = (
    (engineerRows ?? []) as { id: string; full_name: string | null; email: string | null }[]
  ).map((e) => ({ id: e.id, name: e.full_name || e.email || 'Engineer' }))

  return {
    ok: true,
    options: {
      clients: toSorted(clients),
      sites: toSorted(sites),
      branches: toSorted(branches),
      areas: toSorted(areas),
      routes: toSorted(routes),
      subcontractors: toSorted(subcontractors),
      systemTypes: toSorted(systemTypes),
      serviceTypes: toSorted(serviceTypes),
      engineers,
    },
  }
}

/** Enrich raw plan rows into display-ready calls, sorted by date then site. */
function enrichPlan(plan: MonthPlan): PlannedCall[] {
  return plan.rows
    .map((r) => ({
      siteServiceId: r.site_service_id,
      visitTypeId: r.visit_type_id,
      scheduledDate: r.scheduled_date,
      siteName: plan.siteNameByService.get(r.site_service_id) ?? 'Site',
      serviceTypeName: plan.serviceTypeNameByService.get(r.site_service_id) ?? 'Service',
      visitLabel: r.visit_type_id ? plan.visitLabelById.get(r.visit_type_id) ?? null : null,
    }))
    .sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) || a.siteName.localeCompare(b.siteName),
    )
}

/**
 * Dry run: return the calls that WOULD be created for the target month without
 * writing anything. Powers the preview list in the Generate Calls dialog.
 */
export async function previewMonthlyCalls(
  year: number,
  month: number,
  filters: GenerateCallsFilters = {},
): Promise<PreviewMonthlyCallsResult> {
  const plan = await planMonthlyCalls(year, month, filters)
  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error,
      calls: [],
      skipped: plan.skipped,
      monthLabel: plan.monthLabel,
    }
  }
  return {
    ok: true,
    calls: enrichPlan(plan),
    skipped: plan.skipped,
    monthLabel: plan.monthLabel,
  }
}

/**
 * Generate the recurring "calls" (tasks) that fall due in a given month.
 *
 * Intended for the end-of-month office workflow: create next month's calls in
 * one click, and also to back-fill a current/past month that missed its
 * generate. This is now the ONLY place recurring calls are created — completing
 * a call no longer auto-creates the next one. It never duplicates a call that
 * already exists for a service+visit in the target month, so it is safe to run
 * repeatedly.
 *
 * @param year  Full target year (e.g. 2026)
 * @param month 1-12 target month
 */
export async function generateMonthlyCalls(
  year: number,
  month: number,
  filters: GenerateCallsFilters = {},
  assignEngineerId: string | null = null,
): Promise<GenerateMonthlyCallsResult> {
  const plan = await planMonthlyCalls(year, month, filters)
  const empty = { created: 0, skipped: plan.skipped, monthLabel: plan.monthLabel }

  if (!plan.ok) {
    return { ok: false, error: plan.error, ...empty }
  }

  if (plan.rows.length === 0) {
    return { ok: true, created: 0, skipped: plan.skipped, monthLabel: plan.monthLabel }
  }

  const supabase = await createClient()
  // Optionally assign every generated call to a chosen engineer. Empty/omitted
  // leaves them unassigned (the existing default).
  const assignedEngineerId = assignEngineerId || null
  const insertRows = plan.rows.map((r) => ({
    site_service_id: r.site_service_id,
    visit_type_id: r.visit_type_id,
    scheduled_date: r.scheduled_date,
    status: 'pending' as const,
    assigned_engineer_id: assignedEngineerId,
  }))

  const { error: insertError } = await supabase.from('tasks').insert(insertRows)
  if (insertError) {
    return { ok: false, error: 'Failed to create calls. Please try again.', ...empty }
  }

  revalidatePath('/dashboard/schedule')
  return {
    ok: true,
    created: insertRows.length,
    skipped: plan.skipped,
    monthLabel: plan.monthLabel,
  }
}

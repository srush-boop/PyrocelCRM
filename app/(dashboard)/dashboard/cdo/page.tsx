import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, ToleranceUnit } from '@/lib/types/database'
import { isCallOverdue } from '@/lib/kpi'
import {
  CdoManagementView,
  type CdoRoute,
  type CdoEngineer,
  type CdoUnroutedService,
  type CdoCall,
  type CdoStats,
} from '@/components/dashboard/cdo/cdo-management-view'

export const metadata = {
  title: 'CDO Management',
  description: 'Everything related to CDO-delivered services',
}

// Shape of the fields we read off each fetched CDO task to decide overdue.
type CdoTaskRow = {
  id: string
  status: string
  scheduled_date: string | null
  completed_at: string | null
  reference_number: string | null
  is_emergency: boolean | null
  assigned_engineer_id: string | null
  route_id: string | null
  site_service_id: string | null
  site_service?: {
    id: string
    route_id: string | null
    assigned_engineer_id: string | null
    frequency_value?: number | null
    frequency_unit?: 'weeks' | 'months' | null
    client_tolerance_value?: number | null
    client_tolerance_unit?: ToleranceUnit | null
    site?: { id: string; name: string | null } | null
    service_type?: {
      id: string
      name: string | null
      is_recurring?: boolean | null
      regulatory_tolerance_value?: number | null
      regulatory_tolerance_unit?: ToleranceUnit | null
    } | null
  } | null
  assigned_engineer?: { id: string; full_name: string | null } | null
}

export default async function CdoManagementPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/auth/login')

  // Management view — office + admin only (engineers work from the Schedule).
  const role = (profile as Profile).role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // ── CDO-delivered services (worker_type = 'cdo') ──────────────────────────
  const { data: serviceRows } = await supabase
    .from('site_services')
    .select(
      `
      id, route_id, assigned_engineer_id, active,
      site:sites(id, name),
      service_type:service_types(id, name),
      route:routes(id, name, color)
    `,
    )
    .eq('worker_type', 'cdo')
    .not('active', 'is', false)

  type ServiceRow = {
    id: string
    route_id: string | null
    assigned_engineer_id: string | null
    site: { id: string; name: string | null } | null
    service_type: { id: string; name: string | null } | null
    route: { id: string; name: string | null; color: string | null } | null
  }
  const services = (serviceRows ?? []) as unknown as ServiceRow[]

  // ── Routes + CDO engineers ────────────────────────────────────────────────
  const [{ data: routeRows }, { data: engineerRows }] = await Promise.all([
    supabase.from('routes').select('id, name, color, assigned_engineer_id').order('name'),
    supabase
      .from('profiles')
      .select('id, full_name, discipline, role')
      .eq('discipline', 'cdo')
      .order('full_name'),
  ])

  type RouteRow = {
    id: string
    name: string | null
    color: string | null
    assigned_engineer_id: string | null
  }
  const routes = (routeRows ?? []) as RouteRow[]
  const engineers = (engineerRows ?? []) as {
    id: string
    full_name: string | null
    discipline: string | null
    role: string | null
  }[]

  // Names for any engineer referenced by a route/service (may not be CDO-tagged).
  const engineerIds = new Set<string>()
  for (const r of routes) if (r.assigned_engineer_id) engineerIds.add(r.assigned_engineer_id)
  for (const e of engineers) engineerIds.add(e.id)
  const { data: nameRows } = engineerIds.size
    ? await supabase.from('profiles').select('id, full_name').in('id', [...engineerIds])
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map(
    ((nameRows ?? []) as { id: string; full_name: string | null }[]).map((n) => [n.id, n.full_name]),
  )

  // ── CDO calls (tasks on a CDO service) ────────────────────────────────────
  const cdoServiceIds = services.map((s) => s.id)
  const taskSelect = `
    id, status, scheduled_date, completed_at, reference_number, is_emergency,
    assigned_engineer_id, route_id, site_service_id,
    site_service:site_services!inner(
      id, route_id, assigned_engineer_id, worker_type,
      frequency_value, frequency_unit, client_tolerance_value, client_tolerance_unit,
      site:sites(id, name),
      service_type:service_types(id, name, is_recurring, regulatory_tolerance_value, regulatory_tolerance_unit)
    ),
    assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name)
  `

  const [{ data: openRows }, { data: completedCountRes }, { data: completedRecentRows }] =
    await Promise.all([
      cdoServiceIds.length
        ? supabase
            .from('tasks')
            .select(taskSelect)
            .eq('site_service.worker_type', 'cdo')
            .in('status', ['pending', 'in_progress'])
            .order('scheduled_date', { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      // Completed CDO calls in the trailing 90 days (compliance sample).
      cdoServiceIds.length
        ? supabase
            .from('tasks')
            .select(taskSelect)
            .eq('site_service.worker_type', 'cdo')
            .eq('status', 'completed')
            .gte('completed_at', new Date(today.getTime() - 90 * 86_400_000).toISOString())
            .order('completed_at', { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }),
    ])
  void completedRecentRows

  const openTasks = (openRows ?? []) as unknown as CdoTaskRow[]
  const completedTasks = (completedCountRes ?? []) as unknown as CdoTaskRow[]

  const overdueOf = (t: CdoTaskRow) =>
    isCallOverdue({
      scheduledDate: t.scheduled_date,
      status: t.status,
      isRecurring: t.site_service?.service_type?.is_recurring,
      frequencyValue: t.site_service?.frequency_value,
      frequencyUnit: t.site_service?.frequency_unit,
      clientToleranceValue: t.site_service?.client_tolerance_value,
      clientToleranceUnit: t.site_service?.client_tolerance_unit,
      regulatoryToleranceValue: t.site_service?.service_type?.regulatory_tolerance_value,
      regulatoryToleranceUnit: t.site_service?.service_type?.regulatory_tolerance_unit,
    })

  const toCall = (t: CdoTaskRow): CdoCall => ({
    id: t.id,
    reference: t.reference_number,
    status: t.status,
    scheduledDate: t.scheduled_date,
    isEmergency: !!t.is_emergency,
    overdue: overdueOf(t),
    siteName: t.site_service?.site?.name ?? null,
    serviceName: t.site_service?.service_type?.name ?? null,
    engineerId: t.assigned_engineer_id ?? t.site_service?.assigned_engineer_id ?? null,
    engineerName: t.assigned_engineer?.full_name ?? null,
    routeId: t.route_id ?? t.site_service?.route_id ?? null,
  })

  const openCalls = openTasks.map(toCall)
  const overdueCalls = openCalls.filter((c) => c.overdue)
  const unassignedCalls = openCalls.filter((c) => !c.engineerId)

  // ── Per-route rollups ─────────────────────────────────────────────────────
  const openByRoute = new Map<string, { open: number; overdue: number }>()
  for (const c of openCalls) {
    if (!c.routeId) continue
    const agg = openByRoute.get(c.routeId) ?? { open: 0, overdue: 0 }
    agg.open += 1
    if (c.overdue) agg.overdue += 1
    openByRoute.set(c.routeId, agg)
  }
  const servicesByRoute = new Map<string, { sites: Set<string>; services: number }>()
  for (const s of services) {
    if (!s.route_id) continue
    const agg = servicesByRoute.get(s.route_id) ?? { sites: new Set<string>(), services: 0 }
    if (s.site?.id) agg.sites.add(s.site.id)
    agg.services += 1
    servicesByRoute.set(s.route_id, agg)
  }

  const routeCards: CdoRoute[] = routes
    .map((r) => {
      const svc = servicesByRoute.get(r.id)
      const open = openByRoute.get(r.id)
      return {
        id: r.id,
        name: r.name ?? 'Route',
        color: r.color,
        engineerId: r.assigned_engineer_id,
        engineerName: r.assigned_engineer_id ? (nameById.get(r.assigned_engineer_id) ?? null) : null,
        siteCount: svc ? svc.sites.size : 0,
        serviceCount: svc ? svc.services : 0,
        openCalls: open?.open ?? 0,
        overdueCalls: open?.overdue ?? 0,
      }
    })
    // Only routes that actually carry CDO work, or have a CDO engineer assigned.
    .filter((r) => r.serviceCount > 0 || r.openCalls > 0)

  // ── CDO engineers with their route(s) + workload ──────────────────────────
  const routeNameByEngineer = new Map<string, string[]>()
  for (const r of routes) {
    if (!r.assigned_engineer_id) continue
    const arr = routeNameByEngineer.get(r.assigned_engineer_id) ?? []
    arr.push(r.name ?? 'Route')
    routeNameByEngineer.set(r.assigned_engineer_id, arr)
  }
  const openByEngineer = new Map<string, { open: number; overdue: number }>()
  for (const c of openCalls) {
    if (!c.engineerId) continue
    const agg = openByEngineer.get(c.engineerId) ?? { open: 0, overdue: 0 }
    agg.open += 1
    if (c.overdue) agg.overdue += 1
    openByEngineer.set(c.engineerId, agg)
  }
  const engineerCards: CdoEngineer[] = engineers.map((e) => {
    const agg = openByEngineer.get(e.id)
    return {
      id: e.id,
      name: e.full_name ?? 'Engineer',
      routes: routeNameByEngineer.get(e.id) ?? [],
      openCalls: agg?.open ?? 0,
      overdueCalls: agg?.overdue ?? 0,
    }
  })

  // ── Unrouted CDO services ─────────────────────────────────────────────────
  const unrouted: CdoUnroutedService[] = services
    .filter((s) => !s.route_id)
    .map((s) => ({
      id: s.id,
      siteId: s.site?.id ?? null,
      siteName: s.site?.name ?? 'Unknown site',
      serviceName: s.service_type?.name ?? 'Service',
    }))
    .sort((a, b) => a.siteName.localeCompare(b.siteName))

  // ── Compliance over the completed sample (on-time = not completed late) ────
  let onTime = 0
  let assessed = 0
  for (const t of completedTasks) {
    assessed += 1
    // Completed & not flagged overdue at completion time is our proxy for on-time.
    // Re-run the overdue rule using completed_at as "today".
    const wasLate = isCallOverdue(
      {
        scheduledDate: t.scheduled_date,
        status: 'pending',
        isRecurring: t.site_service?.service_type?.is_recurring,
        frequencyValue: t.site_service?.frequency_value,
        frequencyUnit: t.site_service?.frequency_unit,
        clientToleranceValue: t.site_service?.client_tolerance_value,
        clientToleranceUnit: t.site_service?.client_tolerance_unit,
        regulatoryToleranceValue: t.site_service?.service_type?.regulatory_tolerance_value,
        regulatoryToleranceUnit: t.site_service?.service_type?.regulatory_tolerance_unit,
      },
      t.completed_at ? new Date(t.completed_at) : today,
    )
    if (!wasLate) onTime += 1
  }
  const complianceRate = assessed > 0 ? Math.round((onTime / assessed) * 100) : null

  const stats: CdoStats = {
    services: services.length,
    unroutedServices: unrouted.length,
    routes: routeCards.length,
    engineers: engineers.length,
    openCalls: openCalls.length,
    overdueCalls: overdueCalls.length,
    completed90d: assessed,
    complianceRate,
  }

  // Ensure deterministic call ordering: overdue first, then soonest due.
  const rank = (c: CdoCall) => (c.overdue ? 0 : 1)
  const sortCalls = (arr: CdoCall[]) =>
    [...arr].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''),
    )

  return (
    <CdoManagementView
      stats={stats}
      routes={routeCards}
      engineers={engineerCards}
      unrouted={unrouted}
      upcomingCalls={sortCalls(openCalls.filter((c) => !c.overdue)).slice(0, 100)}
      overdueCalls={sortCalls(overdueCalls).slice(0, 100)}
      unassignedCalls={sortCalls(unassignedCalls).slice(0, 100)}
      todayStr={todayStr}
    />
  )
}

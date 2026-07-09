import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { parseDateString, toDateString, computeEvenlySplitVisitDates } from '@/lib/scheduling'

export interface ForecastRow {
  siteServiceId: string
  visitTypeId: string | null
  siteId: string
  siteName: string
  clientName: string | null
  serviceTypeName: string
  systemTypeName: string | null
  visitName: string | null
  routeName: string | null
  date: string
  frequencyLabel: string
  status: 'created' | 'forecast'
  engineerName: string | null
}

interface ServiceRow {
  id: string
  service_type_id: string
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  next_service_date: string | null
  active: boolean | null
  site: {
    id: string
    name: string | null
    status: string | null
    branch_id: string | null
    client: { name: string | null } | null
  } | null
  route: { name: string | null } | null
  service_type: {
    name: string | null
    status: string | null
    system_type: { name: string | null } | null
  } | null
}

interface TaskRow {
  site_service_id: string
  visit_type_id: string | null
  scheduled_date: string
  assigned_engineer: { full_name: string | null } | null
}

/** Add (or subtract, with a negative value) the service frequency to a date. */
function addFrequency(base: Date, value: number, unit: 'weeks' | 'months'): Date {
  const next = new Date(base)
  if (unit === 'weeks') next.setDate(next.getDate() + value * 7)
  else next.setMonth(next.getMonth() + value)
  return next
}

function frequencyLabel(value: number, unit: 'weeks' | 'months'): string {
  const singular = value === 1
  const noun = unit === 'weeks' ? (singular ? 'week' : 'weeks') : singular ? 'month' : 'months'
  return singular ? `Every ${noun}` : `Every ${value} ${noun}`
}

/**
 * Project the recurring "calls" (tasks) that fall due between two dates, whether
 * or not their task records have been generated yet. This powers the schedule
 * planning tool: it forecasts future workload using each service's fixed cadence
 * and visit types, and flags each occurrence as already "created" (a task exists
 * on that date) or "forecast" (not yet generated).
 *
 * The projection logic mirrors the monthly call generator so forecasts line up
 * with what "Generate calls" will actually create.
 */
export async function forecastCalls(
  fromStr: string,
  toStr: string,
  opts: { branchId?: string | null } = {},
): Promise<ForecastRow[]> {
  const supabase = await createClient()

  const { data: serviceData } = await supabase.from('site_services').select(
    `id, service_type_id, frequency_value, frequency_unit, next_service_date, active,
       site:sites(id, name, status, branch_id, client:clients(name)),
       route:routes(name),
       service_type:service_types(name, status, system_type:system_types(name))`,
  )

  let services = ((serviceData || []) as unknown as ServiceRow[]).filter(
    (s) =>
      s.active !== false &&
      s.site?.status !== 'dead' &&
      s.service_type?.status !== 'dead' &&
      s.frequency_value > 0,
  )

  if (opts.branchId) {
    services = services.filter((s) => s.site?.branch_id === opts.branchId)
  }

  if (services.length === 0) return []

  const serviceIds = services.map((s) => s.id)

  // Existing tasks: used to anchor the cadence and to flag created occurrences.
  const { data: taskData } = await supabase
    .from('tasks')
    .select('site_service_id, visit_type_id, scheduled_date, assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name)')
    .in('site_service_id', serviceIds)
  const tasks = (taskData || []) as unknown as TaskRow[]

  // Visit types per service type (id + name), ordered by sort_order.
  const { data: visitData } = await supabase
    .from('service_visit_types')
    .select('id, service_type_id, name, sort_order')
    .in(
      'service_type_id',
      Array.from(new Set(services.map((s) => s.service_type_id))),
    )
    .order('sort_order', { ascending: true })

  const visitsByServiceType = new Map<string, { id: string; name: string | null }[]>()
  for (const v of (visitData || []) as {
    id: string
    service_type_id: string
    name: string | null
  }[]) {
    const list = visitsByServiceType.get(v.service_type_id) ?? []
    list.push({ id: v.id, name: v.name })
    visitsByServiceType.set(v.service_type_id, list)
  }

  const groupKey = (ssId: string, visitId: string | null) => `${ssId}|${visitId ?? 'none'}`

  const earliestByService = new Map<string, string>()
  const latestByGroup = new Map<string, string>()
  // Map of `ssId|visitId|date` -> engineer name for created-call flagging.
  const createdBySlot = new Map<string, string | null>()

  for (const t of tasks) {
    const prevEarliest = earliestByService.get(t.site_service_id)
    if (!prevEarliest || t.scheduled_date < prevEarliest) {
      earliestByService.set(t.site_service_id, t.scheduled_date)
    }
    const key = groupKey(t.site_service_id, t.visit_type_id)
    const prev = latestByGroup.get(key)
    if (!prev || t.scheduled_date > prev) latestByGroup.set(key, t.scheduled_date)
    createdBySlot.set(`${key}|${t.scheduled_date}`, t.assigned_engineer?.full_name ?? null)
  }

  const fromDate = parseDateString(fromStr)
  const toDate = parseDateString(toStr)
  const rows: ForecastRow[] = []

  for (const svc of services) {
    const visits = visitsByServiceType.get(svc.service_type_id) ?? []
    const visitCount = Math.max(1, visits.length)
    const groupList =
      visits.length > 0
        ? visits.map((v, index) => ({ visitId: v.id as string | null, name: v.name, index }))
        : [{ visitId: null as string | null, name: null as string | null, index: 0 }]

    const serviceEarliest = earliestByService.get(svc.id) ?? svc.next_service_date
    const label = frequencyLabel(svc.frequency_value, svc.frequency_unit)

    for (const g of groupList) {
      const key = groupKey(svc.id, g.visitId)

      let anchorStr: string | null = latestByGroup.get(key) ?? null
      if (!anchorStr) {
        if (!serviceEarliest) continue
        anchorStr = computeEvenlySplitVisitDates(
          serviceEarliest,
          { frequency_value: svc.frequency_value, frequency_unit: svc.frequency_unit },
          visitCount,
        )[g.index]
      }

      // Roll the anchor back to just before the range, then step forward through
      // the range collecting every occurrence.
      let d = parseDateString(anchorStr)
      let guard = 0
      while (d >= fromDate && guard < 5000) {
        d = addFrequency(d, -svc.frequency_value, svc.frequency_unit)
        guard += 1
      }
      guard = 0
      while (guard < 5000) {
        d = addFrequency(d, svc.frequency_value, svc.frequency_unit)
        guard += 1
        if (d > toDate) break
        if (d < fromDate) continue
        const dateStr = toDateString(d)
        const slot = createdBySlot.get(`${key}|${dateStr}`)
        const isCreated = createdBySlot.has(`${key}|${dateStr}`)
        rows.push({
          siteServiceId: svc.id,
          visitTypeId: g.visitId,
          siteId: svc.site?.id ?? '',
          siteName: svc.site?.name ?? 'Unknown site',
          clientName: svc.site?.client?.name ?? null,
          serviceTypeName: svc.service_type?.name ?? 'Service',
          systemTypeName: svc.service_type?.system_type?.name ?? null,
          visitName: g.name,
          routeName: svc.route?.name ?? null,
          date: dateStr,
          frequencyLabel: label,
          status: isCreated ? 'created' : 'forecast',
          engineerName: isCreated ? slot ?? null : null,
        })
      }
    }
  }

  // Sort by date, then site name for a readable planning list.
  rows.sort((a, b) => (a.date === b.date ? a.siteName.localeCompare(b.siteName) : a.date.localeCompare(b.date)))

  return rows
}

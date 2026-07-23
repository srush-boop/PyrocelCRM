import type { Route, Site, TaskWithDetails } from '@/lib/types/database'

/**
 * Shared, dependency-free helpers for presenting a CDO engineer's planned
 * routes as an ordered day of work.
 *
 * A "route" is an ordered list of sites (sites.route_id + sites.route_position).
 * A call (task) inherits its route and visiting position from its site, so the
 * order calls should be done in is the site's route_position. These helpers are
 * safe to import from both client components (schedule view) and server code
 * (task page / completion), so they contain NO data-access — callers pass in
 * the already-fetched tasks.
 */

// Lower-case weekday names indexed by Date.getDay() (0 = Sunday).
export const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** The route embedded on a task (via its site). Reactive calls have no route. */
export function taskRoute(task: TaskWithDetails): Route | null {
  const viaService = (task.site_service?.site as (Site & { route?: Route | null }) | undefined)?.route
  const viaDirect = (task as { direct_site?: (Site & { route?: Route | null }) | null }).direct_site?.route
  return viaService ?? viaDirect ?? null
}

/** The site a task belongs to (service-linked or direct/reactive). */
export function taskSite(task: TaskWithDetails): (Site & { route?: Route | null }) | null {
  return (
    (task.site_service?.site as (Site & { route?: Route | null }) | undefined) ??
    (task as { direct_site?: (Site & { route?: Route | null }) | null }).direct_site ??
    null
  )
}

/** The site's planned position within its route (unset sinks to the end). */
export function taskRoutePosition(task: TaskWithDetails): number {
  return taskSite(task)?.route_position ?? Number.MAX_SAFE_INTEGER
}

function scheduledTime(task: TaskWithDetails): number {
  const t = new Date(task.scheduled_date).getTime()
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

/**
 * Order calls the way they should be worked: by the site's planned route
 * position, then by due date, then by site name as a stable tie-break.
 */
export function orderRouteCalls(tasks: TaskWithDetails[]): TaskWithDetails[] {
  return [...tasks].sort((a, b) => {
    const pa = taskRoutePosition(a)
    const pb = taskRoutePosition(b)
    if (pa !== pb) return pa - pb
    const da = scheduledTime(a)
    const db = scheduledTime(b)
    if (da !== db) return da - db
    return (taskSite(a)?.name ?? '').localeCompare(taskSite(b)?.name ?? '')
  })
}

/**
 * Recurring services (weekly / monthly PPM) generate a call per occurrence, so
 * a route can hold several future calls for the same service. For a route day
 * we only ever want the nearest-due occurrence per service, otherwise multiple
 * weeks get mixed into one list. Keeps the soonest-due call per site-service
 * (reactive calls with no site_service are always kept individually).
 */
export function dedupeSoonestPerService(tasks: TaskWithDetails[]): TaskWithDetails[] {
  const bestByService = new Map<string, TaskWithDetails>()
  const kept: TaskWithDetails[] = []
  for (const task of tasks) {
    const key = task.site_service_id
    if (!key) {
      kept.push(task)
      continue
    }
    const existing = bestByService.get(key)
    if (!existing || scheduledTime(task) < scheduledTime(existing)) {
      bestByService.set(key, task)
    }
  }
  return [...kept, ...bestByService.values()]
}

/**
 * The full ordered sequence of calls for one route in the current period:
 * filtered to the route, deduped to the soonest occurrence per service, and
 * ordered by planned position. This is the canonical "route day" list used for
 * both the on-screen order and the "call X of Y" counter.
 */
export function buildRouteSequence(
  tasks: TaskWithDetails[],
  routeId: string,
): TaskWithDetails[] {
  const onRoute = tasks.filter((t) => taskRoute(t)?.id === routeId)
  return orderRouteCalls(dedupeSoonestPerService(onRoute))
}

/** Distinct routes present across a set of tasks, ordered by soonest due call. */
export function routeOptionsFromTasks(
  tasks: TaskWithDetails[],
): { id: string; name: string }[] {
  const soonest = new Map<string, { id: string; name: string; due: number }>()
  for (const task of tasks) {
    const route = taskRoute(task)
    if (!route) continue
    const due = scheduledTime(task)
    const existing = soonest.get(route.id)
    if (!existing || due < existing.due) {
      soonest.set(route.id, { id: route.id, name: route.name, due })
    }
  }
  return [...soonest.values()]
    .sort((a, b) => a.due - b.due || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }))
}

/**
 * Pick the route whose name references today's weekday (e.g. a route named
 * "Monday" or "Leeds — Monday" on a Monday). Falls back to the route with the
 * soonest-due call so the CDO always lands on the most pressing work.
 */
export function defaultRouteForToday(
  routes: { id: string; name: string }[],
  now: Date = new Date(),
): string | null {
  if (routes.length === 0) return null
  const weekday = WEEKDAY_NAMES[now.getDay()]
  const byWeekday = routes.find((r) => r.name.toLowerCase().includes(weekday))
  if (byWeekday) return byWeekday.id
  // routeOptionsFromTasks already returns soonest-due first; callers pass that
  // order through, so the first entry is the most pressing route.
  return routes[0].id
}

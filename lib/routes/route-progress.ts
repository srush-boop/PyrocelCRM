import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskWithDetails } from '@/lib/types/database'
import { taskRoute, taskSite, buildRouteSequence } from '@/lib/routes/route-schedule'

export interface RouteProgress {
  routeId: string
  routeName: string
  // 1-based position of the current call within the route's ordered day.
  position: number
  // Total calls on the route for the current period (deduped per service).
  total: number
  // The next not-yet-done call to jump to on completion, or null if last.
  nextTaskId: string | null
}

/**
 * Resolve where the current call sits within its route's ordered day for the
 * assigned engineer: the "call X of Y" counter and the next call to jump to on
 * completion. Returns null when the call isn't on a route.
 *
 * The route day is built from the engineer's own active calls (pending / in
 * progress / paused) on the same route, deduped to the soonest occurrence per
 * service and ordered by the site's planned route position — the same ordering
 * the schedule view shows, so the counter and list always agree.
 */
export async function getRouteProgressForTask(
  supabase: SupabaseClient,
  currentTask: TaskWithDetails,
  engineerId: string,
): Promise<RouteProgress | null> {
  const route = taskRoute(currentTask)
  if (!route) return null

  const { data: rows } = await supabase
    .from('tasks')
    .select(
      `
      id, scheduled_date, status, site_service_id,
      site_service:site_services(
        site:sites(id, name, route_id, route_position, route:routes(id, name))
      ),
      direct_site:sites!tasks_site_id_fkey(id, name, route_id, route_position, route:routes(id, name))
    `,
    )
    .eq('assigned_engineer_id', engineerId)
    .in('status', ['pending', 'in_progress', 'paused'])

  const active = (rows || []) as unknown as TaskWithDetails[]

  // The current call is what's being worked; make sure it's represented even if
  // its status has already flipped (e.g. just completed before a re-resolve).
  const merged = active.some((t) => t.id === currentTask.id)
    ? active
    : [...active, currentTask]

  const sequence = buildRouteSequence(merged, route.id)

  let index = sequence.findIndex((t) => t.id === currentTask.id)
  // If this exact occurrence was deduped out, fall back to the same service.
  if (index === -1 && currentTask.site_service_id) {
    index = sequence.findIndex((t) => t.site_service_id === currentTask.site_service_id)
  }
  if (index === -1) return null

  const next = sequence.slice(index + 1).find((t) => t.id !== currentTask.id) ?? null

  return {
    routeId: route.id,
    routeName: route.name,
    position: index + 1,
    total: sequence.length,
    nextTaskId: next?.id ?? null,
  }
}

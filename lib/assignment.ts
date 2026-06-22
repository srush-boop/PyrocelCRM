// Centralised logic for resolving WHO performs a service and WHICH engineer a
// task should be assigned to. "Who" (worker_type) is independent of "how" the
// work is routed: a CDO might do route-based work or area-based non-route work
// (e.g. dampers); an engineer is assigned by area; a sub-contractor is external
// and never resolves to an internal engineer.

import type { WorkerType, SiteService, Route, Area, Subcontractor } from '@/lib/types/database'

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  cdo: 'CDO',
  engineer: 'Engineer',
  subcontractor: 'Sub-contractor',
}

// The way a service's work is routed to a worker.
export type AssignmentMethod = 'route' | 'area' | 'direct' | 'subcontractor' | 'unassigned'

export const ASSIGNMENT_METHOD_LABELS: Record<AssignmentMethod, string> = {
  route: 'By route',
  area: 'By area',
  direct: 'Direct to person',
  subcontractor: 'Sub-contractor',
  unassigned: 'Unassigned (open)',
}

/**
 * The subset of a site_service needed to resolve assignment. Relations are
 * optional so callers can pass either ids (resolved separately) or embedded
 * relations.
 */
export interface AssignmentInput {
  worker_type: WorkerType
  assigned_engineer_id?: string | null
  route_id?: string | null
  area_id?: string | null
  subcontractor_id?: string | null
  route?: Pick<Route, 'assigned_engineer_id'> | null
  area?: Pick<Area, 'assigned_engineer_id'> | null
}

/**
 * Which assignment methods are valid for a given worker type.
 * - CDO: route work (most jobs) OR non-route work assigned directly / left open.
 * - Engineer: assigned by area, directly, or left open.
 * - Sub-contractor: assigned to a sub-contractor party.
 */
export function allowedMethodsForWorker(worker: WorkerType): AssignmentMethod[] {
  switch (worker) {
    case 'cdo':
      return ['route', 'area', 'direct', 'unassigned']
    case 'engineer':
      return ['area', 'direct', 'unassigned']
    case 'subcontractor':
      return ['subcontractor']
    default:
      return ['unassigned']
  }
}

/**
 * Determine the current assignment method of a service from its fields.
 */
export function getAssignmentMethod(svc: AssignmentInput): AssignmentMethod {
  if (svc.worker_type === 'subcontractor') return 'subcontractor'
  if (svc.assigned_engineer_id) return 'direct'
  if (svc.route_id) return 'route'
  if (svc.area_id) return 'area'
  return 'unassigned'
}

/**
 * Resolve the engineer (profile id) a task for this service should be assigned
 * to. Returns null when the work is open/unassigned or sub-contracted.
 *
 * Priority: direct engineer override → route engineer → area engineer → none.
 */
export function resolveAssignedEngineerId(svc: AssignmentInput): string | null {
  // Sub-contracted work is never assigned to an internal engineer.
  if (svc.worker_type === 'subcontractor') return null

  // A direct engineer always wins.
  if (svc.assigned_engineer_id) return svc.assigned_engineer_id

  // CDO route work flows from the route's engineer.
  if (svc.route_id && svc.route) return svc.route.assigned_engineer_id ?? null

  // Engineer (and CDO non-route) work flows from the area's worker.
  if (svc.area_id && svc.area) return svc.area.assigned_engineer_id ?? null

  return null
}

/**
 * Human-readable description of who/how a service is delivered, for badges.
 */
export function describeDelivery(
  svc: SiteService & {
    route?: Route | null
    area?: Area | null
    subcontractor?: Subcontractor | null
    assigned_engineer?: { full_name: string | null; email: string } | null
  },
): { worker: string; detail: string } {
  const worker = WORKER_TYPE_LABELS[svc.worker_type]
  const method = getAssignmentMethod(svc)

  let detail: string
  switch (method) {
    case 'subcontractor':
      detail = svc.subcontractor?.name ?? 'Unassigned sub-contractor'
      break
    case 'direct':
      detail = svc.assigned_engineer?.full_name || svc.assigned_engineer?.email || 'Assigned person'
      break
    case 'route':
      detail = svc.route?.name ? `Route: ${svc.route.name}` : 'Route'
      break
    case 'area':
      detail = svc.area?.name ? `Area: ${svc.area.name}` : 'Area'
      break
    default:
      detail = 'Open (unassigned)'
  }

  return { worker, detail }
}

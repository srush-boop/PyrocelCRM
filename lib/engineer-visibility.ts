import type { WorkerType, Discipline } from '@/lib/types/database'

/**
 * Engineer-facing task visibility rules (CDO isolation + sub-contract hiding).
 *
 * These are UX filters layered on top of the existing app-level scoping (an
 * engineer already only loads tasks assigned to them). They ensure:
 *  - No internal engineer ever sees sub-contracted work.
 *  - CDO engineers see ONLY CDO-delivered work.
 *  - Non-CDO engineers never see CDO (route-planned) work.
 *
 * Sub-contractor logins are handled separately (they are scoped to their own
 * allocated tasks) and are not "internal engineers" for these rules.
 */

/** The minimal site-service shape these rules need. */
interface WorkerScopedService {
  worker_type?: WorkerType | null
  service_type?: { default_worker_type?: WorkerType | null } | null
}

interface WorkerScopedTask {
  site_service?: WorkerScopedService | null
}

/**
 * Resolve who performs a service: the explicit `worker_type` on the service,
 * else the service type's `default_worker_type`, else 'engineer'.
 */
export function resolveWorkerType(service: WorkerScopedService | null | undefined): WorkerType {
  return (
    service?.worker_type ??
    service?.service_type?.default_worker_type ??
    'engineer'
  )
}

/**
 * Whether a task ALREADY ASSIGNED to an internal engineer should be visible to
 * them. An engineer must see every call they have been issued, regardless of
 * discipline or branch — discipline suitability is now enforced at ASSIGNMENT
 * time (with an overridable warning), not hidden after the fact.
 *
 * The only remaining hide is sub-contracted work, which is delivered through
 * the separate sub-contractor login flow rather than an internal engineer's
 * schedule.
 *
 * `discipline` is retained in the signature for call-site compatibility but no
 * longer changes the result.
 */
export function isTaskVisibleToEngineer(
  task: WorkerScopedTask,
  _discipline?: Discipline | null | undefined,
): boolean {
  const wt = resolveWorkerType(task.site_service)

  // Sub-contracted work is never shown on an internal engineer's schedule.
  if (wt === 'subcontractor') return false

  // Everything else assigned to the engineer is theirs to see (incl. CDO).
  return true
}

/**
 * Whether a service (by worker type) should appear in an engineer's SUGGESTED
 * (nearby) calls, given the requesting engineer's discipline. Same rules as
 * task visibility but expressed on a raw worker type for query-side use.
 */
export function isWorkerTypeVisibleToEngineer(
  workerType: WorkerType,
  discipline: Discipline | null | undefined,
): boolean {
  if (workerType === 'subcontractor') return false
  if (discipline === 'cdo') return workerType === 'cdo'
  if (workerType === 'cdo') return false
  return true
}

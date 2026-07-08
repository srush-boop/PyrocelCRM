import type { ServiceType, Site, SystemType, TaskWithDetails } from '@/lib/types/database'

/**
 * Reactive / emergency calls are logged directly against a site + system + service
 * type, with no recurring `site_service` row. The rest of the app reads call
 * details through `task.site_service?.site` / `.service_type`, so here we
 * synthesise a `site_service`-shaped object from the task's direct relations
 * (`direct_site`, `direct_service_type`, `direct_system_type`) whenever the real
 * recurring service is absent.
 *
 * The Supabase query aliases the direct foreign-key embeds as `direct_site`,
 * `direct_service_type` and `direct_system_type`; those aren't part of
 * `TaskWithDetails`, so we work through a loose local shape.
 */
type LooseTask = {
  site_service?: unknown
  direct_site?: (Site & Record<string, unknown>) | null
  direct_service_type?: (ServiceType & { system_type?: SystemType | null }) | null
  direct_system_type?: SystemType | null
}

export function normalizeTask<T extends TaskWithDetails>(task: T): T {
  const t = task as unknown as LooseTask

  // Already a recurring call with a real service — nothing to synthesise.
  if (t.site_service) return task

  const directSite = t.direct_site ?? null
  const directServiceType = t.direct_service_type ?? null
  const directSystemType = t.direct_system_type ?? null

  // No direct relations either (shouldn't happen given the CHECK constraint).
  if (!directSite && !directServiceType) return task

  // Synthesise a minimal site_service so the existing UI (which reads
  // `site_service.site` / `.service_type`) renders reactive calls correctly.
  const serviceTypeWithSystem = directServiceType
    ? { ...directServiceType, system_type: directServiceType.system_type ?? directSystemType ?? null }
    : undefined

  t.site_service = {
    site: directSite ?? undefined,
    service_type: serviceTypeWithSystem,
    // Reactive calls are attended by an in-house engineer by default.
    worker_type: 'engineer',
  }

  return task
}

export function normalizeTasks<T extends TaskWithDetails>(tasks: T[]): T[] {
  return tasks.map((t) => normalizeTask(t))
}

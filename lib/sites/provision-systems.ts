import type { ServiceType, SystemType } from '@/lib/types/database'
import { buildSeedTaskRows, fetchVisitsByServiceType } from '@/lib/scheduling'

/** A system chosen during site setup, with the service types required for it. */
export interface ProvisionSystemSelection {
  systemTypeId: string
  systemTypeName: string
  /** Service type ids to attach under this system (may be empty). */
  serviceTypeIds: string[]
}

type ServiceTypeDefaults = Pick<
  ServiceType,
  'id' | 'default_frequency_value' | 'default_frequency_unit' | 'default_worker_type'
>

/**
 * Case-insensitive lookup of the "Remote Monitoring" system type id. Returns
 * null when no such system type has been configured, so callers can skip the
 * auto-add silently rather than error.
 */
export function findRemoteMonitoringTypeId(systemTypes: Pick<SystemType, 'id' | 'name'>[]): string | null {
  const match = systemTypes.find((t) => t.name.trim().toLowerCase() === 'remote monitoring')
  return match?.id ?? null
}

/**
 * Insert the selected site_systems and their site_services, then seed the first
 * cycle of tasks for live sites (mirrors the per-system add flow in
 * site-systems-manager). Dead sites get systems/services but no tasks and no
 * next_service_date. `supabase` is typed loosely so the browser client works
 * without fighting its generics.
 */
export async function provisionSiteSystems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    siteId: string
    selections: ProvisionSystemSelection[]
    serviceTypes: ServiceTypeDefaults[]
    isDead: boolean
    startDate: string
  },
): Promise<{ error?: string }> {
  const { siteId, selections, serviceTypes, isDead, startDate } = opts
  if (selections.length === 0) return {}

  // 1. Insert the systems and get their ids back (keyed to preserve the link
  //    between each system and the services chosen for it).
  const systemPayload = selections.map((s) => ({
    site_id: siteId,
    name: s.systemTypeName || 'System',
    system_type_id: s.systemTypeId,
  }))
  const { data: insertedSystems, error: systemError } = await supabase
    .from('site_systems')
    .insert(systemPayload)
    .select('id, system_type_id')
  if (systemError) return { error: systemError.message }

  const systems = (insertedSystems ?? []) as { id: string; system_type_id: string }[]

  // 2. Build service rows linked to their newly-created system.
  const serviceRows = selections.flatMap((sel) => {
    const system = systems.find((sys) => sys.system_type_id === sel.systemTypeId)
    if (!system) return []
    return sel.serviceTypeIds.map((serviceTypeId) => {
      const st = serviceTypes.find((s) => s.id === serviceTypeId)
      return {
        site_id: siteId,
        service_type_id: serviceTypeId,
        site_system_id: system.id,
        frequency_value: st?.default_frequency_value ?? 12,
        frequency_unit: st?.default_frequency_unit ?? 'months',
        worker_type: st?.default_worker_type ?? 'cdo',
        next_service_date: isDead ? null : startDate,
      }
    })
  })

  if (serviceRows.length === 0) return {}

  const { data: insertedServices, error: serviceError } = await supabase
    .from('site_services')
    .insert(serviceRows)
    .select('id, service_type_id, frequency_value, frequency_unit')
  if (serviceError) return { error: serviceError.message }

  // 3. Live sites get seeded tasks for the setup month (multi-visit services
  //    spread across the cycle, handled by buildSeedTaskRows).
  if (!isDead && insertedServices && insertedServices.length > 0) {
    const rows = insertedServices as {
      id: string
      service_type_id: string
      frequency_value: number
      frequency_unit: 'weeks' | 'months'
    }[]
    const visitsByServiceType = await fetchVisitsByServiceType(
      supabase,
      rows.map((r) => r.service_type_id),
    )
    const taskData = buildSeedTaskRows(rows, startDate, visitsByServiceType)
    if (taskData.length > 0) {
      await supabase.from('tasks').insert(taskData)
    }
  }

  return {}
}

/**
 * Ensure a site has a "Remote Monitoring" system attached. No-ops when the type
 * doesn't exist or the site already has one (avoids duplicates when the toggle
 * is switched on/off repeatedly). Adds the system only — no services.
 */
export async function ensureRemoteMonitoringSystem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { siteId: string; systemTypes: Pick<SystemType, 'id' | 'name'>[] },
): Promise<{ error?: string; added: boolean }> {
  const rmTypeId = findRemoteMonitoringTypeId(opts.systemTypes)
  if (!rmTypeId) return { added: false }

  const { data: existing } = await supabase
    .from('site_systems')
    .select('id')
    .eq('site_id', opts.siteId)
    .eq('system_type_id', rmTypeId)
    .limit(1)
  if (existing && existing.length > 0) return { added: false }

  const rmName = opts.systemTypes.find((t) => t.id === rmTypeId)?.name ?? 'Remote Monitoring'
  const { error } = await supabase
    .from('site_systems')
    .insert({ site_id: opts.siteId, name: rmName, system_type_id: rmTypeId })
  if (error) return { error: error.message, added: false }
  return { added: true }
}

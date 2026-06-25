import type { SupabaseClient } from '@supabase/supabase-js'
import type { KpiTask, ToleranceLookup } from '@/lib/kpi'
import type { ToleranceUnit } from '@/lib/types/database'

export interface KpiData {
  tasks: KpiTask[]
  tolerances: ToleranceLookup
}

// Fetches the raw data needed to compute KPIs and projects it into the shapes
// the shared `lib/kpi` functions expect. Works for both the internal admin view
// (sees everything) and the client portal (RLS scopes rows to the client's
// sites) — the query is identical; row-level security does the filtering.
export async function fetchKpiData(supabase: SupabaseClient): Promise<KpiData> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      id,
      scheduled_date,
      completed_at,
      site_service:site_services(
        service_type_id,
        client_tolerance_value,
        client_tolerance_unit,
        site:sites(id, name, client_id, client:clients(id, name)),
        service_type:service_types(
          id,
          name,
          regulatory_tolerance_value,
          regulatory_tolerance_unit
        )
      )
    `,
    )
    .limit(5000)

  if (error) {
    console.error('[v0] Error loading KPI data:', error.message)
    throw error
  }

  const tasks: KpiTask[] = []
  const tolerances: ToleranceLookup = {}

  for (const row of (data as any[]) ?? []) {
    const ss = row.site_service
    const serviceType = ss?.service_type
    const site = ss?.site
    if (!serviceType || !site) continue

    const serviceTypeId = serviceType.id as string

    const regulatory = {
      value: serviceType.regulatory_tolerance_value ?? 0,
      unit: (serviceType.regulatory_tolerance_unit ?? 'days') as ToleranceUnit,
    }

    if (!tolerances[serviceTypeId]) {
      // Client tier defaults to the regulatory standard at the service-type
      // level; the per-site/service override (below) tightens it where set.
      tolerances[serviceTypeId] = { regulatory, client: regulatory }
    }

    // Client KPI for this specific site/service: use the override when present,
    // otherwise fall back to the regulatory standard.
    const clientTolerance =
      ss.client_tolerance_value != null
        ? {
            value: ss.client_tolerance_value as number,
            unit: (ss.client_tolerance_unit ?? 'days') as ToleranceUnit,
          }
        : regulatory

    tasks.push({
      id: row.id,
      dueDate: row.scheduled_date,
      completedAt: row.completed_at,
      serviceTypeId,
      serviceTypeName: serviceType.name,
      siteId: site.id,
      siteName: site.name,
      clientId: site.client?.id ?? site.client_id ?? null,
      clientName: site.client?.name ?? null,
      clientTolerance,
    })
  }

  return { tasks, tolerances }
}

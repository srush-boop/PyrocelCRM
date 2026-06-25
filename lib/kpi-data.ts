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
        site:sites(id, name, client_id, client:clients(id, name)),
        service_type:service_types(
          id,
          name,
          regulatory_tolerance_value,
          regulatory_tolerance_unit,
          client_tolerance_value,
          client_tolerance_unit
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

    if (!tolerances[serviceTypeId]) {
      tolerances[serviceTypeId] = {
        regulatory: {
          value: serviceType.regulatory_tolerance_value ?? 0,
          unit: (serviceType.regulatory_tolerance_unit ?? 'days') as ToleranceUnit,
        },
        client: {
          value: serviceType.client_tolerance_value ?? 0,
          unit: (serviceType.client_tolerance_unit ?? 'days') as ToleranceUnit,
        },
      }
    }

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
    })
  }

  return { tasks, tolerances }
}

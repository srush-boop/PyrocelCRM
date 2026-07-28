import type { SupabaseClient } from '@supabase/supabase-js'
import type { CallCategory, KpiTask, ToleranceLookup } from '@/lib/kpi'
import type { ToleranceUnit } from '@/lib/types/database'
import { getGlobalConfig } from '@/lib/actions/global-config'
import { resolveCallKind } from '@/lib/call-kinds'

export interface KpiData {
  tasks: KpiTask[]
  tolerances: ToleranceLookup
  // Configured deadline-failed reasons and the subset flagged as excusable
  // (excluded from KPI), surfaced so the review UI can offer them and the
  // dashboard can show exclusion state.
  deadlineReasons: string[]
  excludedReasons: string[]
}

// Fetches the raw data needed to compute KPIs and projects it into the shapes
// the shared `lib/kpi` functions expect. Works for both the internal admin view
// (sees everything) and the client portal (RLS scopes rows to the client's
// sites) — the query is identical; row-level security does the filtering.
export async function fetchKpiData(supabase: SupabaseClient): Promise<KpiData> {
  // Configured deadline reasons + the excludable subset drive KPI exclusions.
  const [reasonsCfg, excludedCfg, { data, error }] = await Promise.all([
    getGlobalConfig<string[]>('deadline_failed_reasons'),
    getGlobalConfig<string[]>('deadline_failed_reason_exclusions'),
    supabase
      .from('tasks')
      .select(
        `
      id,
      reference_number,
      scheduled_date,
      completed_at,
      deadline_failed_reason,
      site_service:site_services(
        service_type_id,
        client_tolerance_value,
        client_tolerance_unit,
        site:sites(id, name, client_id, client:clients(id, name)),
        service_type:service_types(
          id,
          name,
          regulatory_tolerance_value,
          regulatory_tolerance_unit,
          regulatory_compliance,
          call_kind,
          is_recurring,
          is_emergency
        )
      )
    `,
      )
      .limit(5000),
  ])

  if (error) {
    console.error('[v0] Error loading KPI data:', error.message)
    throw error
  }

  const deadlineReasons = reasonsCfg ?? []
  const excludedReasons = excludedCfg ?? []
  const excludedSet = new Set(excludedReasons)

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
      tolerances[serviceTypeId] = {
        regulatory,
        client: regulatory,
        // Legacy rows may not have the column; default to subject-to-regulatory.
        regulatoryCompliance: serviceType.regulatory_compliance !== false,
      }
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

    const deadlineFailedReason = (row.deadline_failed_reason as string | null) ?? null

    // Operational category for the monthly PPM vs emergency rate split.
    const callKind = resolveCallKind({
      call_kind: serviceType.call_kind ?? null,
      is_recurring: serviceType.is_recurring ?? false,
    })
    const callCategory: CallCategory =
      callKind === 'recurring' ? 'ppm' : serviceType.is_emergency ? 'emergency' : 'other'

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
      referenceNumber: (row.reference_number as string | null) ?? null,
      deadlineFailedReason,
      deadlineExcluded: deadlineFailedReason ? excludedSet.has(deadlineFailedReason) : false,
      callCategory,
    })
  }

  return { tasks, tolerances, deadlineReasons, excludedReasons }
}

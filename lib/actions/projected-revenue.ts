'use server'

import { createClient } from '@/lib/supabase/server'
import type { RecurringFrequency } from '@/lib/types/database'
import {
  aggregateProjection,
  type ProjectedRevenue,
  type ProjectionInput,
} from '@/lib/billing/projected-revenue'

export interface ProjectionFilters {
  serviceTypeId?: string | null
  systemTypeId?: string | null
  branchId?: string | null
}

export interface ProjectionFilterOptions {
  serviceTypes: { id: string; name: string; systemTypeId: string | null }[]
  systemTypes: { id: string; name: string }[]
}

/** Nested shape returned by the recurring-charges select below. */
interface ChargeRow {
  unit_price_pence: number
  quantity: number
  frequency: RecurringFrequency
  is_subcontracted: boolean
  subcontract_price_pence: number | null
  site: { branch: { id: string; name: string } | null } | { branch: { id: string; name: string } | null }[] | null
  site_service:
    | {
        site: { branch: { id: string; name: string } | null } | null
        service_type:
          | {
              id: string
              name: string
              system_type: { id: string; name: string } | { id: string; name: string }[] | null
            }
          | null
      }
    | null
    | any
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Projected recurring revenue for the forthcoming 12 months (annualised
 * run-rate). Charges are flattened to their branch / service type / system type
 * then aggregated. Optional filters narrow to a single service or system type.
 */
export async function getProjectedRevenue(
  filters: ProjectionFilters = {},
): Promise<ProjectedRevenue> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('recurring_charges')
    .select(
      `unit_price_pence, quantity, frequency, is_subcontracted, subcontract_price_pence,
       site:sites(branch:branches(id, name)),
       site_service:site_services(
         site:sites(branch:branches(id, name)),
         service_type:service_types(id, name, system_type:system_types(id, name))
       )`,
    )
    .eq('active', true)

  const rows = (data ?? []) as ChargeRow[]

  const flattened: ProjectionInput[] = rows.map((r) => {
    const svc = first(r.site_service)
    const serviceType = first(svc?.service_type)
    const systemType = first(serviceType?.system_type)
    // Branch resolves via the service's site first, then the charge's own site.
    const branch =
      first(svc?.site)?.branch ?? first(r.site)?.branch ?? null

    return {
      frequency: r.frequency,
      unitPricePence: r.unit_price_pence,
      quantity: r.quantity ?? 1,
      isSubcontracted: r.is_subcontracted,
      subcontractPricePence: r.subcontract_price_pence,
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      serviceTypeId: serviceType?.id ?? null,
      serviceTypeName: serviceType?.name ?? null,
      systemTypeId: systemType?.id ?? null,
      systemTypeName: systemType?.name ?? null,
    }
  })

  const filtered = flattened.filter((c) => {
    if (filters.serviceTypeId && c.serviceTypeId !== filters.serviceTypeId) return false
    if (filters.systemTypeId && c.systemTypeId !== filters.systemTypeId) return false
    if (filters.branchId && c.branchId !== filters.branchId) return false
    return true
  })

  return aggregateProjection(filtered)
}

/** Active service and system types for the filter dropdowns. */
export async function getProjectionFilterOptions(): Promise<ProjectionFilterOptions> {
  const supabase = await createClient()
  const [{ data: svc }, { data: sys }] = await Promise.all([
    supabase
      .from('service_types')
      .select('id, name, system_type_id')
      .order('name', { ascending: true }),
    supabase
      .from('system_types')
      .select('id, name')
      .eq('active', true)
      .order('position', { ascending: true }),
  ])

  return {
    serviceTypes: ((svc ?? []) as { id: string; name: string; system_type_id: string | null }[]).map(
      (s) => ({ id: s.id, name: s.name, systemTypeId: s.system_type_id }),
    ),
    systemTypes: ((sys ?? []) as { id: string; name: string }[]).map((s) => ({
      id: s.id,
      name: s.name,
    })),
  }
}

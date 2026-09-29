import { createClient } from '@/lib/supabase/server'
import { ANNUAL_OCCURRENCES } from '@/lib/billing/projected-revenue'
import type { RecurringFrequency } from '@/lib/types/database'

export interface PlannerArea {
  id: string
  name: string
  description: string | null
  color: string
  assignedEngineerId: string | null
  assignedEngineerName: string | null
}

export interface PlannerRule {
  id: string
  areaId: string
  prefix: string
}

export interface PlannerSite {
  id: string
  name: string
  postcode: string | null
  latitude: number | null
  longitude: number | null
  clientName: string | null
}

/** A live, engineer-delivered service (CDO and sub-contract work is excluded). */
export interface PlannerService {
  id: string
  siteId: string
  serviceTypeName: string
  areaId: string | null
  annualPence: number
}

export interface AreaPlannerData {
  areas: PlannerArea[]
  rules: PlannerRule[]
  sites: PlannerSite[]
  services: PlannerService[]
}

type One<T> = T | T[] | null
function first<T>(v: One<T> | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const isNonLive = (s: string | null | undefined) => s != null && s !== 'live'

/**
 * Everything the area planner needs. Revenue is the annualised run-rate of each
 * service's active recurring charges, same basis as Projected revenue. Services
 * delivered by CDOs or sub-contractors, sub-contracted charges, and anything not
 * live (service, site or client) are left out.
 */
export async function getAreaPlannerData(): Promise<AreaPlannerData> {
  const supabase = await createClient()

  const [areasRes, rulesRes, sitesRes, servicesRes] = await Promise.all([
    supabase
      .from('areas')
      .select('id, name, description, color, assigned_engineer_id, assigned_engineer:profiles(full_name, email)')
      .order('name'),
    supabase.from('area_postcodes').select('id, area_id, prefix').order('prefix'),
    supabase
      .from('sites')
      .select('id, name, postcode, latitude, longitude, status, client:clients(name, status)')
      .order('name'),
    supabase
      .from('site_services')
      .select(
        `id, site_id, area_id, worker_type, status,
         service_type:service_types(name),
         recurring_charges(unit_price_pence, quantity, frequency, is_subcontracted, active)`,
      ),
  ])

  const areas: PlannerArea[] = ((areasRes.data ?? []) as any[]).map((a) => {
    const eng = first<{ full_name: string | null; email: string | null }>(a.assigned_engineer)
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      color: a.color || '#2563eb',
      assignedEngineerId: a.assigned_engineer_id,
      assignedEngineerName: eng ? eng.full_name || eng.email : null,
    }
  })

  const rules: PlannerRule[] = ((rulesRes.data ?? []) as any[]).map((r) => ({
    id: r.id,
    areaId: r.area_id,
    prefix: r.prefix,
  }))

  const liveSiteIds = new Set<string>()
  const sites: PlannerSite[] = ((sitesRes.data ?? []) as any[]).map((s) => {
    const client = first<{ name: string; status: string | null }>(s.client)
    if (!isNonLive(s.status) && !isNonLive(client?.status)) liveSiteIds.add(s.id)
    return {
      id: s.id,
      name: s.name,
      postcode: s.postcode,
      latitude: s.latitude,
      longitude: s.longitude,
      clientName: client?.name ?? null,
    }
  })

  const services: PlannerService[] = ((servicesRes.data ?? []) as any[])
    .filter((ss) => {
      // A null worker type is treated as CDO, matching the service setup dialog.
      const worker = ss.worker_type || 'cdo'
      return worker !== 'cdo' && worker !== 'subcontractor' && !isNonLive(ss.status) && liveSiteIds.has(ss.site_id)
    })
    .map((ss) => {
      const charges = (ss.recurring_charges ?? []) as {
        unit_price_pence: number
        quantity: number | null
        frequency: RecurringFrequency
        is_subcontracted: boolean
        active: boolean
      }[]
      const annualPence = charges
        .filter((c) => c.active && !c.is_subcontracted)
        .reduce(
          (sum, c) =>
            sum + Math.round(c.unit_price_pence * (c.quantity || 1) * (ANNUAL_OCCURRENCES[c.frequency] ?? 0)),
          0,
        )
      return {
        id: ss.id,
        siteId: ss.site_id,
        serviceTypeName: first<{ name: string }>(ss.service_type)?.name ?? 'Service',
        areaId: ss.area_id,
        annualPence,
      }
    })

  return { areas, rules, sites, services }
}

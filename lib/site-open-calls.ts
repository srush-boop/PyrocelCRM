import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallTargetDate, isCallOverdue } from '@/lib/kpi'
import type { ToleranceUnit } from '@/lib/types/database'

// Open calls are those still needing attendance.
const OPEN_STATUSES = ['pending', 'in_progress'] as const

// How far ahead a scheduled (non-overdue) call still counts as "due" for the
// "other calls at this site" prompt. An engineer on-site benefits from seeing
// what else is overdue or coming up soon so it can be done in the same visit;
// calls months out are noise here (the site page lists those).
const DUE_HORIZON_DAYS = 30

// A single other open call at the same site, enriched with its complete-by
// (target) date and whether it's overdue — everything the attending engineer
// needs to decide whether to pick it up while on-site.
export interface OtherSiteCall {
  id: string
  reference: string | null
  status: string
  scheduledDate: string | null
  /** Client KPI "complete by" date (ISO), or null when none applies. */
  targetDate: string | null
  overdue: boolean
  isEmergency: boolean
  serviceName: string | null
  systemName: string | null
  assignedEngineerId: string | null
  assignedEngineerName: string | null
}

type ServiceType = {
  name: string | null
  is_recurring: boolean | null
  regulatory_tolerance_value: number | null
  regulatory_tolerance_unit: ToleranceUnit | null
  system_type: { name: string | null } | { name: string | null }[] | null
} | null

type ServiceTypeArr = ServiceType | NonNullable<ServiceType>[]

interface RecurringRow {
  id: string
  reference_number: string | null
  status: string
  scheduled_date: string | null
  is_emergency: boolean | null
  assigned_engineer_id: string | null
  site_service:
    | {
        frequency_value: number | null
        frequency_unit: string | null
        client_tolerance_value: number | null
        client_tolerance_unit: ToleranceUnit | null
        service_type: ServiceTypeArr
      }
    | {
        frequency_value: number | null
        frequency_unit: string | null
        client_tolerance_value: number | null
        client_tolerance_unit: ToleranceUnit | null
        service_type: ServiceTypeArr
      }[]
    | null
  assigned_engineer: { full_name: string | null } | { full_name: string | null }[] | null
}

interface ReactiveRow {
  id: string
  reference_number: string | null
  status: string
  scheduled_date: string | null
  is_emergency: boolean | null
  assigned_engineer_id: string | null
  direct_service_type: ServiceTypeArr
  assigned_engineer: { full_name: string | null } | { full_name: string | null }[] | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function systemNameOf(st: ServiceTypeArr): string | null {
  const svc = first(st)
  return first(svc?.system_type ?? null)?.name ?? null
}

/**
 * Fetch the OTHER open (pending / in-progress) calls at a site that are either
 * overdue or due soon, so the attending engineer can see what else needs doing
 * while on-site. Recurring calls anchor via `site_service.site_id`; reactive /
 * emergency calls anchor directly via `tasks.site_id` — both are covered.
 * `excludeTaskId` omits the call currently being viewed. Overdue calls come
 * first, then soonest scheduled. Accepts any Supabase client. Never throws.
 */
export async function getOtherOpenCallsForSite(
  supabase: SupabaseClient,
  siteId: string,
  excludeTaskId?: string,
  today: Date = new Date(),
): Promise<OtherSiteCall[]> {
  try {
    const horizon = new Date(today.getTime() + DUE_HORIZON_DAYS * 86_400_000)

    const [{ data: recurringData }, { data: reactiveData }] = await Promise.all([
      supabase
        .from('tasks')
        .select(
          `id, reference_number, status, scheduled_date, is_emergency, assigned_engineer_id,
           site_service:site_services!inner(
             site_id, frequency_value, frequency_unit, client_tolerance_value, client_tolerance_unit,
             service_type:service_types(
               name, is_recurring, regulatory_tolerance_value, regulatory_tolerance_unit,
               system_type:system_types(name)
             )
           ),
           assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name)`,
        )
        .eq('site_service.site_id', siteId)
        .in('status', OPEN_STATUSES as unknown as string[]),
      supabase
        .from('tasks')
        .select(
          `id, reference_number, status, scheduled_date, is_emergency, assigned_engineer_id,
           direct_service_type:service_types!tasks_service_type_id_fkey(
             name, system_type:system_types(name)
           ),
           assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name)`,
        )
        .eq('site_id', siteId)
        .is('site_service_id', null)
        .in('status', OPEN_STATUSES as unknown as string[]),
    ])

    const out: OtherSiteCall[] = []

    for (const r of (recurringData ?? []) as RecurringRow[]) {
      if (excludeTaskId && r.id === excludeTaskId) continue
      const ss = first(r.site_service)
      const svc = first(ss?.service_type ?? null)
      const input = {
        scheduledDate: r.scheduled_date,
        status: r.status,
        isRecurring: svc?.is_recurring,
        frequencyValue: ss?.frequency_value,
        frequencyUnit: (ss?.frequency_unit as 'weeks' | 'months' | null) ?? null,
        clientToleranceValue: ss?.client_tolerance_value,
        clientToleranceUnit: ss?.client_tolerance_unit ?? null,
        regulatoryToleranceValue: svc?.regulatory_tolerance_value,
        regulatoryToleranceUnit: svc?.regulatory_tolerance_unit ?? null,
      }
      const overdue = isCallOverdue(input, today)
      const target = getCallTargetDate(input)
      const eng = first(r.assigned_engineer)
      out.push({
        id: r.id,
        reference: r.reference_number,
        status: r.status,
        scheduledDate: r.scheduled_date,
        targetDate: target ? target.toISOString() : null,
        overdue,
        isEmergency: r.is_emergency === true,
        serviceName: svc?.name ?? null,
        systemName: systemNameOf(ss?.service_type ?? null),
        assignedEngineerId: r.assigned_engineer_id,
        assignedEngineerName: eng?.full_name ?? null,
      })
    }

    for (const r of (reactiveData ?? []) as ReactiveRow[]) {
      if (excludeTaskId && r.id === excludeTaskId) continue
      const svc = first(r.direct_service_type)
      const eng = first(r.assigned_engineer)
      out.push({
        id: r.id,
        reference: r.reference_number,
        status: r.status,
        scheduledDate: r.scheduled_date,
        targetDate: r.scheduled_date, // reactive calls: complete-by is the booked date
        overdue: false,
        isEmergency: r.is_emergency === true,
        serviceName: svc?.name ?? null,
        systemName: systemNameOf(r.direct_service_type),
        assignedEngineerId: r.assigned_engineer_id,
        assignedEngineerName: eng?.full_name ?? null,
      })
    }

    // Keep only what's actionable while on-site: overdue, in-progress, or due
    // within the near horizon.
    const relevant = out.filter((c) => {
      if (c.overdue || c.status === 'in_progress') return true
      if (!c.scheduledDate) return false
      const d = new Date(c.scheduledDate)
      return d <= horizon
    })

    // Overdue first, then by soonest scheduled/target date.
    relevant.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      const ad = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity
      const bd = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity
      return ad - bd
    })

    return relevant
  } catch (err) {
    console.log(
      '[v0] getOtherOpenCallsForSite failed:',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}

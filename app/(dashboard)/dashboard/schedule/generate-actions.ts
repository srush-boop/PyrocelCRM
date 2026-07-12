'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  parseDateString,
  toDateString,
  computeEvenlySplitVisitDates,
  fetchVisitsByServiceType,
} from '@/lib/scheduling'

export interface GenerateMonthlyCallsResult {
  ok: boolean
  error?: string
  created: number
  skipped: number
  monthLabel: string
}

interface ServiceRow {
  id: string
  service_type_id: string
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  next_service_date: string | null
  active: boolean | null
  site: { status: string | null } | null
  service_type: { status: string | null; is_recurring: boolean | null } | null
  // Parent system (null when the service is unassigned). Inactive systems are
  // excluded from recurring call generation.
  site_system: { active: boolean | null } | null
}

interface TaskRow {
  site_service_id: string
  visit_type_id: string | null
  scheduled_date: string
}

/** Add the service frequency to a date (local time, no TZ drift). */
function addFrequency(base: Date, value: number, unit: 'weeks' | 'months'): Date {
  const next = new Date(base)
  if (unit === 'weeks') next.setDate(next.getDate() + value * 7)
  else next.setMonth(next.getMonth() + value)
  return next
}

/**
 * Generate the recurring "calls" (tasks) that fall due in a given month.
 *
 * Intended for the end-of-month office workflow: create next month's calls in
 * one click. It is a SUPPLEMENT to the existing on-completion auto-creation —
 * it only fills gaps and never duplicates a call that already exists for a
 * service+visit in the target month, so it is safe to run repeatedly.
 *
 * Due dates are computed by FREQUENCY ROLLOVER: for each live service (and each
 * of its visit types) we take the most recent scheduled call and roll its fixed
 * cadence forward until it lands in the target month.
 *
 * @param year  Full target year (e.g. 2026)
 * @param month 1-12 target month
 */
export async function generateMonthlyCalls(
  year: number,
  month: number,
): Promise<GenerateMonthlyCallsResult> {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0) // last day of target month
  const monthLabel = monthStart.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
  const empty = { created: 0, skipped: 0, monthLabel }

  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return { ok: false, error: 'Invalid month selected.', ...empty }
  }

  const supabase = await createClient()

  // Authorise: office or admin only.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.', ...empty }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { ok: false, error: 'You do not have permission to generate calls.', ...empty }
  }

  // Load live services (site + service type not "dead").
  const { data: serviceData, error: svcError } = await supabase
    .from('site_services')
    .select(
      `id, service_type_id, frequency_value, frequency_unit, next_service_date, active,
       site:sites(status),
       service_type:service_types(status, is_recurring),
       site_system:site_systems(active)`,
    )
  if (svcError) {
    return { ok: false, error: 'Could not load services.', ...empty }
  }

  const services = ((serviceData || []) as unknown as ServiceRow[]).filter(
    (s) =>
      s.active !== false &&
      s.site?.status !== 'dead' &&
      s.service_type?.status !== 'dead' &&
      // Services under an inactive system are not scheduled (unassigned services
      // have no parent system and are unaffected).
      s.site_system?.active !== false &&
      // Reactive / emergency (non-recurring) call types never auto-generate PPM
      // calls — they are logged ad-hoc via "Book Call".
      s.service_type?.is_recurring !== false,
  )
  if (services.length === 0) {
    return { ok: true, ...empty }
  }

  const serviceIds = services.map((s) => s.id)

  // Load existing tasks for these services to (a) anchor the cadence on the
  // latest scheduled call and (b) skip months that already have a call.
  const { data: taskData, error: taskError } = await supabase
    .from('tasks')
    .select('site_service_id, visit_type_id, scheduled_date')
    .in('site_service_id', serviceIds)
  if (taskError) {
    return { ok: false, error: 'Could not load existing calls.', ...empty }
  }
  const tasks = (taskData || []) as TaskRow[]

  // Authoritative visit types per service type (ordered by sort_order). This is
  // what lets us generate a visit that was deferred at setup and therefore has
  // no task history yet.
  const visitsByServiceType = await fetchVisitsByServiceType(
    supabase,
    services.map((s) => s.service_type_id),
  )

  const groupKey = (ssId: string, visitId: string | null) => `${ssId}|${visitId ?? 'none'}`

  // Earliest scheduled date per service — the phase reference for deriving a
  // visit's cadence when the visit itself has no history yet.
  const earliestByService = new Map<string, string>()
  // Latest scheduled date per service+visit — the cadence anchor for visits
  // that DO have history (respects a drifted cadence from late completions).
  const latestByGroup = new Map<string, string>()
  // Service+visit combinations that already have a call in the target month.
  const coveredThisMonth = new Set<string>()
  const startStr = toDateString(monthStart)
  const endStr = toDateString(monthEnd)

  for (const t of tasks) {
    const prevEarliest = earliestByService.get(t.site_service_id)
    if (!prevEarliest || t.scheduled_date < prevEarliest) {
      earliestByService.set(t.site_service_id, t.scheduled_date)
    }
    const key = groupKey(t.site_service_id, t.visit_type_id)
    const prev = latestByGroup.get(key)
    if (!prev || t.scheduled_date > prev) latestByGroup.set(key, t.scheduled_date)
    if (t.scheduled_date >= startStr && t.scheduled_date <= endStr) {
      coveredThisMonth.add(key)
    }
  }

  const newRows: TaskRow[] = []
  let skipped = 0

  for (const svc of services) {
    const visits = visitsByServiceType.get(svc.service_type_id) ?? []
    const visitCount = Math.max(1, visits.length)
    // Build the visit-type groups from the service definition (not history), so
    // deferred visits are included. Zero-visit services use a single null group.
    const groupList =
      visits.length > 0
        ? visits.map((v, index) => ({ visitId: v.id as string | null, index }))
        : [{ visitId: null as string | null, index: 0 }]

    const serviceEarliest = earliestByService.get(svc.id) ?? svc.next_service_date

    for (const g of groupList) {
      const key = groupKey(svc.id, g.visitId)
      if (coveredThisMonth.has(key)) {
        skipped += 1
        continue
      }

      // Anchor priority: the visit's own latest call (accurate for a drifted
      // cadence); otherwise derive its first occurrence from the service phase
      // using the evenly-split offset for this visit's index.
      let anchor: string | null = latestByGroup.get(key) ?? null
      if (!anchor) {
        if (!serviceEarliest) continue
        anchor = computeEvenlySplitVisitDates(
          serviceEarliest,
          { frequency_value: svc.frequency_value, frequency_unit: svc.frequency_unit },
          visitCount,
        )[g.index]
      }

      // Roll the fixed cadence from the anchor toward the target month. The
      // anchor is usually before the month, so we roll forward; if it sits
      // beyond the month we roll backward, so a genuine gap is still filled.
      let project = parseDateString(anchor)
      let guard = 0
      while (project < monthStart && guard < 1040) {
        project = addFrequency(project, svc.frequency_value, svc.frequency_unit)
        guard += 1
      }
      guard = 0
      while (project > monthEnd && guard < 1040) {
        project = addFrequency(project, -svc.frequency_value, svc.frequency_unit)
        guard += 1
      }

      if (project >= monthStart && project <= monthEnd) {
        newRows.push({
          site_service_id: svc.id,
          visit_type_id: g.visitId,
          scheduled_date: toDateString(project),
        })
        // Guard against two groups projecting onto the same month slot.
        coveredThisMonth.add(key)
      }
    }
  }

  if (newRows.length === 0) {
    return { ok: true, created: 0, skipped, monthLabel }
  }

  const insertRows = newRows.map((r) => ({
    site_service_id: r.site_service_id,
    visit_type_id: r.visit_type_id,
    scheduled_date: r.scheduled_date,
    status: 'pending' as const,
  }))

  const { error: insertError } = await supabase.from('tasks').insert(insertRows)
  if (insertError) {
    return { ok: false, error: 'Failed to create calls. Please try again.', ...empty }
  }

  revalidatePath('/dashboard/schedule')
  return { ok: true, created: insertRows.length, skipped, monthLabel }
}

// Centralised logic for calculating the next recurring task's due date when a
// task is completed. Shared by every completion flow (standard checklist,
// dampers, fire alarm / MCP, emergency lights) so the behaviour stays
// consistent.

export interface NextDateFrequency {
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  // Optional so callers that don't (yet) select the column still type-check.
  // Defaults to true (anchor to the original schedule) when undefined.
  anchor_next_to_schedule?: boolean | null
}

export interface NextDateOptions {
  /** When the task was actually completed. */
  completedAt: Date
  /** The original scheduled date of the completed task (YYYY-MM-DD). */
  scheduledDate?: string | null
}

/**
 * Add the service frequency to a base date.
 */
function addFrequency(base: Date, freq: NextDateFrequency): Date {
  const next = new Date(base)
  if (freq.frequency_unit === 'weeks') {
    next.setDate(next.getDate() + freq.frequency_value * 7)
  } else {
    next.setMonth(next.getMonth() + freq.frequency_value)
  }
  return next
}

/**
 * Compute the next scheduled date for a recurring service.
 *
 * - When `anchor_next_to_schedule` is true (the default), the next due date is
 *   anchored to the original scheduled date, giving a fixed cadence that does
 *   not drift if the engineer completes the task early or late.
 * - When false, the next due date is anchored to the actual completion date.
 *
 * As a safety net for fixed-cadence services completed so late that the
 * anchored date would already be in the past, the date is rolled forward by
 * whole frequency intervals until it lands on/after the completion date.
 */
export function computeNextScheduledDate(
  freq: NextDateFrequency,
  { completedAt, scheduledDate }: NextDateOptions,
): Date {
  const anchorToSchedule = (freq.anchor_next_to_schedule ?? true) && Boolean(scheduledDate)

  if (!anchorToSchedule) {
    return addFrequency(new Date(completedAt), freq)
  }

  // Parse the scheduled date as a local date (avoid TZ shifting the day).
  const [y, m, d] = (scheduledDate as string).split('-').map(Number)
  const base = new Date(y, (m ?? 1) - 1, d ?? 1)

  let next = addFrequency(base, freq)
  // Roll forward if a late completion would otherwise produce a past-due date.
  const completedMidnight = new Date(
    completedAt.getFullYear(),
    completedAt.getMonth(),
    completedAt.getDate(),
  )
  let guard = 0
  while (next < completedMidnight && guard < 520) {
    next = addFrequency(next, freq)
    guard += 1
  }
  return next
}

/** Format a Date as a YYYY-MM-DD string in local time. */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a YYYY-MM-DD string into a local Date (no timezone shifting). */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export interface SeedTaskRow {
  site_service_id: string
  scheduled_date: string
  status: 'pending'
  visit_type_id: string | null
}

/**
 * Fetch the visit types for the given service types and group them by
 * service_type_id, ordered by sort_order. Returns an empty map when there are
 * no service type ids.
 *
 * `supabase` is typed loosely so this helper works with both the browser and
 * server Supabase clients without fighting their complex generic signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchVisitsByServiceType(
  supabase: any,
  serviceTypeIds: string[],
): Promise<Map<string, { id: string }[]>> {
  const map = new Map<string, { id: string }[]>()
  const uniqueIds = Array.from(new Set(serviceTypeIds))
  if (uniqueIds.length === 0) return map

  const { data } = await supabase
    .from('service_visit_types')
    .select('id, service_type_id, name, sort_order')
    .in('service_type_id', uniqueIds)
    .order('sort_order', { ascending: true })

  for (const vt of (data ?? []) as { id: string; service_type_id: string }[]) {
    const list = map.get(vt.service_type_id) ?? []
    list.push({ id: vt.id })
    map.set(vt.service_type_id, list)
  }
  return map
}

interface SeedServiceInput {
  id: string
  service_type_id: string
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
}

/**
 * Build the initial set of scheduled task rows for newly-added site services.
 *
 * Only calls that fall in the SETUP MONTH (the calendar month of `startDate`)
 * are seeded up front. For a multi-visit service (e.g. Fire Alarm = Annual +
 * Periodic) the visit dates are still spread evenly across the service
 * frequency, but any visit landing in a later month is deferred — it is created
 * later by the monthly call-generation workflow, which derives each visit's due
 * date from the service cadence. This stops future months from being populated
 * before the office generates them.
 *
 * Services with zero or one visit type get a single task on `startDate` (always
 * in the setup month), tagged with the lone visit type if one exists so reports
 * can still pick the right checklist.
 *
 * `visitsByServiceType` maps a service_type_id to its visit types ordered by
 * sort_order.
 */
export function buildSeedTaskRows(
  services: SeedServiceInput[],
  startDate: string,
  visitsByServiceType: Map<string, { id: string }[]>,
): SeedTaskRow[] {
  const taskData: SeedTaskRow[] = []

  const seed = parseDateString(startDate)
  const seedYear = seed.getFullYear()
  const seedMonth = seed.getMonth()
  const inSeedMonth = (dateStr: string) => {
    const d = parseDateString(dateStr)
    return d.getFullYear() === seedYear && d.getMonth() === seedMonth
  }

  for (const svc of services) {
    const visits = visitsByServiceType.get(svc.service_type_id) ?? []
    if (visits.length > 1) {
      const dates = computeEvenlySplitVisitDates(
        startDate,
        { frequency_value: svc.frequency_value, frequency_unit: svc.frequency_unit },
        visits.length,
      )
      visits.forEach((visit, i) => {
        // Defer visits that fall outside the setup month to the monthly
        // generator so we don't pre-populate future months.
        if (!inSeedMonth(dates[i])) return
        taskData.push({
          site_service_id: svc.id,
          scheduled_date: dates[i],
          status: 'pending',
          visit_type_id: visit.id,
        })
      })
    } else {
      taskData.push({
        site_service_id: svc.id,
        scheduled_date: startDate,
        status: 'pending',
        visit_type_id: visits[0]?.id ?? null,
      })
    }
  }

  return taskData
}

/**
 * Given the first visit's date and the full service-cycle frequency, return the
 * scheduled date (YYYY-MM-DD) for each visit when the cycle is split evenly
 * across `visitCount` visits.
 *
 * The frequency describes the WHOLE cycle (e.g. 12 months). With 2 visits that
 * is one every 6 months, with 4 visits one every 3 months. Visit 0 lands on the
 * provided start date; subsequent visits are offset by an even fraction.
 *
 * Weekly cycles are converted to days for the split so fractional weeks still
 * produce sensible day offsets.
 */
export function computeEvenlySplitVisitDates(
  startDate: string,
  freq: NextDateFrequency,
  visitCount: number,
): string[] {
  const count = Math.max(1, visitCount)
  const base = parseDateString(startDate)
  const dates: string[] = []

  for (let i = 0; i < count; i++) {
    const next = new Date(base)
    if (freq.frequency_unit === 'weeks') {
      const totalDays = freq.frequency_value * 7
      const offsetDays = Math.round((totalDays * i) / count)
      next.setDate(next.getDate() + offsetDays)
    } else {
      // Months: spread evenly; round to whole months for tidy calendar dates.
      const offsetMonths = Math.round((freq.frequency_value * i) / count)
      next.setMonth(next.getMonth() + offsetMonths)
    }
    dates.push(toDateString(next))
  }

  return dates
}

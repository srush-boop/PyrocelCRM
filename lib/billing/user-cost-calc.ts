import type { Profile, WorkDayHours, WorkDayHoursEntry } from '@/lib/types/database'

/**
 * User cost calculator maths.
 *
 * Given a user's configured working pattern and an "actual cost" for a date
 * range, derive an hourly cost:
 *
 *   hourly = totalCost / (sum of net working hours across the range)
 *
 * Working days are the days the user actually works (their `work_days`, ISO
 * weekday numbers). Net daily hours come from `work_day_hours` (finish minus
 * start minus unpaid break), falling back to the legacy single-time fields, and
 * finally to a sensible default so a partially-configured user still yields a
 * figure.
 */

// Default net hours for a working day when a user has no hours configured.
const DEFAULT_NET_DAILY_HOURS = 7.5
// ISO weekdays worked when a user has no `work_days` set (Mon–Fri).
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

/** Convert a JS getUTCDay() (0=Sun..6=Sat) to an ISO weekday (1=Mon..7=Sun). */
function isoWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

/** Parse a "YYYY-MM-DD" date string into a UTC Date at midnight. */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Net hours for a single configured day (finish − start − break), min 0. */
export function netDailyHours(entry: WorkDayHoursEntry): number {
  const toMinutes = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  const start = toMinutes(entry.start)
  const end = toMinutes(entry.end)
  if (start == null || end == null || end <= start) return 0
  const gross = end - start
  const net = gross - Math.max(0, entry.break_minutes || 0)
  return net > 0 ? net / 60 : 0
}

/** Resolve the days a user works as a set of ISO weekday numbers. */
function resolveWorkDays(profile: Pick<Profile, 'work_days' | 'work_day_hours'>): Set<number> {
  if (Array.isArray(profile.work_days) && profile.work_days.length > 0) {
    return new Set(profile.work_days)
  }
  const hours = profile.work_day_hours as WorkDayHours | null
  if (hours && Object.keys(hours).length > 0) {
    return new Set(Object.keys(hours).map((k) => Number(k)).filter((n) => n >= 1 && n <= 7))
  }
  return new Set(DEFAULT_WORK_DAYS)
}

/** Net hours for a given ISO weekday, using configured hours then fallbacks. */
function hoursForWeekday(
  profile: Pick<Profile, 'work_day_hours' | 'work_start_time' | 'work_end_time' | 'lunch_minutes'>,
  isoDay: number,
): number {
  const hours = profile.work_day_hours as WorkDayHours | null
  const entry = hours?.[String(isoDay)]
  if (entry) return netDailyHours(entry)
  // Legacy single-time fields.
  if (profile.work_start_time && profile.work_end_time) {
    return netDailyHours({
      start: profile.work_start_time,
      end: profile.work_end_time,
      break_minutes: profile.lunch_minutes ?? 0,
    })
  }
  return DEFAULT_NET_DAILY_HOURS
}

export interface WorkingTime {
  workingDays: number
  totalHours: number
}

/**
 * Sum the working days and net working hours for a user across an inclusive
 * date range. Iterates day by day in UTC so time zones can't shift a day in or
 * out of the range.
 */
export function workingTimeInRange(
  profile: Pick<
    Profile,
    'work_days' | 'work_day_hours' | 'work_start_time' | 'work_end_time' | 'lunch_minutes'
  >,
  from: Date,
  to: Date,
): WorkingTime {
  if (to < from) return { workingDays: 0, totalHours: 0 }
  const workDays = resolveWorkDays(profile)
  let workingDays = 0
  let totalHours = 0
  const cursor = new Date(from.getTime())
  // Safety cap: never iterate more than ~5 years of days.
  let guard = 0
  while (cursor <= to && guard < 2000) {
    const iso = isoWeekday(cursor.getUTCDay())
    if (workDays.has(iso)) {
      workingDays += 1
      totalHours += hoursForWeekday(profile, iso)
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    guard += 1
  }
  return { workingDays, totalHours: Math.round(totalHours * 100) / 100 }
}

/**
 * Hourly cost in integer pence from a total cost (in pounds) and total hours.
 * Returns null when hours are zero (can't divide) so the caller can flag it.
 */
export function hourlyCostPence(totalCostPounds: number, totalHours: number): number | null {
  if (!(totalHours > 0)) return null
  if (!Number.isFinite(totalCostPounds) || totalCostPounds < 0) return null
  const hourlyPounds = totalCostPounds / totalHours
  return Math.round(hourlyPounds * 100)
}

/** Normalise a person's name for tolerant matching (case/space-insensitive). */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

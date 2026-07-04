import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// The calendar entry type that represents booked annual leave.
export const ANNUAL_LEAVE_TYPE_ID = '150124a6-481b-43f6-819f-d2d02525ed3a'

// Default working pattern (Mon–Fri) as ISO weekday numbers when a user has no
// explicit `work_days` configured.
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

/**
 * Converts a Date to an ISO weekday number (1 = Monday ... 7 = Sunday).
 */
function isoWeekday(d: Date): number {
  const day = d.getUTCDay() // 0 = Sunday ... 6 = Saturday
  return day === 0 ? 7 : day
}

/**
 * Counts the number of working days a leave entry consumes within a given
 * calendar year. Only whole days that fall on the user's working days and
 * inside the year are counted. Entries are stored as all-day ranges where
 * `end_at` is the last day (end of that day), so we iterate date-by-date on the
 * inclusive range, clamped to the year.
 */
function workingDaysInRange(
  startAt: string,
  endAt: string,
  year: number,
  workDays: number[],
): number {
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)

  // Normalise to UTC midnight of each boundary day.
  const start = new Date(startAt)
  const end = new Date(endAt)
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())

  if (cursor < yearStart) cursor = yearStart
  const stop = Math.min(last, yearEnd)

  let count = 0
  const oneDay = 24 * 60 * 60 * 1000
  while (cursor <= stop) {
    const d = new Date(cursor)
    if (workDays.includes(isoWeekday(d))) count += 1
    cursor += oneDay
  }
  return count
}

export interface LeaveBalance {
  entitlementDays: number | null
  entitlementHours: number | null
  takenDays: number
  /** entitlementDays - takenDays, or null when no day entitlement is set. */
  remainingDays: number | null
}

/**
 * Computes each user's annual-leave balance for the given calendar year.
 * "Taken" is derived from Annual Leave calendar entries overlapping the year,
 * so on 1 Jan the balance naturally refreshes to the full entitlement without
 * any stored value being reset. Returns a map keyed by user id.
 */
export async function computeLeaveBalances(
  year: number = new Date().getUTCFullYear(),
): Promise<Map<string, LeaveBalance>> {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, work_days, holiday_entitlement_days, holiday_entitlement_hours')

  const balances = new Map<string, LeaveBalance>()
  for (const p of profiles ?? []) {
    balances.set(p.id as string, {
      entitlementDays: (p.holiday_entitlement_days as number | null) ?? null,
      entitlementHours: (p.holiday_entitlement_hours as number | null) ?? null,
      takenDays: 0,
      remainingDays: null,
    })
  }

  // Fetch Annual Leave entries that could overlap the target year.
  const rangeStart = `${year}-01-01T00:00:00.000Z`
  const rangeEnd = `${year}-12-31T23:59:59.999Z`
  const { data: entries } = await admin
    .from('calendar_entries')
    .select('user_id, start_at, end_at')
    .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  const workDaysByUser = new Map<string, number[]>()
  for (const p of profiles ?? []) {
    const wd = p.work_days as number[] | null
    workDaysByUser.set(p.id as string, wd && wd.length > 0 ? wd : DEFAULT_WORK_DAYS)
  }

  for (const e of entries ?? []) {
    const userId = e.user_id as string
    const bal = balances.get(userId)
    if (!bal) continue
    const workDays = workDaysByUser.get(userId) ?? DEFAULT_WORK_DAYS
    bal.takenDays += workingDaysInRange(
      e.start_at as string,
      e.end_at as string,
      year,
      workDays,
    )
  }

  for (const bal of balances.values()) {
    if (bal.entitlementDays != null) {
      bal.remainingDays = Math.max(0, bal.entitlementDays - bal.takenDays)
    }
  }

  return balances
}

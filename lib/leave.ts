import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkDayHours } from '@/lib/types/database'
import { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID } from '@/lib/constants/leave'

// Re-export for existing server-side importers.
export { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID }

// Default working pattern (Mon–Fri) as ISO weekday numbers when a user has no
// explicit `work_days` configured.
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]
// Fallback net hours for a working day when a user has no per-day hours set.
const DEFAULT_DAY_HOURS = 7.5

/**
 * Converts a Date to an ISO weekday number (1 = Monday ... 7 = Sunday).
 */
function isoWeekday(d: Date): number {
  const day = d.getUTCDay() // 0 = Sunday ... 6 = Saturday
  return day === 0 ? 7 : day
}

/** Formats a UTC date as "YYYY-MM-DD" for calendar-day comparisons. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Net working hours for a given ISO weekday from a user's per-day hours.
 * Returns null when that weekday has no configured hours.
 */
function netHoursForWeekday(hours: WorkDayHours | null, weekday: number): number | null {
  if (!hours) return null
  const entry = hours[String(weekday)]
  if (!entry?.start || !entry?.end) return null
  const [sh, sm] = entry.start.split(':').map(Number)
  const [eh, em] = entry.end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) return null
  const brk = Number(entry.break_minutes) || 0
  const net = endMin - startMin - brk
  return net > 0 ? net / 60 : null
}

/**
 * Walks the inclusive day range of a leave entry (clamped to the calendar year)
 * and accumulates the working days and net working hours it consumes. Weekends,
 * bank holidays and any day the user does not normally work are excluded.
 */
function consumeRange(
  startAt: string,
  endAt: string,
  year: number,
  workDays: number[],
  workDayHours: WorkDayHours | null,
  bankHolidays: Set<string>,
): { days: number; hours: number } {
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)

  const start = new Date(startAt)
  const end = new Date(endAt)
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())

  if (cursor < yearStart) cursor = yearStart
  const stop = Math.min(last, yearEnd)

  let days = 0
  let hours = 0
  const oneDay = 24 * 60 * 60 * 1000
  while (cursor <= stop) {
    const d = new Date(cursor)
    const weekday = isoWeekday(d)
    // Skip non-working days and bank holidays.
    if (workDays.includes(weekday) && !bankHolidays.has(dayKey(cursor))) {
      days += 1
      hours += netHoursForWeekday(workDayHours, weekday) ?? DEFAULT_DAY_HOURS
    }
    cursor += oneDay
  }
  return { days, hours }
}

// Re-export the working-hours type for consumers that build day/hour views.
export type { WorkDayHours }

/**
 * Counts the working days a leave entry spans (weekends, bank holidays and the
 * user's non-working days excluded). Not year-clamped — intended for showing the
 * length of a single request in the Approvals area.
 */
export function countWorkingDays(
  startAt: string,
  endAt: string,
  bankHolidays: Set<string>,
  workDays: number[] = DEFAULT_WORK_DAYS,
): number {
  const start = new Date(startAt)
  const end = new Date(endAt)
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  let days = 0
  const oneDay = 24 * 60 * 60 * 1000
  while (cursor <= last) {
    const weekday = isoWeekday(new Date(cursor))
    if (workDays.includes(weekday) && !bankHolidays.has(dayKey(cursor))) days += 1
    cursor += oneDay
  }
  return days
}

export interface LeaveBalance {
  entitlementDays: number | null
  entitlementHours: number | null
  takenDays: number
  takenHours: number
  /** entitlementDays - takenDays, or null when no day entitlement is set. */
  remainingDays: number | null
  /** entitlementHours - takenHours, or null when no hour entitlement is set. */
  remainingHours: number | null
}

/**
 * Computes each user's annual-leave balance for the given calendar year.
 * Only APPROVED Annual Leave entries count. "Taken" is derived from those
 * entries overlapping the year, so on 1 Jan the balance naturally refreshes to
 * the full entitlement without any stored value being reset. Weekends, bank
 * holidays and non-working days are excluded. Returns a map keyed by user id.
 */
export async function computeLeaveBalances(
  year: number = new Date().getUTCFullYear(),
): Promise<Map<string, LeaveBalance>> {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, work_days, work_day_hours, holiday_entitlement_days, holiday_entitlement_hours')

  const balances = new Map<string, LeaveBalance>()
  const workDaysByUser = new Map<string, number[]>()
  const workHoursByUser = new Map<string, WorkDayHours | null>()
  for (const p of profiles ?? []) {
    balances.set(p.id as string, {
      entitlementDays: (p.holiday_entitlement_days as number | null) ?? null,
      entitlementHours: (p.holiday_entitlement_hours as number | null) ?? null,
      takenDays: 0,
      takenHours: 0,
      remainingDays: null,
      remainingHours: null,
    })
    const wd = p.work_days as number[] | null
    workDaysByUser.set(p.id as string, wd && wd.length > 0 ? wd : DEFAULT_WORK_DAYS)
    workHoursByUser.set(p.id as string, (p.work_day_hours as WorkDayHours | null) ?? null)
  }

  const rangeStart = `${year}-01-01T00:00:00.000Z`
  const rangeEnd = `${year}-12-31T23:59:59.999Z`

  // Bank holidays in the year (company-wide, so exclude their calendar days).
  const { data: holidays } = await admin
    .from('calendar_entries')
    .select('start_at, end_at')
    .eq('entry_type_id', BANK_HOLIDAY_TYPE_ID)
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  const bankHolidays = new Set<string>()
  for (const h of holidays ?? []) {
    const s = new Date(h.start_at as string)
    const e = new Date(h.end_at as string)
    let cur = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())
    const end = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
    while (cur <= end) {
      bankHolidays.add(dayKey(cur))
      cur += 24 * 60 * 60 * 1000
    }
  }

  // Only APPROVED annual leave counts towards taken balances.
  const { data: entries } = await admin
    .from('calendar_entries')
    .select('user_id, start_at, end_at')
    .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
    .eq('approval_status', 'approved')
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  for (const e of entries ?? []) {
    const userId = e.user_id as string
    const bal = balances.get(userId)
    if (!bal) continue
    const { days, hours } = consumeRange(
      e.start_at as string,
      e.end_at as string,
      year,
      workDaysByUser.get(userId) ?? DEFAULT_WORK_DAYS,
      workHoursByUser.get(userId) ?? null,
      bankHolidays,
    )
    bal.takenDays += days
    bal.takenHours += hours
  }

  for (const bal of balances.values()) {
    // Round hours to 2dp to avoid float noise.
    bal.takenHours = Math.round(bal.takenHours * 100) / 100
    if (bal.entitlementDays != null) {
      bal.remainingDays = Math.max(0, bal.entitlementDays - bal.takenDays)
    }
    if (bal.entitlementHours != null) {
      bal.remainingHours = Math.max(0, Math.round((bal.entitlementHours - bal.takenHours) * 100) / 100)
    }
  }

  return balances
}

/**
 * Resolves who should approve a user's leave request: their nominated manager,
 * or all admins as a fallback when no manager is set. Returns user ids.
 */
export async function getLeaveApprovers(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('manager_id')
    .eq('id', userId)
    .single()

  if (profile?.manager_id) return [profile.manager_id as string]

  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active')
  return (admins ?? []).map((a) => a.id as string)
}

/**
 * Returns the user ids of Accounts-department members plus admins, used to
 * notify "accounts" when leave is approved.
 */
export async function getAccountsAndAdminIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data: dept } = await admin
    .from('departments')
    .select('id')
    .ilike('name', 'accounts')
    .maybeSingle()

  const ids = new Set<string>()
  if (dept?.id) {
    const { data: accts } = await admin
      .from('profiles')
      .select('id')
      .eq('department_id', dept.id as string)
      .eq('status', 'active')
    for (const a of accts ?? []) ids.add(a.id as string)
  }
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active')
  for (const a of admins ?? []) ids.add(a.id as string)
  return [...ids]
}

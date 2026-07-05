import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeavePortion, WorkDayHours } from '@/lib/types/database'
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
 * Resolves how much of a single working day a portion consumes, given that
 * day's net working hours and (for 'hours' portions) the hours booked.
 * Returns both the fraction of a day (for day-based balances) and the raw hours
 * (for hour-based balances). 'hours' is capped at the day's net hours — you
 * cannot book more leave than the day contains.
 */
function portionUsage(
  portion: LeavePortion,
  netHours: number,
  hoursField: number | null,
): { dayFraction: number; hours: number } {
  switch (portion) {
    case 'am':
    case 'pm':
      return { dayFraction: 0.5, hours: netHours / 2 }
    case 'hours': {
      const booked = Math.min(Math.max(Number(hoursField) || 0, 0), netHours)
      return { dayFraction: netHours > 0 ? booked / netHours : 0, hours: booked }
    }
    case 'full':
    default:
      return { dayFraction: 1, hours: netHours }
  }
}

// Options describing partial-day portions and the user's working pattern for a
// single leave span. All fields are optional and default to today's whole-day
// behaviour (portions = 'full', Mon–Fri, default day hours).
export interface LeaveSpanOptions {
  startPortion?: LeavePortion
  endPortion?: LeavePortion
  startHours?: number | null
  endHours?: number | null
  workDays?: number[]
  workDayHours?: WorkDayHours | null
  // When set, the span is clamped to this calendar year (used by balances so a
  // request straddling year-end only counts the portion inside the year).
  year?: number
}

/**
 * Walks the inclusive day range of a leave entry and accumulates both the
 * working days and net working hours it consumes. Weekends, bank holidays and
 * any day the user does not normally work are excluded. Partial-day portions
 * (half-day AM/PM or custom hours) apply to the first and last day only; every
 * day in between is a full working day. This is the single source of truth for
 * how much leave a request costs, in both days and hours.
 */
export function computeLeaveSpan(
  startAt: string,
  endAt: string,
  bankHolidays: Set<string>,
  opts: LeaveSpanOptions = {},
): { days: number; hours: number } {
  const workDays = opts.workDays && opts.workDays.length > 0 ? opts.workDays : DEFAULT_WORK_DAYS
  const workDayHours = opts.workDayHours ?? null
  const startPortion = opts.startPortion ?? 'full'
  const endPortion = opts.endPortion ?? 'full'

  const start = new Date(startAt)
  const end = new Date(endAt)
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  // The real first/last calendar days of the booking (before any year clamp), so
  // the partial portions attach to the correct days.
  const firstKey = cursor
  const lastKey = last

  let stop = last
  if (opts.year != null) {
    const yearStart = Date.UTC(opts.year, 0, 1)
    const yearEnd = Date.UTC(opts.year, 11, 31)
    if (cursor < yearStart) cursor = yearStart
    stop = Math.min(last, yearEnd)
  }

  let days = 0
  let hours = 0
  const oneDay = 24 * 60 * 60 * 1000
  while (cursor <= stop) {
    const weekday = isoWeekday(new Date(cursor))
    // Skip non-working days and bank holidays.
    if (workDays.includes(weekday) && !bankHolidays.has(dayKey(cursor))) {
      const net = netHoursForWeekday(workDayHours, weekday) ?? DEFAULT_DAY_HOURS
      // Middle days are always full. Single-day bookings (firstKey === lastKey)
      // use the start portion. The first-day check wins when they coincide.
      let portion: LeavePortion = 'full'
      let hoursField: number | null = null
      if (cursor === firstKey) {
        portion = startPortion
        hoursField = opts.startHours ?? null
      } else if (cursor === lastKey) {
        portion = endPortion
        hoursField = opts.endHours ?? null
      }
      const { dayFraction, hours: dayHours } = portionUsage(portion, net, hoursField)
      days += dayFraction
      hours += dayHours
    }
    cursor += oneDay
  }
  return { days, hours }
}

// Re-export the working-hours type for consumers that build day/hour views.
export type { WorkDayHours }

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
    .select('user_id, start_at, end_at, start_portion, end_portion, start_hours, end_hours')
    .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
    .eq('approval_status', 'approved')
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  for (const e of entries ?? []) {
    const userId = e.user_id as string
    const bal = balances.get(userId)
    if (!bal) continue
    const { days, hours } = computeLeaveSpan(
      e.start_at as string,
      e.end_at as string,
      bankHolidays,
      {
        year,
        workDays: workDaysByUser.get(userId) ?? DEFAULT_WORK_DAYS,
        workDayHours: workHoursByUser.get(userId) ?? null,
        startPortion: (e.start_portion as LeavePortion) ?? 'full',
        endPortion: (e.end_portion as LeavePortion) ?? 'full',
        startHours: (e.start_hours as number | null) ?? null,
        endHours: (e.end_hours as number | null) ?? null,
      },
    )
    bal.takenDays += days
    bal.takenHours += hours
  }

  for (const bal of balances.values()) {
    // Round to avoid float noise now that days can be fractional (0.5, etc.).
    bal.takenHours = Math.round(bal.takenHours * 100) / 100
    bal.takenDays = Math.round(bal.takenDays * 100) / 100
    if (bal.entitlementDays != null) {
      bal.remainingDays = Math.max(0, Math.round((bal.entitlementDays - bal.takenDays) * 100) / 100)
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

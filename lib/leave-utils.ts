// Pure, client-safe leave calculation and formatting helpers.
//
// This module contains NO server-only dependencies (no admin DB client), so it
// can be imported from both client components and server code. The server-only
// DB functions live in `lib/leave.ts`, which re-exports everything here for
// backward compatibility.
import type { LeavePortion, WorkDayHours } from '@/lib/types/database'

// Default working pattern (Mon–Fri) as ISO weekday numbers when a user has no
// explicit `work_days` configured.
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]
// Fallback net hours for a working day when a user has no per-day hours set.
export const DEFAULT_DAY_HOURS = 7.5

/**
 * Converts a Date to an ISO weekday number (1 = Monday ... 7 = Sunday).
 */
function isoWeekday(d: Date): number {
  const day = d.getUTCDay() // 0 = Sunday ... 6 = Saturday
  return day === 0 ? 7 : day
}

/** Formats a UTC date as "YYYY-MM-DD" for calendar-day comparisons. */
export function dayKey(ms: number): string {
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

// Rounds a number to at most `dp` decimals and drops trailing zeros (e.g. 1.0 →
// "1", 0.5 → "0.5").
function trim(n: number, dp = 2): string {
  return String(Math.round(n * 10 ** dp) / 10 ** dp)
}

/**
 * Human-readable length of a leave request. Uses hours when the request is
 * expressed in hours (part-time staff), otherwise days — with a half-day shown
 * as "0.5 day". Falls back gracefully for whole-day bookings.
 */
export function formatLeaveLength(
  days: number,
  hours: number,
  opts: { hourly?: boolean } = {},
): string {
  if (opts.hourly) {
    return `${trim(hours, 1)} hr${hours === 1 ? '' : 's'}`
  }
  return `${trim(days)} day${days === 1 ? '' : 's'}`
}

/**
 * Short label describing the partial-day portions of a request, e.g.
 * "Half day (AM)", "PM → AM", "4 hrs", or "" for a plain full-day request.
 */
export function formatPortionNote(
  startPortion: LeavePortion,
  endPortion: LeavePortion,
  startHours: number | null,
  endHours: number | null,
  sameDay: boolean,
): string {
  if (startPortion === 'hours' || endPortion === 'hours') {
    const parts: string[] = []
    if (startHours != null) parts.push(`${trim(startHours, 1)} hrs`)
    if (!sameDay && endHours != null) parts.push(`${trim(endHours, 1)} hrs`)
    return parts.join(' + ')
  }
  const label = (p: LeavePortion) => (p === 'am' ? 'AM' : p === 'pm' ? 'PM' : '')
  if (sameDay) {
    return startPortion === 'am' || startPortion === 'pm' ? `Half day (${label(startPortion)})` : ''
  }
  const s = label(startPortion)
  const e = label(endPortion)
  if (!s && !e) return ''
  return `${s || 'Full'} → ${e || 'Full'}`
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

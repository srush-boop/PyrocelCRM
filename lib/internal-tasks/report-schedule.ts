import type { ReportScheduleFrequency } from '@/lib/types/database'

// ============================================================================
// Internal Tasks — scheduled report cadence (pure, no I/O)
// Given the cron run time and a schedule's frequency/day settings, decides
// whether the schedule is due to fire today and, if so, the reporting window
// (a [start, end) UTC range) plus an idempotency key and a human label.
// Kept side-effect free so it can be unit-tested and reused by the cron.
// ============================================================================

export interface ReportWindow {
  /** Inclusive start of the reporting window (UTC). */
  start: Date
  /** Exclusive end of the reporting window (UTC). */
  end: Date
  /** Stable key for this window, e.g. 'm:2026-08' — used for idempotency. */
  periodKey: string
  /** Human-readable label for the email/report heading. */
  label: string
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Returns the window a schedule should report on if it is due to fire on `now`,
 * otherwise null. Windows always cover a just-completed period:
 * - daily   → yesterday (fires every day)
 * - weekly  → the previous 7 days, firing only on `dayOfWeek` (default Monday)
 * - monthly → the previous calendar month, firing only on `dayOfMonth`
 *             (default the 1st; clamped to the last day of a short month)
 */
export function dueReportWindow(
  now: Date,
  frequency: ReportScheduleFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): ReportWindow | null {
  const todayStart = startOfUTCDay(now)

  if (frequency === 'daily') {
    const start = new Date(todayStart)
    start.setUTCDate(start.getUTCDate() - 1)
    return { start, end: todayStart, periodKey: `d:${ymd(start)}`, label: dayLabel(start) }
  }

  if (frequency === 'weekly') {
    const dow = (((dayOfWeek ?? 1) % 7) + 7) % 7
    if (todayStart.getUTCDay() !== dow) return null
    const start = new Date(todayStart)
    start.setUTCDate(start.getUTCDate() - 7)
    const lastDay = new Date(todayStart)
    lastDay.setUTCDate(lastDay.getUTCDate() - 1)
    return {
      start,
      end: todayStart,
      periodKey: `w:${ymd(start)}`,
      label: `${dayLabel(start)} – ${dayLabel(lastDay)}`,
    }
  }

  // monthly
  const daysInThisMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const fireDay = Math.min(Math.max(dayOfMonth ?? 1, 1), daysInThisMonth)
  if (now.getUTCDate() !== fireDay) return null
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    start: prevStart,
    end: thisStart,
    periodKey: `m:${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, '0')}`,
    label: monthLabel(prevStart),
  }
}

/**
 * The most recently completed window for a frequency, ignoring the day gate.
 * Used by the manual "send now" action so a report can be previewed/sent on any
 * day. daily → yesterday, weekly → previous 7 days, monthly → last month.
 */
export function latestReportWindow(
  now: Date,
  frequency: ReportScheduleFrequency,
): ReportWindow {
  const todayStart = startOfUTCDay(now)
  if (frequency === 'daily') {
    const start = new Date(todayStart)
    start.setUTCDate(start.getUTCDate() - 1)
    return { start, end: todayStart, periodKey: `d:${ymd(start)}`, label: dayLabel(start) }
  }
  if (frequency === 'weekly') {
    const start = new Date(todayStart)
    start.setUTCDate(start.getUTCDate() - 7)
    const lastDay = new Date(todayStart)
    lastDay.setUTCDate(lastDay.getUTCDate() - 1)
    return {
      start,
      end: todayStart,
      periodKey: `w:${ymd(start)}`,
      label: `${dayLabel(start)} – ${dayLabel(lastDay)}`,
    }
  }
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    start: prevStart,
    end: thisStart,
    periodKey: `m:${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, '0')}`,
    label: monthLabel(prevStart),
  }
}

/** Short human description of a schedule's cadence, for list display. */
export function scheduleCadenceLabel(
  frequency: ReportScheduleFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): string {
  if (frequency === 'daily') return 'Daily'
  if (frequency === 'weekly') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return `Weekly on ${days[(((dayOfWeek ?? 1) % 7) + 7) % 7]}`
  }
  const dom = dayOfMonth ?? 1
  const suffix =
    dom % 10 === 1 && dom !== 11
      ? 'st'
      : dom % 10 === 2 && dom !== 12
        ? 'nd'
        : dom % 10 === 3 && dom !== 13
          ? 'rd'
          : 'th'
  return `Monthly on the ${dom}${suffix}`
}

/**
 * Timesheet calculation engine (pure + unit-testable).
 *
 * A timesheet covers one week ending on a Sunday. Worked time — and therefore
 * overtime — is derived from the user's *working day span* (lone-worker shift
 * start → finish, which includes any out-of-hours on-call work), NOT from the
 * individual calendar entries. The entries are surfaced separately so a
 * reviewer can see the day was fully utilised.
 *
 * Three overtime totals are reported:
 *   - Mon–Fri: time OUTSIDE the user's normal configured hours, minus a travel
 *     allowance (default 30 min) at each end of the day, rounded UP to 15 min.
 *   - Saturday: ALL worked minutes (no travel deduction), rounded up to 15 min.
 *   - Sunday: ALL worked minutes (no travel deduction), rounded up to 15 min.
 *
 * Plus: night-shift days (worked span overlaps the configured night window,
 * paid at a different rate), an on-call summary (shift count + day + band, not
 * hours), and a leave summary (annual leave + sickness with dates).
 *
 * All arithmetic is done in absolute epoch minutes (from timestamptz ISO
 * strings), so time-zone offsets are handled by Date parsing. "Normal hours"
 * for a day are anchored to that day's local calendar date.
 */

import type { Profile, WorkDayHours, WorkDayHoursEntry } from '@/lib/types/database'
import { netDailyHours } from '@/lib/billing/user-cost-calc'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TimesheetConfig {
  travelAllowanceMinutes: number
  otRoundingMinutes: number
  nightStart: string // "HH:MM"
  nightEnd: string // "HH:MM" (may be < nightStart, meaning it wraps midnight)
  nightRateLabel: string
}

export const DEFAULT_TIMESHEET_CONFIG: TimesheetConfig = {
  travelAllowanceMinutes: 30,
  otRoundingMinutes: 15,
  nightStart: '20:00',
  nightEnd: '06:00',
  nightRateLabel: 'Night rate',
}

/** Parse the loosely-typed global_config jsonb into a TimesheetConfig. */
export function parseTimesheetConfig(raw: unknown): TimesheetConfig {
  const c = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) && n >= 0 ? n : d
  }
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d)
  return {
    travelAllowanceMinutes: num(c.travel_allowance_minutes, DEFAULT_TIMESHEET_CONFIG.travelAllowanceMinutes),
    otRoundingMinutes: num(c.ot_rounding_minutes, DEFAULT_TIMESHEET_CONFIG.otRoundingMinutes) || 15,
    nightStart: str(c.night_start, DEFAULT_TIMESHEET_CONFIG.nightStart),
    nightEnd: str(c.night_end, DEFAULT_TIMESHEET_CONFIG.nightEnd),
    nightRateLabel: str(c.night_rate_label, DEFAULT_TIMESHEET_CONFIG.nightRateLabel),
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type TimesheetEntrySource = 'job' | 'calendar' | 'manual' | 'oncall'

export interface RawShift {
  shift_start: string
  finished_at: string | null
  shift_end: string | null
}

export interface RawOncall {
  shift_date: string
  band: string | null
}

export interface RawJob {
  id: string
  scheduled_date: string
  booked_start_time: string | null
  booked_end_time: string | null
  booked_duration_minutes: number | null
  testing_start_time: string | null
  testing_end_time: string | null
  site_label?: string | null
  service_label?: string | null
}

export interface RawCalendarEntry {
  id: string
  type_name: string
  title: string | null
  start_at: string
  end_at: string
  all_day: boolean
}

export interface RawManualEntry {
  id: string
  entry_date: string
  start_at: string
  end_at: string
  description: string | null
}

export interface TimesheetInputs {
  profile: Pick<
    Profile,
    'id' | 'work_days' | 'work_day_hours' | 'work_start_time' | 'work_end_time' | 'lunch_minutes'
  >
  weekEnding: string // Sunday, "YYYY-MM-DD"
  shifts: RawShift[]
  oncall: RawOncall[]
  jobs: RawJob[]
  calendar: RawCalendarEntry[]
  manual: RawManualEntry[]
  config?: TimesheetConfig
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface TimesheetEntry {
  source: TimesheetEntrySource
  label: string
  start: string | null // ISO
  end: string | null // ISO
  minutes: number
  allDay: boolean
  isLeave: boolean
}

export interface TimesheetDay {
  date: string // "YYYY-MM-DD"
  isoWeekday: number // 1=Mon..7=Sun
  dayName: string
  entries: TimesheetEntry[]
  shiftStart: string | null
  shiftEnd: string | null
  workedMinutes: number
  normalStart: string | null // ISO on this date
  normalEnd: string | null // ISO on this date
  earlyOtMinutes: number
  lateOtMinutes: number
  weekdayOtMinutes: number // rounded, Mon–Fri only
  weekendOtMinutes: number // rounded, Sat/Sun only
  isNightShift: boolean
  oncallBand: string | null
}

export interface LeaveSummaryItem {
  type: string
  dates: string[] // "YYYY-MM-DD"
}

export interface OncallSummaryItem {
  date: string
  dayName: string
  band: string | null
}

export interface TimesheetSummary {
  weekEnding: string
  weekStart: string
  days: TimesheetDay[]
  // Three overtime totals (minutes)
  weekdayOtMinutes: number // Mon–Fri
  saturdayOtMinutes: number
  sundayOtMinutes: number
  totalWorkedMinutes: number
  nightShiftDays: string[] // dates
  nightShiftCount: number
  nightRateLabel: string
  oncall: OncallSummaryItem[]
  oncallCount: number
  leave: LeaveSummaryItem[]
}

// Calendar entry type names treated as LEAVE (excluded from worked time; shown
// in the leave summary when Annual Leave / Sickness).
const LEAVE_TYPE_NAMES = new Set([
  'annual leave',
  'sickness',
  'bank holiday',
  'authorised leave',
  'maternity/paternity leave',
])
const LEAVE_SUMMARY_TYPES = new Set(['annual leave', 'sickness'])

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" -> Date at local midnight. */
function localDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Format a Date as local "YYYY-MM-DD". */
export function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO weekday 1=Mon..7=Sun from a JS getDay() (0=Sun..6=Sat). */
function isoWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

/** Epoch minutes for an ISO timestamp string. */
function epochMin(iso: string): number {
  return Math.round(new Date(iso).getTime() / 60000)
}

/** Compose a local ISO timestamp from a date string + "HH:MM[:SS]" time. */
function atTime(dateStr: string, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = localDate(dateStr)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}

/** Round minutes UP to the nearest `step`. */
export function roundUpTo(minutes: number, step: number): number {
  if (minutes <= 0) return 0
  if (step <= 0) return Math.round(minutes)
  return Math.ceil(minutes / step) * step
}

/** The Sunday week-ending date for any given date. */
export function weekEndingFor(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const iso = isoWeekday(d.getDay()) // 1..7
  // days until Sunday (iso 7)
  const add = 7 - iso
  d.setDate(d.getDate() + add)
  return fmtDate(d)
}

/** The seven dates Mon..Sun for a Sunday week-ending. */
export function weekDates(weekEnding: string): string[] {
  const end = localDate(weekEnding)
  const out: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)
    out.push(fmtDate(d))
  }
  return out
}

// ---------------------------------------------------------------------------
// Normal hours
// ---------------------------------------------------------------------------

function normalEntryForIso(
  profile: TimesheetInputs['profile'],
  isoDay: number,
): WorkDayHoursEntry | null {
  const hours = profile.work_day_hours as WorkDayHours | null
  const entry = hours?.[String(isoDay)]
  if (entry) return entry
  if (profile.work_start_time && profile.work_end_time) {
    return {
      start: profile.work_start_time,
      end: profile.work_end_time,
      break_minutes: profile.lunch_minutes ?? 0,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Night window
// ---------------------------------------------------------------------------

/** Does [start,end] (epoch min) overlap the night window on the entry's day? */
function overlapsNight(
  dateStr: string,
  startMin: number,
  endMin: number,
  cfg: TimesheetConfig,
): boolean {
  if (endMin <= startMin) return false
  // Build the night window as an absolute range. If nightEnd <= nightStart the
  // window wraps past midnight into the next day.
  const nStart = epochMin(atTime(dateStr, cfg.nightStart))
  let nEnd = epochMin(atTime(dateStr, cfg.nightEnd))
  if (nEnd <= nStart) nEnd += 24 * 60 // wrap to next day
  // Also consider the previous night's tail (e.g. 00:00–06:00 belongs to the
  // window that opened the evening before).
  const prevStart = nStart - 24 * 60
  const prevEnd = nEnd - 24 * 60
  const overlap = (aS: number, aE: number, bS: number, bE: number) =>
    Math.min(aE, bE) > Math.max(aS, bS)
  return overlap(startMin, endMin, nStart, nEnd) || overlap(startMin, endMin, prevStart, prevEnd)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function computeTimesheet(inputs: TimesheetInputs): TimesheetSummary {
  const cfg = inputs.config ?? DEFAULT_TIMESHEET_CONFIG
  const dates = weekDates(inputs.weekEnding)
  const travel = cfg.travelAllowanceMinutes

  const days: TimesheetDay[] = dates.map((date) => {
    const dObj = localDate(date)
    const iso = isoWeekday(dObj.getDay())
    const isWeekend = iso === 6 || iso === 7

    // --- Entries (for utilisation display) ---
    const entries: TimesheetEntry[] = []

    // Jobs on this date (actual on-site times, fall back to booked slot).
    for (const job of inputs.jobs) {
      if (job.scheduled_date !== date) continue
      let start: string | null = null
      let end: string | null = null
      if (job.testing_start_time && job.testing_end_time) {
        start = job.testing_start_time
        end = job.testing_end_time
      } else if (job.booked_start_time) {
        start = atTime(date, job.booked_start_time)
        if (job.booked_end_time) {
          end = atTime(date, job.booked_end_time)
        } else if (job.booked_duration_minutes) {
          end = new Date(epochMin(start) * 60000 + job.booked_duration_minutes * 60000).toISOString()
        }
      }
      const minutes = start && end ? Math.max(0, epochMin(end) - epochMin(start)) : 0
      const label = [job.site_label, job.service_label].filter(Boolean).join(' — ') || 'Call'
      entries.push({ source: 'job', label, start, end, minutes, allDay: false, isLeave: false })
    }

    // Calendar entries whose span touches this date.
    for (const c of inputs.calendar) {
      const cStartDate = fmtDate(new Date(c.start_at))
      const cEndDate = fmtDate(new Date(c.end_at))
      if (date < cStartDate || date > cEndDate) continue
      const isLeave = LEAVE_TYPE_NAMES.has(c.type_name.trim().toLowerCase())
      const minutes = c.all_day ? 0 : Math.max(0, epochMin(c.end_at) - epochMin(c.start_at))
      entries.push({
        source: 'calendar',
        label: c.title ? `${c.type_name}: ${c.title}` : c.type_name,
        start: c.all_day ? null : c.start_at,
        end: c.all_day ? null : c.end_at,
        minutes,
        allDay: c.all_day,
        isLeave,
      })
    }

    // Manual entries.
    for (const m of inputs.manual) {
      if (m.entry_date !== date) continue
      const minutes = Math.max(0, epochMin(m.end_at) - epochMin(m.start_at))
      entries.push({
        source: 'manual',
        label: m.description || 'Manual entry',
        start: m.start_at,
        end: m.end_at,
        minutes,
        allDay: false,
        isLeave: false,
      })
    }

    // --- Worked span from shift(s) on this date ---
    const dayShifts = inputs.shifts.filter((s) => fmtDate(new Date(s.shift_start)) === date)
    let shiftStart: string | null = null
    let shiftEnd: string | null = null
    for (const s of dayShifts) {
      const end = s.finished_at ?? s.shift_end
      if (!shiftStart || epochMin(s.shift_start) < epochMin(shiftStart)) shiftStart = s.shift_start
      if (end && (!shiftEnd || epochMin(end) > epochMin(shiftEnd))) shiftEnd = end
    }

    // Fallback: no shift record but there are timed job/manual entries — use the
    // earliest start and latest end so overtime can still be estimated.
    if (!shiftStart || !shiftEnd) {
      const timed = entries.filter((e) => e.start && e.end && !e.isLeave)
      if (timed.length) {
        const starts = timed.map((e) => epochMin(e.start as string))
        const ends = timed.map((e) => epochMin(e.end as string))
        const minStart = Math.min(...starts)
        const maxEnd = Math.max(...ends)
        if (!shiftStart) shiftStart = new Date(minStart * 60000).toISOString()
        if (!shiftEnd) shiftEnd = new Date(maxEnd * 60000).toISOString()
      }
    }

    const workedMinutes =
      shiftStart && shiftEnd ? Math.max(0, epochMin(shiftEnd) - epochMin(shiftStart)) : 0

    // --- Normal hours anchored to this date ---
    const normalEntry = normalEntryForIso(inputs.profile, iso)
    let normalStart: string | null = null
    let normalEnd: string | null = null
    if (normalEntry && netDailyHours(normalEntry) > 0 && !isWeekend) {
      normalStart = atTime(date, normalEntry.start)
      normalEnd = atTime(date, normalEntry.end)
    }

    // --- Overtime ---
    let earlyOt = 0
    let lateOt = 0
    let weekdayOt = 0
    let weekendOt = 0

    if (isWeekend) {
      // All worked minutes are OT, no travel deduction.
      weekendOt = roundUpTo(workedMinutes, cfg.otRoundingMinutes)
    } else if (shiftStart && shiftEnd && normalStart && normalEnd) {
      earlyOt = Math.max(0, epochMin(normalStart) - epochMin(shiftStart) - travel)
      lateOt = Math.max(0, epochMin(shiftEnd) - epochMin(normalEnd) - travel)
      weekdayOt = roundUpTo(earlyOt + lateOt, cfg.otRoundingMinutes)
    } else if (shiftStart && shiftEnd && !normalStart) {
      // Weekday with no normal hours configured (or a non-working weekday):
      // treat the whole worked span as OT, minus travel each end.
      const raw = Math.max(0, workedMinutes - travel * 2)
      weekdayOt = roundUpTo(raw, cfg.otRoundingMinutes)
      lateOt = raw
    }

    // --- Night shift ---
    const isNightShift =
      !!shiftStart && !!shiftEnd && overlapsNight(date, epochMin(shiftStart), epochMin(shiftEnd), cfg)

    // --- On-call band for this date ---
    const oncallForDay = inputs.oncall.find((o) => o.shift_date === date)

    return {
      date,
      isoWeekday: iso,
      dayName: DAY_NAMES[dObj.getDay()],
      entries: entries.sort((a, b) => {
        if (a.start && b.start) return epochMin(a.start) - epochMin(b.start)
        if (a.start) return -1
        if (b.start) return 1
        return 0
      }),
      shiftStart,
      shiftEnd,
      workedMinutes,
      normalStart,
      normalEnd,
      earlyOtMinutes: earlyOt,
      lateOtMinutes: lateOt,
      weekdayOtMinutes: weekdayOt,
      weekendOtMinutes: weekendOt,
      isNightShift,
      oncallBand: oncallForDay?.band ?? null,
    }
  })

  // --- Weekly rollups ---
  let weekdayOtMinutes = 0
  let saturdayOtMinutes = 0
  let sundayOtMinutes = 0
  let totalWorkedMinutes = 0
  const nightShiftDays: string[] = []

  for (const d of days) {
    totalWorkedMinutes += d.workedMinutes
    if (d.isoWeekday >= 1 && d.isoWeekday <= 5) weekdayOtMinutes += d.weekdayOtMinutes
    else if (d.isoWeekday === 6) saturdayOtMinutes += d.weekendOtMinutes
    else if (d.isoWeekday === 7) sundayOtMinutes += d.weekendOtMinutes
    if (d.isNightShift) nightShiftDays.push(d.date)
  }

  // On-call summary (count + day + band, not hours).
  const oncall: OncallSummaryItem[] = inputs.oncall
    .filter((o) => dates.includes(o.shift_date))
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
    .map((o) => ({
      date: o.shift_date,
      dayName: DAY_NAMES[localDate(o.shift_date).getDay()],
      band: o.band,
    }))

  // Leave summary (annual leave + sickness with dates).
  const leaveMap = new Map<string, Set<string>>()
  for (const c of inputs.calendar) {
    const name = c.type_name.trim()
    if (!LEAVE_SUMMARY_TYPES.has(name.toLowerCase())) continue
    const set = leaveMap.get(name) ?? new Set<string>()
    // Add each in-week date the entry spans.
    for (const date of dates) {
      const cStartDate = fmtDate(new Date(c.start_at))
      const cEndDate = fmtDate(new Date(c.end_at))
      if (date >= cStartDate && date <= cEndDate) set.add(date)
    }
    if (set.size) leaveMap.set(name, set)
  }
  const leave: LeaveSummaryItem[] = Array.from(leaveMap.entries()).map(([type, set]) => ({
    type,
    dates: Array.from(set).sort(),
  }))

  return {
    weekEnding: inputs.weekEnding,
    weekStart: dates[0],
    days,
    weekdayOtMinutes,
    saturdayOtMinutes,
    sundayOtMinutes,
    totalWorkedMinutes,
    nightShiftDays,
    nightShiftCount: nightShiftDays.length,
    nightRateLabel: cfg.nightRateLabel,
    oncall,
    oncallCount: oncall.length,
    leave,
  }
}

/** Format minutes as "Hh Mm" (e.g. 135 -> "2h 15m"). */
export function fmtMinutes(mins: number): string {
  if (!mins) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

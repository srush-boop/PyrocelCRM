import type { InternalTaskTemplate } from '@/lib/types/database'

// ============================================================================
// Internal Tasks — pure scheduling helpers
// Computes the current occurrence window (period_start/period_end/due_at) for a
// template, and resolves which users a template applies to. No I/O here so the
// logic stays unit-testable; callers supply "now" and the candidate profiles.
// ============================================================================

export interface TaskPeriod {
  /** YYYY-MM-DD (inclusive) */
  periodStart: string
  /** YYYY-MM-DD (inclusive) */
  periodEnd: string
  /** ISO timestamp of the completion deadline */
  dueAt: string
}

// --- date helpers (UTC to avoid DST drift in day arithmetic) ---------------

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fromYMD(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function startOfDayUTC(d: Date): Date {
  const r = new Date(d)
  r.setUTCHours(0, 0, 0, 0)
  return r
}

function lastDayOfMonth(year: number, monthIndex0: number): Date {
  // Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0))
}

// The nth (or last) occurrence of a given weekday within a month, as a UTC date.
// weekday: 0=Sun..6=Sat. which: 'first'|'second'|'third'|'fourth'|'last'.
function nthWeekdayOfMonth(
  year: number,
  monthIndex0: number,
  weekday: number,
  which: 'first' | 'second' | 'third' | 'fourth' | 'last',
): Date {
  const wd = ((weekday % 7) + 7) % 7
  if (which === 'last') {
    const last = lastDayOfMonth(year, monthIndex0)
    const diff = (last.getUTCDay() - wd + 7) % 7
    return addDays(last, -diff)
  }
  const nth = { first: 1, second: 2, third: 3, fourth: 4 }[which]
  const first = new Date(Date.UTC(year, monthIndex0, 1))
  const offset = (wd - first.getUTCDay() + 7) % 7
  const candidate = addDays(first, offset + (nth - 1) * 7)
  // Guard: if a 4th-weekday overflows into next month, fall back to the last one.
  if (candidate.getUTCMonth() !== monthIndex0) {
    return nthWeekdayOfMonth(year, monthIndex0, wd, 'last')
  }
  return candidate
}

// Combine a date (YYYY-MM-DD) with a wall-clock time (HH:MM[:SS]) as a UTC
// instant. UK is UTC+0/+1; we store the wall clock as UTC which gives up to an
// hour of leeway on the deadline during BST — acceptable and documented.
function combineDateTime(dateYMD: string, time: string): string {
  const [h = '0', m = '0', s = '0'] = (time || '09:00').split(':')
  const d = fromYMD(dateYMD)
  d.setUTCHours(Number(h) || 0, Number(m) || 0, Number(s) || 0, 0)
  return d.toISOString()
}

/**
 * Computes the current occurrence window for a template relative to `now`.
 * - weekly: the week ending on `week_ending_dow` (default Sunday), on/after now.
 * - monthly / quarterly: the calendar month / quarter containing now.
 * - annual: the calendar year, optionally shifted to an anchor month/day.
 * - one_off: the single window around `one_off_due_date`.
 * Deadline (dueAt) = period_end + grace_days, at due_time.
 */
export function computePeriod(
  template: Pick<
    InternalTaskTemplate,
    | 'frequency'
    | 'week_ending_dow'
    | 'anchor_month'
    | 'anchor_day'
    | 'one_off_due_date'
    | 'grace_days'
    | 'due_time'
    | 'monthly_due_rule'
    | 'monthly_due_day'
    | 'monthly_due_week'
    | 'monthly_due_weekday'
  >,
  now: Date = new Date(),
): TaskPeriod {
  const ref = startOfDayUTC(now)
  let periodStart: Date
  let periodEnd: Date

  switch (template.frequency) {
    case 'weekly': {
      const dow = ((template.week_ending_dow ?? 0) % 7 + 7) % 7
      const refDow = ref.getUTCDay()
      const daysUntilEnd = (dow - refDow + 7) % 7
      periodEnd = addDays(ref, daysUntilEnd)
      periodStart = addDays(periodEnd, -6)
      break
    }
    case 'monthly': {
      const y = ref.getUTCFullYear()
      const m = ref.getUTCMonth()
      periodStart = new Date(Date.UTC(y, m, 1))
      periodEnd = lastDayOfMonth(y, m)
      break
    }
    case 'quarterly': {
      const y = ref.getUTCFullYear()
      const q = Math.floor(ref.getUTCMonth() / 3)
      const startMonth = q * 3
      periodStart = new Date(Date.UTC(y, startMonth, 1))
      periodEnd = lastDayOfMonth(y, startMonth + 2)
      break
    }
    case 'annual': {
      const anchorMonth0 = template.anchor_month ? template.anchor_month - 1 : 0
      const anchorDay = template.anchor_day ?? 1
      const y = ref.getUTCFullYear()
      let start = new Date(Date.UTC(y, anchorMonth0, anchorDay))
      if (ref < start) start = new Date(Date.UTC(y - 1, anchorMonth0, anchorDay))
      periodStart = start
      periodEnd = addDays(new Date(Date.UTC(start.getUTCFullYear() + 1, anchorMonth0, anchorDay)), -1)
      break
    }
    case 'one_off':
    default: {
      const target = template.one_off_due_date ? fromYMD(template.one_off_due_date) : ref
      periodStart = target
      periodEnd = target
      break
    }
  }

  // Deadline: normally period end + grace. For monthly tasks the admin can pin
  // the due date to a specific calendar day or an nth/last weekday of the month;
  // in that case the chosen date IS the deadline (grace is not added).
  let dueDate = addDays(periodEnd, template.grace_days ?? 0)
  const rule = template.monthly_due_rule ?? 'period_end'
  if (template.frequency === 'monthly' && rule !== 'period_end') {
    const y = periodStart.getUTCFullYear()
    const m = periodStart.getUTCMonth()
    if (rule === 'day_of_month' && template.monthly_due_day) {
      const maxDay = lastDayOfMonth(y, m).getUTCDate()
      const day = Math.min(Math.max(template.monthly_due_day, 1), maxDay)
      dueDate = new Date(Date.UTC(y, m, day))
    } else if (
      rule === 'weekday_of_month' &&
      template.monthly_due_week != null &&
      template.monthly_due_weekday != null
    ) {
      dueDate = nthWeekdayOfMonth(y, m, template.monthly_due_weekday, template.monthly_due_week)
    }
  }

  return {
    periodStart: toYMD(periodStart),
    periodEnd: toYMD(periodEnd),
    dueAt: combineDateTime(toYMD(dueDate), template.due_time || '09:00'),
  }
}

// --- assignment resolution --------------------------------------------------

export interface AssigneeCandidate {
  id: string
  role: string | null
  department_id: string | null
  status?: string | null
}

/**
 * Resolves the set of user ids a template applies to. Union (combine-all) of:
 * applies_to_all, matching role_names, matching department_ids, explicit
 * user_ids. Clients and non-active profiles are always excluded.
 */
export function resolveAssigneeIds(
  template: Pick<
    InternalTaskTemplate,
    'applies_to_all' | 'role_names' | 'department_ids' | 'user_ids'
  >,
  candidates: AssigneeCandidate[],
): string[] {
  const roleSet = new Set(template.role_names ?? [])
  const deptSet = new Set(template.department_ids ?? [])
  const userSet = new Set(template.user_ids ?? [])
  const out = new Set<string>()

  for (const c of candidates) {
    if (c.role === 'client') continue
    if (c.status && c.status !== 'active') continue
    const matches =
      template.applies_to_all ||
      (c.role != null && roleSet.has(c.role)) ||
      (c.department_id != null && deptSet.has(c.department_id)) ||
      userSet.has(c.id)
    if (matches) out.add(c.id)
  }
  return Array.from(out)
}

/**
 * Human label for a template's recurrence, used in lists and reminders.
 */
export function frequencyLabel(t: Pick<InternalTaskTemplate, 'frequency'>): string {
  switch (t.frequency) {
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'annual':
      return 'Annual'
    case 'one_off':
      return 'One-off'
    default:
      return t.frequency
  }
}

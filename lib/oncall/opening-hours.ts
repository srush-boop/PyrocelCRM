/**
 * Company opening hours — the single source of truth for when the business is
 * "open" vs "out of hours". Stored as the `opening_hours` key in `global_config`
 * (see lib/actions/global-config.ts). Kept deliberately simple: one weekday
 * open/close time plus whether weekends count as working days.
 *
 * These hours drive the on-call window (evening cover starts at closing time and
 * hands over at the next opening time) and, in future, the lone-worker
 * out-of-hours escalation ladder.
 */

export const OPENING_HOURS_KEY = 'opening_hours'

export interface OpeningHours {
  /** Weekday opening time, 24h "HH:MM" (e.g. "08:30"). */
  open: string
  /** Weekday closing time, 24h "HH:MM" (e.g. "17:00"). */
  close: string
  /** When true, Sat/Sun are treated as normal working days (open..close). */
  weekendWorking: boolean
}

/** Historical hard-coded defaults, so behaviour is unchanged until edited. */
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  open: '08:30',
  close: '17:00',
  weekendWorking: false,
}

/** "HH:MM" -> { h, m }, clamped to valid ranges. Falls back to the default. */
export function parseTime(value: string, fallback: string): { h: number; m: number } {
  const source = /^\d{1,2}:\d{2}$/.test(value) ? value : fallback
  const [h, m] = source.split(':').map(Number)
  return {
    h: Math.min(23, Math.max(0, h)),
    m: Math.min(59, Math.max(0, m)),
  }
}

/**
 * Coerce an unknown stored value (or null) into a safe OpeningHours object,
 * filling any missing/invalid field from the defaults.
 */
export function parseOpeningHours(value: unknown): OpeningHours {
  if (!value || typeof value !== 'object') return DEFAULT_OPENING_HOURS
  const v = value as Record<string, unknown>
  const open = typeof v.open === 'string' && /^\d{1,2}:\d{2}$/.test(v.open)
    ? v.open
    : DEFAULT_OPENING_HOURS.open
  const close = typeof v.close === 'string' && /^\d{1,2}:\d{2}$/.test(v.close)
    ? v.close
    : DEFAULT_OPENING_HOURS.close
  const weekendWorking = typeof v.weekendWorking === 'boolean'
    ? v.weekendWorking
    : DEFAULT_OPENING_HOURS.weekendWorking
  return { open, close, weekendWorking }
}

/**
 * Whether a given moment falls outside opening hours. On a weekday, out of hours
 * means before `open` or at/after `close`. Weekends are fully out of hours unless
 * `weekendWorking` is set, in which case they follow the same open..close window.
 * (Bank holidays aren't handled here — callers with holiday context should layer
 * that on top.) Intended for the future lone-worker escalation ladder.
 */
export function isOutOfHours(at: Date, hours: OpeningHours): boolean {
  const day = at.getDay() // 0 = Sun, 6 = Sat
  const isWeekend = day === 0 || day === 6
  if (isWeekend && !hours.weekendWorking) return true

  const { h: oh, m: om } = parseTime(hours.open, DEFAULT_OPENING_HOURS.open)
  const { h: ch, m: cm } = parseTime(hours.close, DEFAULT_OPENING_HOURS.close)
  const minutes = at.getHours() * 60 + at.getMinutes()
  const openMin = oh * 60 + om
  const closeMin = ch * 60 + cm
  return minutes < openMin || minutes >= closeMin
}

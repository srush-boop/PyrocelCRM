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

/**
 * Shared semantic status/importance colour system used across every grid and
 * badge in the app. Keeping the palette in one place guarantees the same colour
 * always means the same thing:
 *
 *   success  (green)  — complete, passed, live, approved, paid, active
 *   warning  (amber)  — pending, advisory, on hold, awaiting, due soon
 *   danger   (red)    — overdue, failed, urgent, emergency, cancelled-critical
 *   info     (blue)   — scheduled, in progress, quoted, informational
 *   neutral  (slate)  — inactive, draft, dismissed, not-applicable
 *
 * Classes use soft tinted backgrounds + readable text + a subtle border so
 * badges sit calmly inside grids while still being scannable. Dark-mode aware.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success:
    'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  warning:
    'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
  danger: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300',
  info: 'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300',
  neutral:
    'bg-slate-500/12 text-slate-600 border-slate-500/25 dark:text-slate-300',
}

/**
 * Solid variants for elements that need a filled emphasis (e.g. count chips,
 * urgent markers). Use sparingly — the tinted variants above are the default.
 */
export const STATUS_TONE_SOLID: Record<StatusTone, string> = {
  success: 'bg-emerald-600 text-white',
  warning: 'bg-amber-500 text-white',
  danger: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
  neutral: 'bg-slate-500 text-white',
}

/** Keyword → tone map. Longer / more specific keys are checked first. */
const TONE_KEYWORDS: Array<[RegExp, StatusTone]> = [
  // danger
  [/overdue|failed|fail|urgent|emergency|escalat|breach|critical|rejected|void/i, 'danger'],
  // success
  [/complete|completed|passed|pass|resolved|approved|paid|live|active|closed|won|done|signed/i, 'success'],
  // warning
  [/pending|advisory|on[\s_-]?hold|awaiting|await|due|review|draft[\s_-]?sent|partial|hold|warn/i, 'warning'],
  // info
  [/scheduled|schedule|in[\s_-]?progress|progress|quoted|quote|booked|assigned|open|new|sent|ordered|processing/i, 'info'],
  // neutral
  [/inactive|dismissed|cancelled|canceled|draft|archived|expired|n\/?a|unknown|off[\s_-]?contract/i, 'neutral'],
]

/**
 * Resolve a raw status string to a semantic tone. Falls back to `neutral` when
 * nothing matches, so unexpected values still render tidily.
 */
export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral'
  for (const [re, tone] of TONE_KEYWORDS) {
    if (re.test(status)) return tone
  }
  return 'neutral'
}

/** Convenience: get the tinted badge classes for a raw status string. */
export function statusToneClass(status: string | null | undefined): string {
  return STATUS_TONE_CLASS[statusTone(status)]
}

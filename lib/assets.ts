import type {
  AssetCheckType,
  AssetCheckResult,
  AssetCheckResponsible,
  AssetStatus,
} from '@/lib/types/database'

/**
 * Generate a short, unique-ish asset URN for QR labels.
 * Format: AST-XXXXXX (Crockford base32, no ambiguous chars) so labels stay short.
 */
export function generateAssetUrn(prefix = 'AST'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${out}`
}

export const CHECK_TYPE_LABELS: Record<AssetCheckType, string> = {
  check: 'Check',
  inspection: 'Inspection',
  calibration: 'Calibration',
  test: 'Test',
}

export const CHECK_RESPONSIBLE_LABELS: Record<AssetCheckResponsible, string> = {
  holder: 'Current holder',
  asset_manager: 'Asset manager',
}

export const CHECK_RESULT_LABELS: Record<AssetCheckResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  advisory: 'Advisory',
  na: 'N/A',
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active',
  disposed: 'Disposed',
}

/** Common recurring intervals offered in the schedule editor. */
export const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Monthly' },
  { value: 3, label: 'Quarterly' },
  { value: 6, label: '6 monthly' },
  { value: 12, label: 'Annually' },
  { value: 24, label: 'Every 2 years' },
  { value: 36, label: 'Every 3 years' },
  { value: 60, label: 'Every 5 years' },
]

export function intervalLabel(months: number): string {
  return INTERVAL_OPTIONS.find((o) => o.value === months)?.label || `Every ${months} months`
}

/**
 * Add a whole number of months to an ISO date ("YYYY-MM-DD"), returning ISO.
 * Clamps to the end of the target month (e.g. Jan 31 + 1mo -> Feb 28/29).
 */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const targetMonth = base.getUTCMonth() + months
  const targetYear = base.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  const result = new Date(Date.UTC(targetYear, normMonth, day))
  return result.toISOString().slice(0, 10)
}

/** Today as an ISO "YYYY-MM-DD" string (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Whole-day difference (dueDate - today). Negative = overdue. */
export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null
  const due = new Date(isoDate + 'T00:00:00Z').getTime()
  const now = new Date(todayIso() + 'T00:00:00Z').getTime()
  return Math.round((due - now) / 86_400_000)
}

export type DueStatus = 'ok' | 'due_soon' | 'overdue' | 'none'

/** Classify a due date. `due_soon` triggers within `soonDays` (default 14). */
export function dueStatus(isoDate: string | null, soonDays = 14): DueStatus {
  const diff = daysUntil(isoDate)
  if (diff === null) return 'none'
  if (diff < 0) return 'overdue'
  if (diff <= soonDays) return 'due_soon'
  return 'ok'
}

export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  ok: 'Up to date',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  none: 'No schedule',
}

/** Format a GBP value, or an em dash when null. */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

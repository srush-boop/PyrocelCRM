// Shared, pure compliance/KPI logic used by both the internal admin dashboard
// and the client portal. Keeping it framework-free means one implementation of
// the tolerance rules powers every view.
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  endOfWeek,
  isAfter,
  isBefore,
} from 'date-fns'
import type { ToleranceUnit } from '@/lib/types/database'

export type ComplianceTier = 'regulatory' | 'client'

// How a single task measures up against its tolerance window.
// - compliant: completed inside the window
// - early:     completed before the window opened
// - late:      completed after the window closed
// - overdue:   not completed and the window has already closed (counts as a miss)
// - pending:   not completed but the window has not closed yet (excluded from rate)
export type ComplianceStatus = 'compliant' | 'early' | 'late' | 'overdue' | 'pending'

export interface ToleranceConfig {
  value: number
  unit: ToleranceUnit
}

export interface ToleranceWindow {
  start: Date
  end: Date
}

// Minimal shape needed to classify a task. Both the admin and portal queries
// project their rows into this.
export interface KpiTask {
  id: string
  dueDate: string | Date | null
  completedAt: string | Date | null
  serviceTypeId: string
  serviceTypeName: string
  siteId: string
  siteName: string
  clientId: string | null
  clientName: string | null
  // Client KPI tier for this specific site/service. When a site/service has no
  // client override, this falls back to the regulatory standard (set upstream
  // in kpi-data), so the client tier always has a figure to report against.
  clientTolerance?: ToleranceConfig
}

function toDate(value: string | Date | null): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Compute the allowed completion window for a service due on `dueDate`.
 * - days:   due date ± N calendar days (0 = the exact due day).
 * - months: calendar-month based. 0 = anywhere within the due month; N = the
 *           due month plus N whole calendar months either side.
 */
export function getToleranceWindow(
  dueDate: Date,
  { value, unit }: ToleranceConfig,
): ToleranceWindow {
  const n = Math.max(0, value || 0)
  if (unit === 'months') {
    return {
      start: startOfMonth(subMonths(dueDate, n)),
      end: endOfMonth(addMonths(dueDate, n)),
    }
  }
  // days
  return {
    start: startOfDay(subDays(dueDate, n)),
    end: endOfDay(addDays(dueDate, n)),
  }
}

/**
 * Classify a task against a tolerance window. `today` is injectable for
 * deterministic testing and server/client consistency.
 */
export function classifyTask(
  task: KpiTask,
  tolerance: ToleranceConfig,
  today: Date = new Date(),
): ComplianceStatus {
  const due = toDate(task.dueDate)
  if (!due) return 'pending'
  const window = getToleranceWindow(due, tolerance)
  const completed = toDate(task.completedAt)

  if (completed) {
    if (isBefore(completed, window.start)) return 'early'
    if (isAfter(completed, window.end)) return 'late'
    return 'compliant'
  }
  // Not completed: a miss only once the window has fully closed.
  return isAfter(today, window.end) ? 'overdue' : 'pending'
}

// ─── Call "overdue" reporting ────────────────────────────────────────────────
// A pending call should NOT read as overdue the instant its due date slips: it
// stays "pending" until the client KPI target date (the far edge of its
// tolerance window) has actually expired. The one exception is weekly / monthly
// recurring PPM, which is always expected to be done within the due week / month
// — those get no tolerance extension.

export interface CallOverdueInput {
  /** The call's scheduled/due date. */
  scheduledDate: string | Date | null
  /** Call lifecycle status — only 'pending' calls can be overdue. */
  status: string
  /** Whether the underlying service type recurs on a PPM cadence. */
  isRecurring?: boolean | null
  /** Service cadence between visits (drives the weekly/monthly exception). */
  frequencyValue?: number | null
  frequencyUnit?: 'weeks' | 'months' | null
  /** Client KPI override for this site/service, when set. */
  clientToleranceValue?: number | null
  clientToleranceUnit?: ToleranceUnit | null
  /** Regulatory baseline the client tier falls back to when no override. */
  regulatoryToleranceValue?: number | null
  regulatoryToleranceUnit?: ToleranceUnit | null
}

/**
 * Decide whether a call currently reports as overdue.
 *
 * - Weekly recurring: overdue only once the due week has ended.
 * - Monthly recurring: overdue only once the due month has ended.
 * - Everything else: overdue only once the client KPI target date (the end of
 *   the client tolerance window, falling back to the regulatory standard) has
 *   passed. With no KPI configured this collapses to the plain "past due date"
 *   behaviour.
 */
export function isCallOverdue(
  input: CallOverdueInput,
  today: Date = new Date(),
): boolean {
  if (input.status !== 'pending') return false
  const due = toDate(input.scheduledDate)
  if (!due) return false

  // Weekly / monthly recurring PPM must be completed within the due period.
  if (input.isRecurring && (input.frequencyValue ?? 0) === 1) {
    if (input.frequencyUnit === 'weeks') {
      return isAfter(today, endOfWeek(due, { weekStartsOn: 1 }))
    }
    if (input.frequencyUnit === 'months') {
      return isAfter(today, endOfMonth(due))
    }
  }

  // Otherwise: hold until the client KPI target date expires. Prefer the
  // per-site/service client override, else the regulatory baseline.
  const tolerance: ToleranceConfig | null =
    input.clientToleranceValue != null
      ? { value: input.clientToleranceValue, unit: input.clientToleranceUnit ?? 'days' }
      : input.regulatoryToleranceValue != null
        ? {
            value: input.regulatoryToleranceValue,
            unit: input.regulatoryToleranceUnit ?? 'days',
          }
        : null

  // No KPI configured → fall back to the plain past-due-date behaviour.
  if (!tolerance) return isAfter(today, endOfDay(due))

  return isAfter(today, getToleranceWindow(due, tolerance).end)
}

export interface ComplianceCounts {
  compliant: number
  early: number
  late: number
  overdue: number
  pending: number
}

export interface ComplianceSummary extends ComplianceCounts {
  total: number
  // Tasks that count toward the rate (everything except pending).
  assessed: number
  // compliant / assessed, 0-100, rounded. null when nothing is assessed yet.
  rate: number | null
}

function emptyCounts(): ComplianceCounts {
  return { compliant: 0, early: 0, late: 0, overdue: 0, pending: 0 }
}

function summarize(counts: ComplianceCounts): ComplianceSummary {
  const total =
    counts.compliant + counts.early + counts.late + counts.overdue + counts.pending
  const assessed = total - counts.pending
  const rate = assessed > 0 ? Math.round((counts.compliant / assessed) * 100) : null
  return { ...counts, total, assessed, rate }
}

function addToCounts(counts: ComplianceCounts, status: ComplianceStatus) {
  counts[status] += 1
}

export interface GroupSummary {
  key: string
  label: string
  regulatory: ComplianceSummary
  client: ComplianceSummary
}

export interface KpiReport {
  overall: { regulatory: ComplianceSummary; client: ComplianceSummary }
  byServiceType: GroupSummary[]
  bySite: GroupSummary[]
}

// Tolerance lookups per service type, for each tier.
export type ToleranceLookup = Record<
  string,
  { regulatory: ToleranceConfig; client: ToleranceConfig }
>

/**
 * Build a full KPI report (overall + grouped by service type and site) for both
 * the regulatory and client tiers.
 */
export function buildKpiReport(
  tasks: KpiTask[],
  tolerances: ToleranceLookup,
  today: Date = new Date(),
): KpiReport {
  const overallReg = emptyCounts()
  const overallClient = emptyCounts()
  const svc = new Map<string, { label: string; reg: ComplianceCounts; client: ComplianceCounts }>()
  const site = new Map<string, { label: string; reg: ComplianceCounts; client: ComplianceCounts }>()

  for (const task of tasks) {
    const tol = tolerances[task.serviceTypeId]
    if (!tol) continue
    // Regulatory = the service type's legal baseline. Client = this site/service's
    // override when present, otherwise the regulatory standard as the default.
    const clientTol = task.clientTolerance ?? tol.regulatory
    const regStatus = classifyTask(task, tol.regulatory, today)
    const clientStatus = classifyTask(task, clientTol, today)

    addToCounts(overallReg, regStatus)
    addToCounts(overallClient, clientStatus)

    if (!svc.has(task.serviceTypeId)) {
      svc.set(task.serviceTypeId, {
        label: task.serviceTypeName,
        reg: emptyCounts(),
        client: emptyCounts(),
      })
    }
    const s = svc.get(task.serviceTypeId)!
    addToCounts(s.reg, regStatus)
    addToCounts(s.client, clientStatus)

    if (!site.has(task.siteId)) {
      site.set(task.siteId, {
        label: task.siteName,
        reg: emptyCounts(),
        client: emptyCounts(),
      })
    }
    const st = site.get(task.siteId)!
    addToCounts(st.reg, regStatus)
    addToCounts(st.client, clientStatus)
  }

  const toGroups = (
    m: Map<string, { label: string; reg: ComplianceCounts; client: ComplianceCounts }>,
  ): GroupSummary[] =>
    Array.from(m.entries())
      .map(([key, v]) => ({
        key,
        label: v.label,
        regulatory: summarize(v.reg),
        client: summarize(v.client),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

  return {
    overall: { regulatory: summarize(overallReg), client: summarize(overallClient) },
    byServiceType: toGroups(svc),
    bySite: toGroups(site),
  }
}

export const STATUS_LABELS: Record<ComplianceStatus, string> = {
  compliant: 'On time',
  early: 'Early',
  late: 'Late',
  overdue: 'Overdue',
  pending: 'Pending',
}

// Human-readable description of a tolerance config, e.g. "exact day", "±3 days",
// "within due month", "due month ±1".
export function describeTolerance({ value, unit }: ToleranceConfig): string {
  const n = Math.max(0, value || 0)
  if (unit === 'months') {
    return n === 0 ? 'Within due month' : `Due month ±${n}`
  }
  return n === 0 ? 'Exact day' : `±${n} day${n === 1 ? '' : 's'}`
}

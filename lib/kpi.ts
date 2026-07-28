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
// - excluded:  a miss (late/overdue) whose deadline-failed reason is flagged as
//              excusable, so it is removed from the calculation entirely (neither
//              helps nor hurts the rate).
export type ComplianceStatus =
  | 'compliant'
  | 'early'
  | 'late'
  | 'overdue'
  | 'pending'
  | 'excluded'

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
  // System type the call belongs to (e.g. Fire Alarm, Emergency Lighting).
  // Null when the call/service has no associated system type.
  systemTypeId: string | null
  systemTypeName: string | null
  siteId: string
  siteName: string
  clientId: string | null
  clientName: string | null
  // Client KPI tier for this specific site/service. When a site/service has no
  // client override, this falls back to the regulatory standard (set upstream
  // in kpi-data), so the client tier always has a figure to report against.
  clientTolerance?: ToleranceConfig
  // ── Deadline-failed review / exclusions (optional; used by the KPI review) ──
  // The call reference (PYR-…) for display in the review list.
  referenceNumber?: string | null
  // The logged reason a deadline was missed, if any.
  deadlineFailedReason?: string | null
  // When true, a late/overdue miss for this task is excused (reason is flagged
  // as excludable). Derived upstream from the configured exclusion list.
  deadlineExcluded?: boolean
  // Operational category, used for the monthly PPM vs emergency rate split.
  // - ppm:       recurring preventative maintenance calls.
  // - emergency: reactive emergency call types.
  // - other:     everything else (non-emergency reactive, planned one-offs).
  callCategory?: CallCategory
}

export type CallCategory = 'ppm' | 'emergency' | 'other'

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
 * The client KPI "complete by" / target date for a call — the last date on
 * which completion still counts as on-time. This is the single source of truth
 * for both the displayed complete-by date and the overdue decision.
 *
 * - Weekly recurring PPM: the end of the due week (must be done that week).
 * - Monthly recurring PPM: the end of the due month (must be done that month).
 * - Everything else: the visit/due date plus the tolerance period (client
 *   override, else the regulatory baseline), using exact date arithmetic — so a
 *   1-month tolerance on an 18 Jul visit yields 18 Aug. With no KPI configured
 *   this is just the due date itself.
 *
 * Returns `null` when there is no due date.
 */
export function getCallTargetDate(input: CallOverdueInput): Date | null {
  const due = toDate(input.scheduledDate)
  if (!due) return null

  // Weekly / monthly recurring PPM is tied to the due week/month, no extension.
  if (input.isRecurring && (input.frequencyValue ?? 0) === 1) {
    if (input.frequencyUnit === 'weeks') return endOfWeek(due, { weekStartsOn: 1 })
    if (input.frequencyUnit === 'months') return endOfMonth(due)
  }

  // Otherwise: due date + tolerance. Prefer the per-site/service client
  // override, else the regulatory baseline.
  const tolerance: ToleranceConfig | null =
    input.clientToleranceValue != null
      ? { value: input.clientToleranceValue, unit: input.clientToleranceUnit ?? 'days' }
      : input.regulatoryToleranceValue != null
        ? {
            value: input.regulatoryToleranceValue,
            unit: input.regulatoryToleranceUnit ?? 'days',
          }
        : null

  if (!tolerance) return due

  const n = Math.max(0, tolerance.value || 0)
  return tolerance.unit === 'months' ? addMonths(due, n) : addDays(due, n)
}

/**
 * Decide whether a call currently reports as overdue: it is pending and today
 * is past its client KPI target date (see getCallTargetDate). Weekly/monthly
 * recurring PPM therefore goes overdue once its due week/month ends, and
 * everything else once the tolerance-extended target date passes.
 */
export function isCallOverdue(
  input: CallOverdueInput,
  today: Date = new Date(),
): boolean {
  if (input.status !== 'pending') return false
  const target = getCallTargetDate(input)
  if (!target) return false
  return isAfter(today, endOfDay(target))
}

export interface ComplianceCounts {
  compliant: number
  early: number
  late: number
  overdue: number
  pending: number
  // Excused misses — removed from the rate entirely.
  excluded: number
}

export interface ComplianceSummary extends ComplianceCounts {
  total: number
  // Tasks that count toward the rate (everything except pending and excluded).
  assessed: number
  // compliant / assessed, 0-100, rounded. null when nothing is assessed yet.
  rate: number | null
}

function emptyCounts(): ComplianceCounts {
  return { compliant: 0, early: 0, late: 0, overdue: 0, pending: 0, excluded: 0 }
}

function summarize(counts: ComplianceCounts): ComplianceSummary {
  const total =
    counts.compliant +
    counts.early +
    counts.late +
    counts.overdue +
    counts.pending +
    counts.excluded
  // Pending (window still open) and excluded (excused misses) are both removed
  // from the assessed base, so an excused failure neither helps nor hurts.
  const assessed = total - counts.pending - counts.excluded
  const rate = assessed > 0 ? Math.round((counts.compliant / assessed) * 100) : null
  return { ...counts, total, assessed, rate }
}

function addToCounts(counts: ComplianceCounts, status: ComplianceStatus) {
  counts[status] += 1
}

// A miss (late/overdue) becomes "excluded" when the task carries an excusable
// deadline-failed reason. Non-misses are never altered.
function applyExclusion(status: ComplianceStatus, excluded: boolean | undefined): ComplianceStatus {
  if (excluded && (status === 'late' || status === 'overdue')) return 'excluded'
  return status
}

export interface GroupSummary {
  key: string
  label: string
  regulatory: ComplianceSummary
  client: ComplianceSummary
  // Whether the regulatory tier applies to this group. False for service types
  // marked as not subject to regulatory compliance (their regulatory figures
  // are omitted). Always true for site groups.
  regulatoryApplicable: boolean
}

export interface KpiReport {
  overall: { regulatory: ComplianceSummary; client: ComplianceSummary }
  byServiceType: GroupSummary[]
  bySite: GroupSummary[]
}

// Tolerance lookups per service type, for each tier. `regulatoryCompliance`
// (default true) marks whether the service type is subject to regulatory
// compliance — non-regulatory types are kept in the client tier but omitted
// from the regulatory tier.
export type ToleranceLookup = Record<
  string,
  {
    regulatory: ToleranceConfig
    client: ToleranceConfig
    regulatoryCompliance?: boolean
  }
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
  const svc = new Map<
    string,
    { label: string; reg: ComplianceCounts; client: ComplianceCounts; regApplicable: boolean }
  >()
  const site = new Map<
    string,
    { label: string; reg: ComplianceCounts; client: ComplianceCounts; regApplicable: boolean }
  >()

  for (const task of tasks) {
    const tol = tolerances[task.serviceTypeId]
    if (!tol) continue
    // Whether the regulatory tier applies to this service type. Non-regulatory
    // types are kept in the client tier but omitted from regulatory figures.
    const regApplicable = tol.regulatoryCompliance !== false
    // Regulatory = the service type's legal baseline. Client = this site/service's
    // override when present, otherwise the regulatory standard as the default.
    const clientTol = task.clientTolerance ?? tol.regulatory
    // Excusable misses are reclassified to "excluded" and drop out of the rate.
    const regStatus = applyExclusion(classifyTask(task, tol.regulatory, today), task.deadlineExcluded)
    const clientStatus = applyExclusion(classifyTask(task, clientTol, today), task.deadlineExcluded)

    if (regApplicable) addToCounts(overallReg, regStatus)
    addToCounts(overallClient, clientStatus)

    if (!svc.has(task.serviceTypeId)) {
      svc.set(task.serviceTypeId, {
        label: task.serviceTypeName,
        reg: emptyCounts(),
        client: emptyCounts(),
        regApplicable,
      })
    }
    const s = svc.get(task.serviceTypeId)!
    if (regApplicable) addToCounts(s.reg, regStatus)
    addToCounts(s.client, clientStatus)

    if (!site.has(task.siteId)) {
      site.set(task.siteId, {
        label: task.siteName,
        reg: emptyCounts(),
        client: emptyCounts(),
        regApplicable: true,
      })
    }
    const st = site.get(task.siteId)!
    // A site can host both regulatory and non-regulatory services; only the
    // regulatory ones contribute to its regulatory figure.
    if (regApplicable) addToCounts(st.reg, regStatus)
    addToCounts(st.client, clientStatus)
  }

  const toGroups = (
    m: Map<
      string,
      { label: string; reg: ComplianceCounts; client: ComplianceCounts; regApplicable: boolean }
    >,
  ): GroupSummary[] =>
    Array.from(m.entries())
      .map(([key, v]) => ({
        key,
        label: v.label,
        regulatory: summarize(v.reg),
        client: summarize(v.client),
        regulatoryApplicable: v.regApplicable,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

  return {
    overall: { regulatory: summarize(overallReg), client: summarize(overallClient) },
    byServiceType: toGroups(svc),
    bySite: toGroups(site),
  }
}

// ─── Month-by-month performance ─────────────────────────────────────────────

// A compliance summary for each tier — reused for the overall row and the
// per-category (PPM / emergency) sub-rates.
export interface TieredSummary {
  regulatory: ComplianceSummary
  client: ComplianceSummary
}

export interface MonthlyKpiRow {
  // Sortable "YYYY-MM" key derived from each task's due date.
  monthKey: string
  // Display label, e.g. "Aug 2026".
  label: string
  regulatory: ComplianceSummary
  client: ComplianceSummary
  // Per-category rates for the same month: PPM (recurring) and emergency
  // (reactive emergency) calls, each per tier.
  ppm: TieredSummary
  emergency: TieredSummary
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Build a month-by-month compliance breakdown (by task due date) for both
 * tiers, applying the same exclusion and non-regulatory rules as the main
 * report. Tasks with no due date are skipped. Returned oldest → newest.
 */
export function buildMonthlyKpi(
  tasks: KpiTask[],
  tolerances: ToleranceLookup,
  today: Date = new Date(),
): MonthlyKpiRow[] {
  interface MonthBucket {
    reg: ComplianceCounts
    client: ComplianceCounts
    ppmReg: ComplianceCounts
    ppmClient: ComplianceCounts
    emgReg: ComplianceCounts
    emgClient: ComplianceCounts
  }
  const emptyBucket = (): MonthBucket => ({
    reg: emptyCounts(),
    client: emptyCounts(),
    ppmReg: emptyCounts(),
    ppmClient: emptyCounts(),
    emgReg: emptyCounts(),
    emgClient: emptyCounts(),
  })
  const months = new Map<string, MonthBucket>()

  for (const task of tasks) {
    const tol = tolerances[task.serviceTypeId]
    if (!tol) continue
    const due = toDate(task.dueDate)
    if (!due) continue

    const monthKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`
    if (!months.has(monthKey)) months.set(monthKey, emptyBucket())
    const bucket = months.get(monthKey)!

    const regApplicable = tol.regulatoryCompliance !== false
    const clientTol = task.clientTolerance ?? tol.regulatory
    const regStatus = applyExclusion(classifyTask(task, tol.regulatory, today), task.deadlineExcluded)
    const clientStatus = applyExclusion(classifyTask(task, clientTol, today), task.deadlineExcluded)

    if (regApplicable) addToCounts(bucket.reg, regStatus)
    addToCounts(bucket.client, clientStatus)

    // Split the same statuses into the PPM / emergency sub-buckets.
    if (task.callCategory === 'ppm') {
      if (regApplicable) addToCounts(bucket.ppmReg, regStatus)
      addToCounts(bucket.ppmClient, clientStatus)
    } else if (task.callCategory === 'emergency') {
      if (regApplicable) addToCounts(bucket.emgReg, regStatus)
      addToCounts(bucket.emgClient, clientStatus)
    }
  }

  return Array.from(months.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, v]) => {
      const [year, month] = monthKey.split('-').map((n) => parseInt(n, 10))
      return {
        monthKey,
        label: `${MONTH_LABELS[month - 1]} ${year}`,
        regulatory: summarize(v.reg),
        client: summarize(v.client),
        ppm: { regulatory: summarize(v.ppmReg), client: summarize(v.ppmClient) },
        emergency: { regulatory: summarize(v.emgReg), client: summarize(v.emgClient) },
      }
    })
}

/**
 * Classify a single task for a given tier, applying the exclusion rule. Used by
 * the KPI deadline-failed review list to show each miss's status. Returns
 * `null` when the service type has no tolerance config.
 */
export function classifyKpiTask(
  task: KpiTask,
  tolerances: ToleranceLookup,
  tier: ComplianceTier,
  today: Date = new Date(),
): ComplianceStatus | null {
  const tol = tolerances[task.serviceTypeId]
  if (!tol) return null
  const cfg = tier === 'client' ? (task.clientTolerance ?? tol.regulatory) : tol.regulatory
  return applyExclusion(classifyTask(task, cfg, today), task.deadlineExcluded)
}

export const STATUS_LABELS: Record<ComplianceStatus, string> = {
  compliant: 'On time',
  early: 'Early',
  late: 'Late',
  overdue: 'Overdue',
  pending: 'Pending',
  excluded: 'Excused',
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

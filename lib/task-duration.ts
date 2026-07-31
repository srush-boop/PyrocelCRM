import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Learned time-on-site, derived on the fly from completed calls.
 *
 * There is no dedicated duration cache table (see plan). Instead we look at
 * historical completed tasks that have both `started_at` and `completed_at`,
 * and average the elapsed minutes, grouped by:
 *   - visit type   (most specific — e.g. "Fire alarm — annual")
 *   - service type (broader fallback — e.g. "Fire alarm maintenance")
 *
 * `expectedMinutesFor()` resolves the best available estimate for a call:
 *   visit-type avg → service-type avg → the call's booked_duration_minutes →
 *   a sensible default. `sampleSize` lets the UI show "avg of N" and only
 *   surface the hint once it is actually learned.
 */

// Guard rails: ignore obviously bad rows (clock skew / forgotten sign-offs).
const MIN_MINUTES = 5
const MAX_MINUTES = 12 * 60
const DEFAULT_MINUTES = 60
// The learned average is taken over the most recent N completed calls of the
// same type (visit type, then service type) — "precisely the previous 5 calls".
const LEARN_SAMPLE_LIMIT = 5

export interface DurationStat {
  avgMinutes: number
  sampleSize: number
}

export interface ExpectedDurations {
  byVisitType: Map<string, DurationStat>
  byServiceType: Map<string, DurationStat>
}

export interface ExpectedDuration {
  minutes: number
  // Whether this came from historical data (true) or a setup/booked/default
  // fallback (false).
  learned: boolean
  sampleSize: number
  // Provenance for tooltips/debug:
  //   'visit'/'service'    — learned average of recent completed calls
  //   'setup-site-service' — per site_service estimated_visit_minutes (most specific setup)
  //   'setup-visit'        — manual per-visit expected time (service setup)
  //   'setup-service'      — manual service-level expected time (service setup)
  //   'booked'/'default'   — per-call booked slot / generic fallback
  source:
    | 'visit'
    | 'service'
    | 'setup-site-service'
    | 'setup-visit'
    | 'setup-service'
    | 'booked'
    | 'default'
}

interface DurationRow {
  visit_type_id: string | null
  started_at: string | null
  completed_at: string | null
  site_service: { service_type_id: string | null } | null
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Build the learned-duration lookup from completed history. Reads up to a few
 * thousand recent completed calls, which is ample for stable averages without
 * scanning the whole table.
 */
export async function getExpectedDurations(
  supabase: SupabaseClient,
): Promise<ExpectedDurations> {
  const { data, error } = await supabase
    .from('tasks')
    .select('visit_type_id, started_at, completed_at, site_service:site_services(service_type_id)')
    .eq('status', 'completed')
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(4000)

  const byVisit = new Map<string, number[]>()
  const byService = new Map<string, number[]>()

  if (!error && data) {
    for (const row of data as unknown as DurationRow[]) {
      if (!row.started_at || !row.completed_at) continue
      const minutes =
        (new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 60000
      if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) continue

      // Rows arrive newest-first (ordered by completed_at desc), so once a key
      // has the most recent LEARN_SAMPLE_LIMIT samples we stop collecting for it
      // — the average reflects "precisely the previous 5 calls of the type".
      if (row.visit_type_id) {
        const arr = byVisit.get(row.visit_type_id) ?? []
        if (arr.length < LEARN_SAMPLE_LIMIT) {
          arr.push(minutes)
          byVisit.set(row.visit_type_id, arr)
        }
      }
      const serviceTypeId = row.site_service?.service_type_id
      if (serviceTypeId) {
        const arr = byService.get(serviceTypeId) ?? []
        if (arr.length < LEARN_SAMPLE_LIMIT) {
          arr.push(minutes)
          byService.set(serviceTypeId, arr)
        }
      }
    }
  }

  const toStat = (m: Map<string, number[]>): Map<string, DurationStat> => {
    const out = new Map<string, DurationStat>()
    for (const [key, values] of m) {
      out.set(key, { avgMinutes: Math.round(average(values)), sampleSize: values.length })
    }
    return out
  }

  return { byVisitType: toStat(byVisit), byServiceType: toStat(byService) }
}

/**
 * Resolve the expected on-site minutes for a specific call, preferring the most
 * specific learned figure and falling back gracefully.
 */
export function expectedMinutesFor(
  durations: ExpectedDurations,
  opts: {
    visitTypeId?: string | null
    serviceTypeId?: string | null
    siteServiceId?: string | null
    bookedDurationMinutes?: number | null
    // Manual "expected time to complete" fallbacks entered in service setup,
    // used when there isn't enough completed history to learn an average.
    setup?: SetupExpectedMinutes | null
  },
): ExpectedDuration {
  const { visitTypeId, serviceTypeId, siteServiceId, bookedDurationMinutes, setup } = opts

  // 1) Learned average of the most recent completed calls of the same type.
  if (visitTypeId) {
    const stat = durations.byVisitType.get(visitTypeId)
    if (stat && stat.sampleSize > 0) {
      return { minutes: stat.avgMinutes, learned: true, sampleSize: stat.sampleSize, source: 'visit' }
    }
  }
  if (serviceTypeId) {
    const stat = durations.byServiceType.get(serviceTypeId)
    if (stat && stat.sampleSize > 0) {
      return { minutes: stat.avgMinutes, learned: true, sampleSize: stat.sampleSize, source: 'service' }
    }
  }
  // 2) Manual setup fallback. Most specific first: the per site_service
  //    estimate set on the service itself, then per visit type, then
  //    service-level.
  if (setup) {
    if (siteServiceId) {
      const m = setup.bySiteService.get(siteServiceId)
      if (m && m > 0)
        return { minutes: m, learned: false, sampleSize: 0, source: 'setup-site-service' }
    }
    if (visitTypeId) {
      const m = setup.byVisitType.get(visitTypeId)
      if (m && m > 0) return { minutes: m, learned: false, sampleSize: 0, source: 'setup-visit' }
    }
    if (serviceTypeId) {
      const m = setup.byServiceType.get(serviceTypeId)
      if (m && m > 0) return { minutes: m, learned: false, sampleSize: 0, source: 'setup-service' }
    }
  }
  // 3) Per-call booked slot, then a generic default.
  if (bookedDurationMinutes && bookedDurationMinutes > 0) {
    return { minutes: bookedDurationMinutes, learned: false, sampleSize: 0, source: 'booked' }
  }
  return { minutes: DEFAULT_MINUTES, learned: false, sampleSize: 0, source: 'default' }
}

// Manual "expected time to complete" values entered in service setup, keyed by
// visit type and (as a broader fallback) service type.
export interface SetupExpectedMinutes {
  byVisitType: Map<string, number>
  byServiceType: Map<string, number>
  // Per site_service explicit estimate (site_services.estimated_visit_minutes).
  bySiteService: Map<string, number>
}

/**
 * Load the manual expected-time fallbacks from service setup:
 *   - service_visit_types.expected_minutes (per visit type)
 *   - service_types.expected_visit_minutes (service-level default)
 */
export async function getSetupExpectedMinutes(
  supabase: SupabaseClient,
): Promise<SetupExpectedMinutes> {
  const byVisitType = new Map<string, number>()
  const byServiceType = new Map<string, number>()
  const bySiteService = new Map<string, number>()

  const [visitRes, serviceRes, siteServiceRes] = await Promise.all([
    supabase
      .from('service_visit_types')
      .select('id, expected_minutes')
      .not('expected_minutes', 'is', null),
    supabase
      .from('service_types')
      .select('id, expected_visit_minutes')
      .not('expected_visit_minutes', 'is', null),
    supabase
      .from('site_services')
      .select('id, estimated_visit_minutes')
      .not('estimated_visit_minutes', 'is', null),
  ])

  for (const row of (visitRes.data ?? []) as { id: string; expected_minutes: number | null }[]) {
    if (row.expected_minutes && row.expected_minutes > 0) byVisitType.set(row.id, row.expected_minutes)
  }
  for (const row of (serviceRes.data ?? []) as {
    id: string
    expected_visit_minutes: number | null
  }[]) {
    if (row.expected_visit_minutes && row.expected_visit_minutes > 0)
      byServiceType.set(row.id, row.expected_visit_minutes)
  }
  for (const row of (siteServiceRes.data ?? []) as {
    id: string
    estimated_visit_minutes: number | null
  }[]) {
    if (row.estimated_visit_minutes && row.estimated_visit_minutes > 0)
      bySiteService.set(row.id, row.estimated_visit_minutes)
  }

  return { byVisitType, byServiceType, bySiteService }
}

// A ready-to-consume lookup for resolving per-call estimates (learned history +
// manual setup fallbacks).
export interface CallEstimateLookup {
  durations: ExpectedDurations
  setup: SetupExpectedMinutes
}

/** Build the full estimate lookup (learned averages + setup fallbacks). */
export async function getCallEstimateLookup(
  supabase: SupabaseClient,
): Promise<CallEstimateLookup> {
  const [durations, setup] = await Promise.all([
    getExpectedDurations(supabase),
    getSetupExpectedMinutes(supabase),
  ])
  return { durations, setup }
}

export interface CallEstimate {
  minutes: number
  learned: boolean
  sampleSize: number
}

/**
 * Resolve the "approximate time to complete" for a call from the lookup,
 * returning null when there is no grounded estimate (no learned history and no
 * manual setup value) so the UI can simply omit the hint.
 */
export function estimateForCall(
  lookup: CallEstimateLookup,
  opts: { visitTypeId?: string | null; serviceTypeId?: string | null; siteServiceId?: string | null },
): CallEstimate | null {
  const resolved = expectedMinutesFor(lookup.durations, {
    visitTypeId: opts.visitTypeId,
    serviceTypeId: opts.serviceTypeId,
    siteServiceId: opts.siteServiceId,
    setup: lookup.setup,
  })
  if (resolved.source === 'default' || resolved.source === 'booked') return null
  return { minutes: resolved.minutes, learned: resolved.learned, sampleSize: resolved.sampleSize }
}

/**
 * Build a taskId → estimate map for a list of tasks. Only tasks with a grounded
 * estimate are included. Each task must expose `visit_type_id` and
 * `service_type_id` (both real columns on `tasks`).
 */
export function buildTaskEstimates(
  lookup: CallEstimateLookup,
  tasks: {
    id: string
    visit_type_id?: string | null
    service_type_id?: string | null
    site_service_id?: string | null
  }[],
): Record<string, CallEstimate> {
  const out: Record<string, CallEstimate> = {}
  for (const t of tasks) {
    const est = estimateForCall(lookup, {
      visitTypeId: t.visit_type_id ?? null,
      serviceTypeId: t.service_type_id ?? null,
      siteServiceId: t.site_service_id ?? null,
    })
    if (est) out[t.id] = est
  }
  return out
}

/** Compact human label, e.g. "45 min" or "1 hr 30 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const hrs = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`
}

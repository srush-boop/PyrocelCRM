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
  // Whether this came from historical data (true) or a booked/default fallback.
  learned: boolean
  sampleSize: number
  // 'visit' | 'service' | 'booked' | 'default' — provenance for tooltips/debug.
  source: 'visit' | 'service' | 'booked' | 'default'
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

      if (row.visit_type_id) {
        const arr = byVisit.get(row.visit_type_id) ?? []
        arr.push(minutes)
        byVisit.set(row.visit_type_id, arr)
      }
      const serviceTypeId = row.site_service?.service_type_id
      if (serviceTypeId) {
        const arr = byService.get(serviceTypeId) ?? []
        arr.push(minutes)
        byService.set(serviceTypeId, arr)
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
    bookedDurationMinutes?: number | null
  },
): ExpectedDuration {
  const { visitTypeId, serviceTypeId, bookedDurationMinutes } = opts

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
  if (bookedDurationMinutes && bookedDurationMinutes > 0) {
    return { minutes: bookedDurationMinutes, learned: false, sampleSize: 0, source: 'booked' }
  }
  return { minutes: DEFAULT_MINUTES, learned: false, sampleSize: 0, source: 'default' }
}

/** Compact human label, e.g. "45 min" or "1 hr 30 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const hrs = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`
}

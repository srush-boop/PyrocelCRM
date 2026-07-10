import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types/database'
import { getGlobalConfig } from '@/lib/actions/global-config'

/**
 * Team-engagement / encouragement stats for an engineer.
 *
 * Shows an engineer ONLY their own standing within their department — never
 * anyone else's position or numbers. Two measures, both over a rolling 90-day
 * window:
 *   - Productivity: rank by number of completed calls.
 *   - First-time fix: % of completed calls that did not need a return visit,
 *     with the engineer's rank on that percentage.
 *
 * Ranking is scoped to the engineer's own department. Returns null when the
 * feature is disabled globally, the user has no department, or there isn't
 * enough data to rank.
 */

export const ENGAGEMENT_STATS_ENABLED_KEY = 'engagement_stats_enabled'

/** Rolling window (days) both measures are calculated over. */
const WINDOW_DAYS = 90

export interface EngineerEngagementStats {
  departmentName: string
  /** Whether the engineer is #1 on productivity in their department. */
  isLeader: boolean
  productivity: {
    /** 1-based position within the department. */
    position: number
    /** Number of engineers ranked (department size with activity considered). */
    total: number
    /** The engineer's own completed-call count in the window. */
    completed: number
  }
  firstTimeFix: {
    /** Whole-number percentage 0–100, or null when they have no qualifying calls. */
    ratingPct: number | null
    /** 1-based position on FTF %, or null when unranked. */
    position: number | null
    /** Number of engineers ranked on FTF. */
    total: number
    /** How many completed calls the rating is based on. */
    sampleSize: number
  }
}

/** Is the encouragement feature switched on? Defaults to ON when unset. */
export async function isEngagementStatsEnabled(): Promise<boolean> {
  const value = await getGlobalConfig<boolean>(ENGAGEMENT_STATS_ENABLED_KEY)
  // Default to enabled when the key has never been set.
  return value === null ? true : value === true
}

export async function getEngineerEngagementStats(
  supabase: SupabaseClient,
  profile: Profile,
): Promise<EngineerEngagementStats | null> {
  if (profile.role !== 'engineer') return null
  if (!profile.department_id) return null

  const enabled = await isEngagementStatsEnabled()
  if (!enabled) return null

  // Department name (for friendly copy).
  const { data: dept } = await supabase
    .from('departments')
    .select('name')
    .eq('id', profile.department_id)
    .single()
  if (!dept) return null

  // All engineers in the same department.
  const { data: peers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'engineer')
    .eq('department_id', profile.department_id)
  const engineerIds = (peers ?? []).map((p) => (p as { id: string }).id)
  if (engineerIds.length === 0) return null

  const windowStart = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Completed calls in the window for every engineer in the department. We keep
  // follow_up_to_id so we can (a) exclude return visits from the FTF base and
  // (b) later mark originals that spawned a follow-up as FTF failures.
  const { data: completed } = await supabase
    .from('tasks')
    .select('id, assigned_engineer_id, follow_up_to_id')
    .eq('status', 'completed')
    .in('assigned_engineer_id', engineerIds)
    .gte('completed_at', windowStart)

  type TaskRow = {
    id: string
    assigned_engineer_id: string | null
    follow_up_to_id: string | null
  }
  const rows = (completed ?? []) as TaskRow[]

  // Which of these completed originals later needed a follow-up? Those are the
  // first-time-fix failures.
  const originalIds = rows.filter((r) => !r.follow_up_to_id).map((r) => r.id)
  const failedOriginalIds = new Set<string>()
  if (originalIds.length > 0) {
    const { data: followUps } = await supabase
      .from('follow_up_requests')
      .select('original_task_id')
      .in('original_task_id', originalIds)
    for (const f of followUps ?? []) {
      const id = (f as { original_task_id: string }).original_task_id
      if (id) failedOriginalIds.add(id)
    }
  }

  // Tally per engineer.
  const completedCount = new Map<string, number>()
  const ftfBase = new Map<string, number>()
  const ftfSuccess = new Map<string, number>()
  for (const id of engineerIds) {
    completedCount.set(id, 0)
    ftfBase.set(id, 0)
    ftfSuccess.set(id, 0)
  }
  for (const r of rows) {
    const eng = r.assigned_engineer_id
    if (!eng || !completedCount.has(eng)) continue
    completedCount.set(eng, (completedCount.get(eng) ?? 0) + 1)
    // FTF base excludes follow-up visits themselves (only original visits count).
    if (!r.follow_up_to_id) {
      ftfBase.set(eng, (ftfBase.get(eng) ?? 0) + 1)
      if (!failedOriginalIds.has(r.id)) {
        ftfSuccess.set(eng, (ftfSuccess.get(eng) ?? 0) + 1)
      }
    }
  }

  // ── Productivity ranking (by completed count, desc) ────────────────────────
  const myCompleted = completedCount.get(profile.id) ?? 0
  const productivityRanked = engineerIds
    .map((id) => ({ id, count: completedCount.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
  // Standard competition ranking: same count → same position.
  let prodPosition = 1
  for (const entry of productivityRanked) {
    if (entry.id === profile.id) break
    if (entry.count > myCompleted) prodPosition++
  }
  const prodTotal = productivityRanked.length
  const isLeader = myCompleted > 0 && prodPosition === 1

  // ── First-time-fix ranking (by %, desc; only engineers with a base) ────────
  const myBase = ftfBase.get(profile.id) ?? 0
  const myRatingPct =
    myBase > 0 ? Math.round(((ftfSuccess.get(profile.id) ?? 0) / myBase) * 100) : null

  let ftfPosition: number | null = null
  let ftfTotal = 0
  const ftfRanked = engineerIds
    .filter((id) => (ftfBase.get(id) ?? 0) > 0)
    .map((id) => ({
      id,
      pct: (ftfSuccess.get(id) ?? 0) / (ftfBase.get(id) ?? 1),
    }))
    .sort((a, b) => b.pct - a.pct)
  ftfTotal = ftfRanked.length
  if (myBase > 0 && myRatingPct !== null) {
    const myPct = myRatingPct / 100
    let pos = 1
    for (const entry of ftfRanked) {
      if (entry.id === profile.id) continue
      if (entry.pct > myPct + 1e-9) pos++
    }
    ftfPosition = pos
  }

  return {
    departmentName: (dept as { name: string }).name,
    isLeader,
    productivity: {
      position: prodPosition,
      total: prodTotal,
      completed: myCompleted,
    },
    firstTimeFix: {
      ratingPct: myRatingPct,
      position: ftfPosition,
      total: ftfTotal,
      sampleSize: myBase,
    },
  }
}

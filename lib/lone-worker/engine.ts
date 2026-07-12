import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyUsers } from '@/lib/notifications'
import type { LoneWorkerPromptState, LoneWorkerSession } from './types'

/** Raw DB row shape for a session (snake_case). */
export interface SessionRow {
  id: string
  user_id: string
  shift_start: string
  shift_end: string
  checkin_interval_minutes: number
  amber_minutes: number
  red_minutes: number
  status: 'active' | 'finished'
  prompt_state: LoneWorkerPromptState
  last_checkin_at: string
  next_prompt_at: string
  amber_at: string
  red_at: string
  last_lat: number | null
  last_lng: number | null
  location_updated_at: string | null
  created_at: string
  finished_at: string | null
}

export function mapSession(r: SessionRow): LoneWorkerSession {
  return {
    id: r.id,
    userId: r.user_id,
    shiftStart: r.shift_start,
    shiftEnd: r.shift_end,
    checkinIntervalMinutes: r.checkin_interval_minutes,
    amberMinutes: r.amber_minutes,
    redMinutes: r.red_minutes,
    status: r.status,
    promptState: r.prompt_state,
    lastCheckinAt: r.last_checkin_at,
    nextPromptAt: r.next_prompt_at,
    amberAt: r.amber_at,
    redAt: r.red_at,
    lastLat: r.last_lat,
    lastLng: r.last_lng,
    locationUpdatedAt: r.location_updated_at,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  }
}

const MIN = 60_000

/** Compute the three cycle deadlines from a check-in instant + the session's own timings. */
export function computeDeadlines(
  lastCheckinAt: Date,
  checkinIntervalMinutes: number,
  amberMinutes: number,
  redMinutes: number,
): { nextPromptAt: string; amberAt: string; redAt: string } {
  const next = new Date(lastCheckinAt.getTime() + checkinIntervalMinutes * MIN)
  const amber = new Date(next.getTime() + amberMinutes * MIN)
  const red = new Date(amber.getTime() + redMinutes * MIN)
  return { nextPromptAt: next.toISOString(), amberAt: amber.toISOString(), redAt: red.toISOString() }
}

/** Best-available location for a user: pushed session loc → live share → home. */
async function resolveLocation(
  admin: SupabaseClient,
  session: SessionRow,
): Promise<{ lat: number | null; lng: number | null }> {
  if (session.last_lat != null && session.last_lng != null) {
    return { lat: session.last_lat, lng: session.last_lng }
  }
  const { data } = await admin
    .from('profiles')
    .select('location_lat, location_lng, home_latitude, home_longitude')
    .eq('id', session.user_id)
    .maybeSingle()
  const p = data as {
    location_lat: number | null
    location_lng: number | null
    home_latitude: number | null
    home_longitude: number | null
  } | null
  if (p?.location_lat != null && p?.location_lng != null) return { lat: p.location_lat, lng: p.location_lng }
  if (p?.home_latitude != null && p?.home_longitude != null) return { lat: p.home_latitude, lng: p.home_longitude }
  return { lat: null, lng: null }
}

async function monitorRecipients(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .or('role.in.(admin,office),can_manage_lone_worker.eq.true')
    .eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

async function userName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle()
  const p = data as { full_name: string | null; email: string | null } | null
  return p?.full_name || p?.email || 'A lone worker'
}

/**
 * Advance a single session's state machine to reflect `now`. Idempotent: safe to
 * call repeatedly (from the per-minute cron AND the worker's on-device ticker).
 * Escalations insert one active event per level and notify office/admin once.
 * Must be called with the SERVICE-ROLE (admin) client.
 */
export async function evaluateSessionRow(
  admin: SupabaseClient,
  session: SessionRow,
  now: Date = new Date(),
): Promise<{ changed: boolean; state: LoneWorkerPromptState }> {
  if (session.status !== 'active') return { changed: false, state: session.prompt_state }

  const t = now.getTime()
  const amberAt = new Date(session.amber_at).getTime()
  const redAt = new Date(session.red_at).getTime()
  const nextPromptAt = new Date(session.next_prompt_at).getTime()

  // Determine the target state for `now`.
  let target: LoneWorkerPromptState = session.prompt_state
  if (t >= redAt) target = 'red'
  else if (t >= amberAt) target = 'amber'
  else if (t >= nextPromptAt) target = 'prompting'
  else target = 'ok'

  // Never de-escalate here — only "I'm safe" / office contact resets a session.
  const order: Record<LoneWorkerPromptState, number> = { ok: 0, prompting: 1, amber: 2, red: 3 }
  if (order[target] <= order[session.prompt_state]) {
    return { changed: false, state: session.prompt_state }
  }

  // Escalating into amber or red: ensure a single active event + notify once.
  const escalate = async (level: 'amber' | 'red') => {
    const { data: existing } = await admin
      .from('lone_worker_events')
      .select('id')
      .eq('session_id', session.id)
      .eq('level', level)
      .is('acknowledged_at', null)
      .maybeSingle()

    const loc = await resolveLocation(admin, session)
    if (!existing) {
      await admin.from('lone_worker_events').insert({
        session_id: session.id,
        user_id: session.user_id,
        level,
        lat: loc.lat,
        lng: loc.lng,
      })
      const name = await userName(admin, session.user_id)
      const recipients = await monitorRecipients(admin)
      await notifyUsers({
        userIds: recipients,
        title: level === 'red' ? 'LONE WORKER EMERGENCY' : 'Lone worker warning',
        body:
          level === 'red'
            ? `${name} has NOT confirmed they are safe. Emergency escalation — respond now.`
            : `${name} has missed a safety check-in. Awaiting confirmation.`,
        url: '/dashboard/lone-worker',
        category: 'lone_worker',
        data: { kind: 'lone_worker_alert', level, userId: session.user_id, sessionId: session.id },
      })
    }
    return loc
  }

  let loc: { lat: number | null; lng: number | null } | null = null
  if (target === 'amber') loc = await escalate('amber')
  if (target === 'red') {
    // If jumping straight through amber (e.g. long cron gap), raise amber too.
    if (session.prompt_state === 'ok' || session.prompt_state === 'prompting') {
      await escalate('amber')
    }
    loc = await escalate('red')
  }

  const update: Record<string, unknown> = { prompt_state: target }
  if (loc && loc.lat != null && loc.lng != null) {
    update.last_lat = loc.lat
    update.last_lng = loc.lng
    update.location_updated_at = now.toISOString()
  }
  await admin.from('lone_worker_sessions').update(update).eq('id', session.id)

  return { changed: true, state: target }
}

/** Reset a session's cycle after a confirmed check-in (self or office contact). */
export async function resetSessionCycle(
  admin: SupabaseClient,
  session: SessionRow,
  opts: { via: 'self' | 'office'; by: string; now?: Date },
): Promise<void> {
  const now = opts.now ?? new Date()
  const { nextPromptAt, amberAt, redAt } = computeDeadlines(
    now,
    session.checkin_interval_minutes,
    session.amber_minutes,
    session.red_minutes,
  )

  // Acknowledge any active events for this session.
  await admin
    .from('lone_worker_events')
    .update({ acknowledged_at: now.toISOString(), acknowledged_by: opts.by, acknowledged_via: opts.via })
    .eq('session_id', session.id)
    .is('acknowledged_at', null)

  await admin
    .from('lone_worker_sessions')
    .update({
      prompt_state: 'ok',
      last_checkin_at: now.toISOString(),
      next_prompt_at: nextPromptAt,
      amber_at: amberAt,
      red_at: redAt,
    })
    .eq('id', session.id)
}

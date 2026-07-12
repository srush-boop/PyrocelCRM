'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getLoneWorkerConfig } from '@/lib/lone-worker/config'
import { evaluateEligibility } from '@/lib/lone-worker/eligibility'
import {
  computeDeadlines,
  evaluateSessionRow,
  mapSession,
  resetSessionCycle,
  type SessionRow,
} from '@/lib/lone-worker/engine'
import type {
  LoneWorkerEventLevel,
  LoneWorkerMonitorData,
  LoneWorkerMonitorRow,
  MyLoneWorkerState,
} from '@/lib/lone-worker/types'

const SESSION_COLS =
  'id, user_id, shift_start, shift_end, checkin_interval_minutes, amber_minutes, red_minutes, status, prompt_state, last_checkin_at, next_prompt_at, amber_at, red_at, last_lat, last_lng, location_updated_at, created_at, finished_at'

async function getCaller() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null as null | { role: string; can_manage_lone_worker: boolean } }
  const { data } = await supabase
    .from('profiles')
    .select('role, can_manage_lone_worker')
    .eq('id', user.id)
    .maybeSingle()
  return {
    supabase,
    user,
    profile: (data as { role: string; can_manage_lone_worker: boolean } | null),
  }
}

function isMonitor(role?: string | null): boolean {
  return role === 'admin' || role === 'office'
}

async function activeSessionFor(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return (data as SessionRow | null) ?? null
}

async function activeLevelFor(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<LoneWorkerEventLevel | null> {
  const { data } = await admin
    .from('lone_worker_events')
    .select('level')
    .eq('user_id', userId)
    .is('acknowledged_at', null)
  const levels = ((data ?? []) as { level: LoneWorkerEventLevel }[]).map((r) => r.level)
  if (levels.includes('red')) return 'red'
  if (levels.includes('amber')) return 'amber'
  return null
}

function hhmm(t: string | null): string | null {
  if (!t) return null
  return t.slice(0, 5)
}

/** Full client state for the prompt overlay + shift card. */
export async function getMyLoneWorkerState(): Promise<MyLoneWorkerState | null> {
  const { user } = await getCaller()
  if (!user) return null
  const admin = createAdminClient()

  const { timings, absenceTypes } = await getLoneWorkerConfig(admin)
  const elig = await evaluateEligibility(admin, user.id, { absenceTypes })

  const { data: prof } = await admin
    .from('profiles')
    .select('work_start_time, work_end_time')
    .eq('id', user.id)
    .maybeSingle()
  const p = prof as { work_start_time: string | null; work_end_time: string | null } | null

  let session = await activeSessionFor(admin, user.id)
  // Advance state so the returned snapshot is current even between cron ticks.
  if (session) {
    await evaluateSessionRow(admin, session)
    session = await activeSessionFor(admin, user.id)
  }
  const activeLevel = await activeLevelFor(admin, user.id)

  return {
    eligible: elig.eligible,
    ineligibleReason: elig.reason,
    timings,
    defaultShiftStart: hhmm(p?.work_start_time ?? null),
    defaultShiftEnd: hhmm(p?.work_end_time ?? null),
    session: session ? mapSession(session) : null,
    activeLevel,
    serverNow: Date.now(),
  }
}

export async function startShift(input: {
  shiftStart: string
  shiftEnd: string
  checkinInterval?: number
}): Promise<{ error: string | null }> {
  const { user } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { timings, absenceTypes } = await getLoneWorkerConfig(admin)
  const elig = await evaluateEligibility(admin, user.id, { absenceTypes })
  if (!elig.eligible) return { error: elig.reason ?? 'Not eligible' }

  const existing = await activeSessionFor(admin, user.id)
  if (existing) return { error: 'You already have an active shift' }

  const interval = Math.min(
    240,
    Math.max(5, Math.round(input.checkinInterval ?? timings.checkinMinutes)),
  )
  const now = new Date()
  const { nextPromptAt, amberAt, redAt } = computeDeadlines(
    now,
    interval,
    timings.amberMinutes,
    timings.redMinutes,
  )

  const { error } = await admin.from('lone_worker_sessions').insert({
    user_id: user.id,
    shift_start: input.shiftStart,
    shift_end: input.shiftEnd,
    checkin_interval_minutes: interval,
    amber_minutes: timings.amberMinutes,
    red_minutes: timings.redMinutes,
    status: 'active',
    prompt_state: 'ok',
    last_checkin_at: now.toISOString(),
    next_prompt_at: nextPromptAt,
    amber_at: amberAt,
    red_at: redAt,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { error: null }
}

export async function finishShift(): Promise<{ error: string | null }> {
  const { user } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()
  const session = await activeSessionFor(admin, user.id)
  if (!session) return { error: null }

  const now = new Date().toISOString()
  await admin
    .from('lone_worker_events')
    .update({ acknowledged_at: now, acknowledged_by: user.id, acknowledged_via: 'self' })
    .eq('session_id', session.id)
    .is('acknowledged_at', null)
  await admin
    .from('lone_worker_sessions')
    .update({ status: 'finished', finished_at: now, prompt_state: 'ok' })
    .eq('id', session.id)
  revalidatePath('/dashboard')
  return { error: null }
}

export async function confirmSafe(): Promise<{ error: string | null }> {
  const { user } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()
  const session = await activeSessionFor(admin, user.id)
  if (!session) return { error: 'No active shift' }
  await resetSessionCycle(admin, session, { via: 'self', by: user.id })
  return { error: null }
}

export async function setCheckinInterval(minutes: number): Promise<{ error: string | null }> {
  const { user } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()
  const session = await activeSessionFor(admin, user.id)
  if (!session) return { error: 'No active shift' }

  const interval = Math.min(240, Math.max(5, Math.round(minutes)))
  // Recompute deadlines from the last check-in so a shorter interval bites now.
  const { nextPromptAt, amberAt, redAt } = computeDeadlines(
    new Date(session.last_checkin_at),
    interval,
    session.amber_minutes,
    session.red_minutes,
  )
  await admin
    .from('lone_worker_sessions')
    .update({
      checkin_interval_minutes: interval,
      next_prompt_at: nextPromptAt,
      amber_at: amberAt,
      red_at: redAt,
    })
    .eq('id', session.id)
  return { error: null }
}

export async function pushLocation(lat: number, lng: number): Promise<{ error: string | null }> {
  const { user } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Invalid location' }
  const admin = createAdminClient()
  const session = await activeSessionFor(admin, user.id)
  if (!session) return { error: null }
  await admin
    .from('lone_worker_sessions')
    .update({ last_lat: lat, last_lng: lng, location_updated_at: new Date().toISOString() })
    .eq('id', session.id)
  return { error: null }
}

/** Idempotent transition for the current user's session (on-device ticker). */
export async function evaluateMySession(): Promise<{ state: string | null }> {
  const { user } = await getCaller()
  if (!user) return { state: null }
  const admin = createAdminClient()
  const session = await activeSessionFor(admin, user.id)
  if (!session) return { state: null }
  const res = await evaluateSessionRow(admin, session)
  return { state: res.state }
}

/** Big-screen board + tile counts (office/admin only). Also advances all sessions. */
export async function getMonitorData(): Promise<LoneWorkerMonitorData> {
  const empty: LoneWorkerMonitorData = { rows: [], warningCount: 0, emergencyCount: 0, serverNow: Date.now() }
  const { profile } = await getCaller()
  if (!isMonitor(profile?.role)) return empty
  const admin = createAdminClient()

  const { data: sessRows } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('status', 'active')
  const sessions = (sessRows ?? []) as SessionRow[]

  // Advance each active session so the board is current between cron ticks.
  const now = new Date()
  await Promise.all(sessions.map((s) => evaluateSessionRow(admin, s, now)))

  // Re-read after evaluation.
  const { data: freshRows } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('status', 'active')
  const fresh = (freshRows ?? []) as SessionRow[]
  if (fresh.length === 0) return { ...empty, serverNow: Date.now() }

  const userIds = fresh.map((s) => s.user_id)
  const [{ data: profs }, { data: events }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', userIds),
    admin
      .from('lone_worker_events')
      .select('id, session_id, user_id, level, raised_at, lat, lng')
      .is('acknowledged_at', null),
  ])
  const nameById = new Map(
    ((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.full_name || p.email || 'Lone worker',
    ]),
  )
  type Ev = { id: string; session_id: string; user_id: string; level: LoneWorkerEventLevel; raised_at: string; lat: number | null; lng: number | null }
  const eventsBySession = new Map<string, Ev[]>()
  for (const e of (events ?? []) as Ev[]) {
    const list = eventsBySession.get(e.session_id) ?? []
    list.push(e)
    eventsBySession.set(e.session_id, list)
  }

  let warningCount = 0
  let emergencyCount = 0
  const rows: LoneWorkerMonitorRow[] = fresh.map((s) => {
    const evs = eventsBySession.get(s.id) ?? []
    const red = evs.find((e) => e.level === 'red')
    const amber = evs.find((e) => e.level === 'amber')
    const activeLevel: LoneWorkerEventLevel | null = red ? 'red' : amber ? 'amber' : null
    if (activeLevel === 'red') emergencyCount++
    else if (activeLevel === 'amber') warningCount++
    const activeEvent = red ?? amber ?? null
    return {
      sessionId: s.id,
      userId: s.user_id,
      userName: nameById.get(s.user_id) ?? 'Lone worker',
      shiftStart: s.shift_start,
      shiftEnd: s.shift_end,
      promptState: s.prompt_state,
      lastCheckinAt: s.last_checkin_at,
      nextPromptAt: s.next_prompt_at,
      amberAt: s.amber_at,
      redAt: s.red_at,
      activeLevel,
      activeEventId: activeEvent?.id ?? null,
      activeSince: activeEvent?.raised_at ?? null,
      lat: activeEvent?.lat ?? s.last_lat,
      lng: activeEvent?.lng ?? s.last_lng,
      locationUpdatedAt: s.location_updated_at,
    }
  })

  // Sort most severe first, then soonest deadline.
  const sev: Record<string, number> = { red: 0, amber: 1, ok: 2 }
  rows.sort((a, b) => {
    const sa = a.activeLevel ?? 'ok'
    const sb = b.activeLevel ?? 'ok'
    if (sev[sa] !== sev[sb]) return sev[sa] - sev[sb]
    return new Date(a.nextPromptAt).getTime() - new Date(b.nextPromptAt).getTime()
  })

  return { rows, warningCount, emergencyCount, serverNow: Date.now() }
}

export async function officeMadeContact(eventId: string): Promise<{ error: string | null }> {
  const { user, profile } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  if (!isMonitor(profile?.role)) return { error: 'Not authorised' }
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('lone_worker_events')
    .select('id, session_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return { error: 'Event not found' }

  const { data: sess } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('id', (ev as { session_id: string }).session_id)
    .maybeSingle()
  if (!sess) return { error: 'Session not found' }

  await resetSessionCycle(admin, sess as SessionRow, { via: 'office', by: user.id })
  revalidatePath('/dashboard/lone-worker')
  revalidatePath('/dashboard')
  return { error: null }
}

/** Disable a user's lone-worker feature for a period (admins + nominated only). */
export async function disableUserLoneWorker(
  userId: string,
  until: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { user, profile } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const canManage = profile?.role === 'admin' || profile?.can_manage_lone_worker === true
  if (!canManage) return { error: 'Not authorised' }
  const admin = createAdminClient()

  const { error } = await admin
    .from('profiles')
    .update({
      lone_worker_disabled_until: until,
      lone_worker_disabled_reason: reason || null,
      lone_worker_disabled_by: user.id,
    })
    .eq('id', userId)
  if (error) return { error: error.message }

  // Immediately clear any active session + warning/emergency states.
  const now = new Date().toISOString()
  const session = await activeSessionFor(admin, userId)
  if (session) {
    await admin
      .from('lone_worker_events')
      .update({ acknowledged_at: now, acknowledged_by: user.id, acknowledged_via: 'office' })
      .eq('session_id', session.id)
      .is('acknowledged_at', null)
    await admin
      .from('lone_worker_sessions')
      .update({ status: 'finished', finished_at: now, prompt_state: 'ok' })
      .eq('id', session.id)
  }
  revalidatePath('/dashboard/lone-worker')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function enableUserLoneWorker(userId: string): Promise<{ error: string | null }> {
  const { user, profile } = await getCaller()
  if (!user) return { error: 'Not signed in' }
  const canManage = profile?.role === 'admin' || profile?.can_manage_lone_worker === true
  if (!canManage) return { error: 'Not authorised' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      lone_worker_disabled_until: null,
      lone_worker_disabled_reason: null,
      lone_worker_disabled_by: null,
    })
    .eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/lone-worker')
  return { error: null }
}

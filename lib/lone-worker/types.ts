export type LoneWorkerPromptState = 'ok' | 'prompting' | 'amber' | 'red'
export type LoneWorkerEventLevel = 'amber' | 'red'
export type LoneWorkerAckVia = 'self' | 'office'

/**
 * Format a stored shift bound for display as HH:MM. Shift start/end are stored
 * as full ISO timestamps; this renders just the time. Falls back to the raw
 * value if it isn't parseable (e.g. a legacy "HH:MM" string).
 */
export function formatShiftTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export interface LoneWorkerTimings {
  /** Minutes between check-in prompts. */
  checkinMinutes: number
  /** Minutes the worker has to respond before an amber warning is raised. */
  amberMinutes: number
  /** Minutes after amber before a red emergency is raised. */
  redMinutes: number
  /** Whether the alert sound plays when the prompt/escalation appears. */
  soundEnabled: boolean
}

export interface LoneWorkerSession {
  id: string
  userId: string
  shiftStart: string
  shiftEnd: string
  checkinIntervalMinutes: number
  amberMinutes: number
  redMinutes: number
  status: 'active' | 'finished'
  promptState: LoneWorkerPromptState
  lastCheckinAt: string
  nextPromptAt: string
  amberAt: string
  redAt: string
  lastLat: number | null
  lastLng: number | null
  locationUpdatedAt: string | null
  createdAt: string
  finishedAt: string | null
}

/** Client-facing state for the current user (the prompt overlay + shift card). */
export interface MyLoneWorkerState {
  /** Role has lone worker on AND user not disabled/absent — may start a shift. */
  eligible: boolean
  /** Reason the feature is unavailable right now (disabled / on leave / role off). */
  ineligibleReason: string | null
  timings: LoneWorkerTimings
  /** Default shift times from the user's work hours (HH:mm), if configured. */
  defaultShiftStart: string | null
  defaultShiftEnd: string | null
  session: LoneWorkerSession | null
  /** Active (unacknowledged) event for this user, if any. */
  activeLevel: LoneWorkerEventLevel | null
  /** Server clock at time of read (ms epoch) so the client can de-drift. */
  serverNow: number
}

/** A monitored user row for the big-screen board + tiles. */
export interface LoneWorkerMonitorRow {
  sessionId: string
  userId: string
  userName: string
  shiftStart: string
  shiftEnd: string
  promptState: LoneWorkerPromptState
  lastCheckinAt: string
  nextPromptAt: string
  amberAt: string
  redAt: string
  /** Highest active level for this user right now (drives amber/red styling). */
  activeLevel: LoneWorkerEventLevel | null
  /** The active event id (for "Made contact"), if any. */
  activeEventId: string | null
  activeSince: string | null
  lat: number | null
  lng: number | null
  locationUpdatedAt: string | null
}

export interface LoneWorkerMonitorData {
  rows: LoneWorkerMonitorRow[]
  warningCount: number
  emergencyCount: number
  serverNow: number
}

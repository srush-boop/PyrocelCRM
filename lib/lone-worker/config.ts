import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoneWorkerTimings } from './types'

export const LONE_WORKER_DEFAULTS: LoneWorkerTimings = {
  checkinMinutes: 60,
  amberMinutes: 5,
  redMinutes: 5,
  soundEnabled: true,
}

export const DEFAULT_ABSENCE_TYPES = [
  'Annual Leave',
  'Sickness',
  'Authorised Leave',
  'Bank Holiday',
]

const CONFIG_KEYS = [
  'lone_worker_checkin_minutes',
  'lone_worker_amber_minutes',
  'lone_worker_red_minutes',
  'lone_worker_alert_sound_enabled',
  'lone_worker_absence_types',
]

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

/**
 * Read the configured lone-worker timings + absence type list. Works with any
 * Supabase client (RLS user client, admin client). Falls back to sane defaults
 * for missing keys so the feature is never left without timings.
 */
export async function getLoneWorkerConfig(
  supabase: SupabaseClient,
): Promise<{ timings: LoneWorkerTimings; absenceTypes: string[] }> {
  const { data } = await supabase
    .from('global_config')
    .select('key, value')
    .in('key', CONFIG_KEYS)

  const map = new Map<string, unknown>()
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    map.set(row.key, row.value)
  }

  const rawAbsence = map.get('lone_worker_absence_types')
  const absenceTypes = Array.isArray(rawAbsence)
    ? (rawAbsence as string[]).filter((s) => typeof s === 'string')
    : DEFAULT_ABSENCE_TYPES

  return {
    timings: {
      checkinMinutes: toNumber(map.get('lone_worker_checkin_minutes'), LONE_WORKER_DEFAULTS.checkinMinutes),
      amberMinutes: toNumber(map.get('lone_worker_amber_minutes'), LONE_WORKER_DEFAULTS.amberMinutes),
      redMinutes: toNumber(map.get('lone_worker_red_minutes'), LONE_WORKER_DEFAULTS.redMinutes),
      soundEnabled: map.get('lone_worker_alert_sound_enabled') !== false,
    },
    absenceTypes: absenceTypes.length > 0 ? absenceTypes : DEFAULT_ABSENCE_TYPES,
  }
}

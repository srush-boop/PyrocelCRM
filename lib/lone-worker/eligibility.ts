import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ABSENCE_TYPES } from './config'

export interface EligibilityResult {
  eligible: boolean
  /** Human reason when not eligible (null when eligible). */
  reason: string | null
  /** Convenience flags for callers. */
  roleEnabled: boolean
  disabled: boolean
  onAbsence: boolean
}

interface EligibilityInput {
  /** Absence calendar-entry type names that suppress the feature. */
  absenceTypes?: string[]
  /** Evaluation time (defaults to now). */
  at?: Date
}

/**
 * Decide whether a user's lone-worker feature is active right now.
 * Rules: the user's ROLE must have lone worker enabled, the user must not be
 * manually disabled (lone_worker_disabled_until in the future), and there must
 * be no diarised absence (Annual Leave / Sickness / etc.) covering `at`.
 */
export async function evaluateEligibility(
  supabase: SupabaseClient,
  userId: string,
  input: EligibilityInput = {},
): Promise<EligibilityResult> {
  const at = input.at ?? new Date()
  const absenceTypes = input.absenceTypes ?? DEFAULT_ABSENCE_TYPES

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'lone_worker_disabled_until, role:roles!profiles_role_id_fkey(lone_worker_enabled)',
    )
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return { eligible: false, reason: 'Profile not found', roleEnabled: false, disabled: false, onAbsence: false }
  }

  const roleRel = (profile as { role: unknown }).role
  const role = Array.isArray(roleRel) ? roleRel[0] : roleRel
  const roleEnabled = Boolean((role as { lone_worker_enabled?: boolean } | null)?.lone_worker_enabled)

  if (!roleEnabled) {
    return {
      eligible: false,
      reason: 'Lone worker monitoring is not enabled for your role',
      roleEnabled: false,
      disabled: false,
      onAbsence: false,
    }
  }

  const disabledUntilRaw = (profile as { lone_worker_disabled_until: string | null }).lone_worker_disabled_until
  const disabled = disabledUntilRaw != null && new Date(disabledUntilRaw).getTime() > at.getTime()
  if (disabled) {
    return {
      eligible: false,
      reason: 'Lone worker monitoring is temporarily disabled for you',
      roleEnabled: true,
      disabled: true,
      onAbsence: false,
    }
  }

  // Diarised absence covering `at`.
  const atIso = at.toISOString()
  const { data: absences } = await supabase
    .from('calendar_entries')
    .select('id, entry_type:calendar_entry_types!inner(name)')
    .eq('user_id', userId)
    .is('cancelled_at', null)
    .lte('start_at', atIso)
    .gte('end_at', atIso)

  const onAbsence = (absences ?? []).some((row) => {
    const rel = (row as { entry_type: unknown }).entry_type
    const et = Array.isArray(rel) ? rel[0] : rel
    const name = (et as { name?: string } | null)?.name
    return name != null && absenceTypes.includes(name)
  })

  if (onAbsence) {
    return {
      eligible: false,
      reason: 'You are marked as on leave/absence today',
      roleEnabled: true,
      disabled: false,
      onAbsence: true,
    }
  }

  return { eligible: true, reason: null, roleEnabled: true, disabled: false, onAbsence: false }
}

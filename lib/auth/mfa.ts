import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/types/database'

/**
 * Roles that MUST use multi-factor authentication. These are the privileged,
 * office-based accounts that can see/modify client, financial and admin data.
 * Field roles (engineer/subcontractor) and read-only clients are exempt by
 * default so we don't force TOTP onto shared/most-mobile devices, but they may
 * still opt in from Settings → Security.
 */
export const MFA_REQUIRED_ROLES: readonly UserRole[] = ['admin', 'office'] as const

export function mfaRequiredForRole(role: UserRole | null | undefined): boolean {
  return role != null && MFA_REQUIRED_ROLES.includes(role)
}

export interface AalState {
  /** The assurance level the current session actually has. */
  currentLevel: 'aal1' | 'aal2' | null
  /** The assurance level the user COULD reach (aal2 if they have a factor). */
  nextLevel: 'aal1' | 'aal2' | null
  /** True when the user has at least one fully verified TOTP factor. */
  hasVerifiedFactor: boolean
  /** True when the session is authenticated but must still pass a TOTP challenge. */
  needsChallenge: boolean
}

/**
 * Reads the Authenticator Assurance Level + factor state for the signed-in
 * user. Works with any Supabase client (browser or server).
 *
 * - needsChallenge: the user has a verified factor and is currently only at
 *   aal1, so they must complete a TOTP challenge to reach aal2.
 * - hasVerifiedFactor: whether they have completed enrolment at all (used to
 *   decide whether an MFA-required role should be pushed into setup).
 */
export async function getAalState(supabase: SupabaseClient): Promise<AalState> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: factorsData } = await supabase.auth.mfa.listFactors()

  const verifiedTotp = (factorsData?.totp ?? []).filter((f) => f.status === 'verified')
  const hasVerifiedFactor = verifiedTotp.length > 0

  const currentLevel = (aal?.currentLevel as AalState['currentLevel']) ?? null
  const nextLevel = (aal?.nextLevel as AalState['nextLevel']) ?? null

  return {
    currentLevel,
    nextLevel,
    hasVerifiedFactor,
    needsChallenge:
      hasVerifiedFactor && currentLevel === 'aal1' && nextLevel === 'aal2',
  }
}

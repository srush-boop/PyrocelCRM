import 'server-only'
import { getAuthContext } from '@/lib/auth'
import type { Profile } from '@/lib/types/database'

/**
 * Labour-cost visibility is a sensitive permission: only the owner
 * (steve.rush@pyrocel.co.uk) may grant it to other users, and only granted
 * users (plus Steve himself) may see cost / profit / margin figures.
 */
export const LABOUR_COST_OWNER_EMAIL = 'steve.rush@pyrocel.co.uk'

/** True only for the single owner account allowed to grant the permission. */
export function canGrantLabourCosts(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === LABOUR_COST_OWNER_EMAIL
}

/** Alias kept for readability at call sites that deal with cost visibility. */
export type LabourProfile = Profile

/**
 * Whether a profile may VIEW labour costs. The owner is always allowed; everyone
 * else needs the explicit `can_view_labour_costs` flag.
 */
export function profileCanViewLabourCosts(profile: LabourProfile | null | undefined): boolean {
  if (!profile) return false
  if (canGrantLabourCosts(profile.email)) return true
  return profile.can_view_labour_costs === true
}

/**
 * Resolve the current viewer and whether they may see labour costs. Never
 * throws — callers decide whether to hide UI or redirect. Returns the shared
 * cached supabase client + profile from `getAuthContext`.
 */
export async function getLabourCostAccess() {
  const { supabase, user, profile } = await getAuthContext()
  const p = profile as LabourProfile | null
  return {
    supabase,
    user,
    profile: p,
    canView: profileCanViewLabourCosts(p),
    canGrant: canGrantLabourCosts(p?.email),
  }
}

/**
 * Guard for cost endpoints/pages: returns the access context when the caller may
 * view labour costs, otherwise null so the caller can redirect or 404. Keeping
 * cost data server-side behind this check is the module's security boundary
 * (there are no RLS policies specific to the new cost columns).
 */
export async function requireLabourCostViewer() {
  const access = await getLabourCostAccess()
  if (!access.user || !access.canView) return null
  return access
}

import 'server-only'
import { getAuthContext } from '@/lib/auth'
import type { Profile } from '@/lib/types/database'
import { LABOUR_COST_OWNER_EMAIL, canGrantLabourCosts } from '@/lib/auth/labour-costs'

/**
 * The admin Query Builder and User Cost Calculator are powerful, destructive
 * tools (arbitrary SQL writes at source; bulk overwrite of user cost rates).
 * Access is therefore an owner-granted, per-user permission:
 *   - only the owner (steve.rush@pyrocel.co.uk) may grant it, and
 *   - only granted users (plus the owner) may open the tools.
 *
 * We reuse the labour-cost owner constant so there is a single source of truth
 * for "who is the owner".
 */
export { LABOUR_COST_OWNER_EMAIL as QUERY_TOOLS_OWNER_EMAIL }

/** True only for the owner account allowed to grant the permission. */
export function canGrantQueryTools(email: string | null | undefined): boolean {
  return canGrantLabourCosts(email)
}

/**
 * Whether a profile may USE the query tools. The owner is always allowed;
 * everyone else needs the explicit `can_use_query_tools` flag.
 */
export function profileCanUseQueryTools(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  if (canGrantQueryTools(profile.email)) return true
  return profile.can_use_query_tools === true
}

/** Resolve the current viewer and whether they may use the query tools. */
export async function getQueryToolsAccess() {
  const { supabase, user, profile } = await getAuthContext()
  const p = profile as Profile | null
  return {
    supabase,
    user,
    profile: p,
    canUse: profileCanUseQueryTools(p),
    canGrant: canGrantQueryTools(p?.email),
  }
}

/**
 * Guard for query-tool endpoints/pages: returns the access context when the
 * caller may use the tools, otherwise null so the caller can redirect or 404.
 * This server-side check is the security boundary for these tools.
 */
export async function requireQueryToolsUser() {
  const access = await getQueryToolsAccess()
  if (!access.user || !access.canUse) return null
  return access
}

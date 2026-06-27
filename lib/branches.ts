import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Branch, Profile } from '@/lib/types/database'
import { ALL_BRANCHES } from '@/lib/branch-constants'

// Re-exported for server callers that already import from this module.
export { ALL_BRANCHES }

// Roles that are allowed to switch the branch filter to any branch (or "All").
// Engineers and clients are locked to their own assigned branch.
const CAN_SWITCH_ROLES = ['admin', 'office'] as const

export interface BranchScope {
  // Whether the current user may change which branch they're viewing.
  canSwitch: boolean
  // All branches (for the filter dropdown). Empty for users who can't switch.
  branches: Branch[]
  // The branch the current view should be scoped to. `null` means no filtering
  // (i.e. show all branches) — only possible for users who can switch.
  activeBranchId: string | null
  // The user's own assigned branch, if any.
  userBranchId: string | null
}

/**
 * Resolves the branch a given view should be scoped to.
 *
 * - admin/office: default to their own branch (if set), but may pass a
 *   `branch` search param to switch to another branch or `all`.
 * - everyone else: always locked to their own assigned branch. If they have no
 *   branch they simply see everything (no branch to scope by).
 *
 * `selected` is the raw value of the `branch` search param (if present).
 */
export async function getBranchScope(
  profile: Profile,
  selected?: string | null,
): Promise<BranchScope> {
  const canSwitch = CAN_SWITCH_ROLES.includes(profile.role as 'admin' | 'office')
  const userBranchId = profile.branch_id ?? null

  if (!canSwitch) {
    // Locked to their own branch (or unscoped if they have none).
    return { canSwitch: false, branches: [], activeBranchId: userBranchId, userBranchId }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('branches')
    .select('*')
    .order('name', { ascending: true })
  const branches = (data as Branch[]) ?? []

  let activeBranchId: string | null
  if (selected === ALL_BRANCHES) {
    activeBranchId = null
  } else if (selected && branches.some((b) => b.id === selected)) {
    activeBranchId = selected
  } else {
    // No explicit selection: default to the user's own branch, else all.
    activeBranchId = userBranchId
  }

  return { canSwitch: true, branches, activeBranchId, userBranchId }
}

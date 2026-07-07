import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Job } from '@/lib/types/database'

// Joined shape used by the jobs list + dashboard. Owner uses an explicit FK
// hint because `jobs` has several FKs to `profiles`.
const JOB_SELECT =
  '*, client:clients(id, name), site:sites(id, name, branch_id, status), branch:branches(id, name), owner:profiles!jobs_owner_id_fkey(id, full_name), department:departments(id, name)'

/**
 * Load jobs (newest first), optionally scoped to a branch. Scoping is by the
 * job's own `branch_id` (copied from the source quote/site at conversion).
 */
export async function getJobs(
  supabase: SupabaseClient,
  activeBranchId: string | null,
): Promise<Job[]> {
  let query = supabase.from('jobs').select(JOB_SELECT).order('created_at', { ascending: false })
  if (activeBranchId) query = query.eq('branch_id', activeBranchId)
  const { data, error } = await query
  if (error) {
    console.log('[v0] getJobs error:', error.message)
    return []
  }
  return (data ?? []) as Job[]
}

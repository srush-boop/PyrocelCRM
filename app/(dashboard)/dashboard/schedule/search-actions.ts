'use server'

import { createClient } from '@/lib/supabase/server'
import type { Profile, TaskWithDetails } from '@/lib/types/database'
import { normalizeTasks } from '@/lib/normalize-task'
import { isTaskVisibleToEngineer } from '@/lib/engineer-visibility'

/**
 * The schedule page bounds an engineer's/sub-contractor's payload by skipping
 * completed/cancelled calls scheduled more than 90 days ago. That keeps normal
 * browsing fast, but it also means the client-side search can't reach older
 * calls. This action lazily loads the FULL set of the engineer's own calls
 * (no date cutoff) so the client can merge them in while a search is active.
 *
 * It mirrors the engineer path in `schedule/page.tsx` (own tasks only, same
 * embeds, same normalize + CDO/sub-contract visibility filter) so merged rows
 * render identically. Admin/office already load everything, so they never call
 * this.
 */
export async function loadAllMyCalls(): Promise<{
  ok: boolean
  tasks?: TaskWithDetails[]
  error?: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }

  const role = (profile as Profile).role
  if (role !== 'engineer' && role !== 'subcontractor') {
    // Admin/office already load the full set client-side; nothing extra to add.
    return { ok: true, tasks: [] }
  }

  const { data: tasksData, error } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(
        *,
        route:routes(*),
        area:areas(*),
        subcontractor:suppliers!site_services_subcontractor_id_fkey(*),
        site:sites(*, route:routes(*), branch:branches(*), client:clients(id, name)),
        service_type:service_types(*, system_type:system_types(*))
      ),
      direct_site:sites!tasks_site_id_fkey(*, route:routes(*), branch:branches(*), client:clients(id, name)),
      direct_service_type:service_types!tasks_service_type_id_fkey(*, system_type:system_types(*)),
      direct_system_type:system_types!tasks_system_type_id_fkey(*),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      visit_type:service_visit_types(*),
      client:clients(id, name),
      task_result:task_results(reference_number, overall_status)
    `)
    .eq('assigned_engineer_id', user.id)
    .order('scheduled_date', { ascending: true })

  if (error) return { ok: false, error: error.message }

  const normalized = normalizeTasks((tasksData || []) as TaskWithDetails[])

  const visible =
    role === 'engineer'
      ? normalized.filter((t) => isTaskVisibleToEngineer(t, (profile as Profile).discipline))
      : normalized

  return { ok: true, tasks: visible }
}

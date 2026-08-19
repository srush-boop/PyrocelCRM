import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/types/database'

export interface AuthorizedCaller {
  profile: Profile
  supplierId: string
  isLead: boolean
}

export interface TaskAuthResult {
  ok: boolean
  status: number
  caller?: AuthorizedCaller
  /** The subcontractor company that owns the task's service. */
  taskSupplierId?: string | null
  /** Who the task is currently assigned to. */
  assignedEngineerId?: string | null
}

/**
 * Resolve the signed-in subcontractor and confirm they may act on a task.
 *
 * Rules:
 * - Caller must be an active subcontractor linked to a company (supplier).
 * - The task's service must be allocated to that same company
 *   (`site_services.subcontractor_id === supplierId`) OR the task must be
 *   assigned directly to the caller.
 *
 * Uses the admin client for the lookups so the check is independent of RLS, but
 * every decision is enforced in code here.
 */
export async function authorizeTaskAccess(taskId: string): Promise<TaskAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = profileRow as Profile | null
  if (!profile || profile.role !== 'subcontractor' || !profile.supplier_id) {
    return { ok: false, status: 403 }
  }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('id, assigned_engineer_id, site_service:site_services(subcontractor_id)')
    .eq('id', taskId)
    .single()

  if (!task) return { ok: false, status: 404 }

  const taskSupplierId = (task as any).site_service?.subcontractor_id ?? null
  const assignedEngineerId = (task as any).assigned_engineer_id ?? null

  const belongsToCompany = taskSupplierId === profile.supplier_id
  const assignedToMe = assignedEngineerId === profile.id
  if (!belongsToCompany && !assignedToMe) {
    return { ok: false, status: 403 }
  }

  return {
    ok: true,
    status: 200,
    caller: {
      profile,
      supplierId: profile.supplier_id,
      isLead: profile.is_subcontractor_lead === true,
    },
    taskSupplierId,
    assignedEngineerId,
  }
}

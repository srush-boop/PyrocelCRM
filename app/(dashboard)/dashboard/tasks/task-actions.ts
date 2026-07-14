'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface TaskActionResult {
  ok: boolean
  error?: string
}

/**
 * Whole seconds elapsed since a `paused_at` timestamp (clamped ≥ 0). Used to
 * fold an open pause into a task's accumulated `total_paused_seconds` on resume
 * or completion.
 */
function pausedSecondsSince(pausedAt: string | null | undefined): number {
  if (!pausedAt) return 0
  const ms = Date.now() - new Date(pausedAt).getTime()
  return Math.max(0, Math.floor(ms / 1000))
}

/**
 * Pause an in-progress inspection. Used when an engineer leaves site before
 * completing the work and needs to return another day. The task keeps its
 * progress/checklist intact (nothing is cleared) and `started_at` is preserved,
 * but it moves to the distinct `paused` status so it no longer counts the
 * engineer as being on site (see the calls-map engineer positioning).
 *
 * Authorisation: the assigned engineer, or any office/admin user.
 */
export async function pauseTask(taskId: string, note?: string | null): Promise<TaskActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role

  const { data: task } = await supabase
    .from('tasks')
    .select('id, status, assigned_engineer_id')
    .eq('id', taskId)
    .single()
  if (!task) return { ok: false, error: 'Call not found.' }

  const isOfficeOrAdmin = role === 'admin' || role === 'office'
  const isAssignedEngineer = task.assigned_engineer_id === user.id
  if (!isOfficeOrAdmin && !isAssignedEngineer) {
    return { ok: false, error: 'You are not allowed to pause this call.' }
  }

  if (task.status !== 'in_progress') {
    return { ok: false, error: 'Only an in-progress inspection can be paused.' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      pause_note: note?.trim() || null,
      paused_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dashboard/tasks/${taskId}`)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/schedule/map')
  return { ok: true }
}

/**
 * Resume a paused inspection, returning it to `in_progress` so the engineer can
 * continue where they left off. Pause metadata is cleared; `started_at` is left
 * untouched so it still reflects when the work first began.
 *
 * Authorisation: the assigned engineer, or any office/admin user.
 */
export async function resumeTask(taskId: string): Promise<TaskActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role

  const { data: task } = await supabase
    .from('tasks')
    .select('id, status, assigned_engineer_id, paused_at, total_paused_seconds')
    .eq('id', taskId)
    .single()
  if (!task) return { ok: false, error: 'Call not found.' }

  const isOfficeOrAdmin = role === 'admin' || role === 'office'
  const isAssignedEngineer = task.assigned_engineer_id === user.id
  if (!isOfficeOrAdmin && !isAssignedEngineer) {
    return { ok: false, error: 'You are not allowed to resume this call.' }
  }

  if (task.status !== 'paused') {
    return { ok: false, error: 'Only a paused inspection can be resumed.' }
  }

  // Accumulate the just-ended pause so on-site time (and its labour cost)
  // excludes paused periods.
  const accumulatedPaused =
    (task.total_paused_seconds ?? 0) + pausedSecondsSince(task.paused_at)

  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'in_progress',
      paused_at: null,
      pause_note: null,
      paused_by: null,
      total_paused_seconds: accumulatedPaused,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dashboard/tasks/${taskId}`)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/schedule/map')
  return { ok: true }
}

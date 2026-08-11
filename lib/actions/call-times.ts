'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Adjust a call's on-site start / end times (tasks.started_at / completed_at).
 * Used by the asset execution flows (dampers, emergency lights, MCPs,
 * extinguishers) so the engineer can correct the auto-captured times: start is
 * stamped when work begins, end defaults to completion time but stays editable.
 *
 * Pass `undefined` to leave a field unchanged; pass an ISO string to set it.
 * RLS applies — an engineer can only update a call assigned to them (and
 * office/admin via their own policy), matching every other write in these flows.
 */
export async function setCallTimes(
  taskId: string,
  times: { startedAt?: string | null; completedAt?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const update: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (times.startedAt !== undefined) update.started_at = times.startedAt
  if (times.completedAt !== undefined) update.completed_at = times.completedAt

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
  if (error) {
    console.log('[v0] setCallTimes error:', error.message)
    return { ok: false, error: 'Could not update the call times.' }
  }
  return { ok: true }
}

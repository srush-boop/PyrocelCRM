'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Take ownership of an outstanding remedial call: assign it to the current user.
 *
 * Field engineers have a deliberately restrictive UPDATE policy on `tasks`
 * (they can only touch calls already assigned to them), which would block a
 * self-assign. We therefore verify the caller is a real, active user and that
 * the target really is an OPEN remedial call, then perform the assignment with
 * the service-role client. Office/admin/engineer/subcontractor may all claim.
 */
export async function takeRemedialOwnership(
  remedialTaskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('id', user.id)
    .single()
  if (!profile || (profile as { status?: string }).status !== 'active') {
    return { ok: false, error: 'Your account is not active.' }
  }

  const admin = createAdminClient()

  // Guard: only allow claiming a genuinely open remedial call.
  const { data: target } = await admin
    .from('tasks')
    .select('id, is_remedial, status')
    .eq('id', remedialTaskId)
    .maybeSingle()
  const t = target as { id: string; is_remedial: boolean | null; status: string } | null
  if (!t || !t.is_remedial) return { ok: false, error: 'Remedial call not found.' }
  if (t.status !== 'pending' && t.status !== 'in_progress') {
    return { ok: false, error: 'This remedial call is no longer open.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({ assigned_engineer_id: user.id })
    .eq('id', remedialTaskId)
  if (error) {
    console.log('[v0] takeRemedialOwnership update error:', error.message)
    return { ok: false, error: 'Could not take ownership. Please try again.' }
  }

  revalidatePath(`/dashboard/tasks/${remedialTaskId}`)
  return { ok: true }
}

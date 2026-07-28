'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'

// Logs the reason a call's response (KPI) deadline was missed. Unlike the
// chargeable-review actions (office/admin only), this is also allowed for the
// engineer assigned to the call, since they often know first-hand why the
// deadline slipped (no access, parts, awaiting authorisation, etc.).
export async function setDeadlineFailedReason(
  taskId: string,
  reason: string,
  note: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  if (!reason?.trim()) return { error: 'A reason is required' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  const role = (profile as Pick<Profile, 'id' | 'role'> | null)?.role

  // Verify the caller is a manager or the engineer assigned to this call.
  const { data: taskRow } = await supabase
    .from('tasks')
    .select('id, assigned_engineer_id')
    .eq('id', taskId)
    .single()
  if (!taskRow) return { error: 'Call not found' }

  const isManager = role === 'admin' || role === 'office'
  const isAssignedEngineer =
    role === 'engineer' && (taskRow as { assigned_engineer_id: string | null }).assigned_engineer_id === user.id
  if (!isManager && !isAssignedEngineer) {
    return { error: 'Not authorised' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ deadline_failed_reason: reason, deadline_failed_note: note })
    .eq('id', taskId)
  if (error) {
    console.error('[v0] setDeadlineFailedReason error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/chargeable')
  revalidatePath('/dashboard/kpis')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

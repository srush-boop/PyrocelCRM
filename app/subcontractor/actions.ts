'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTaskAccess } from '@/lib/subcontractor/authorize'
import { notifyUsers } from '@/lib/notifications'

interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Re-issue a call to one of the subcontractor's own workers. Lead-only.
 *
 * Guards:
 * - Caller must be the company lead.
 * - The task must belong to the caller's company (enforced by authorizeTaskAccess).
 * - The target worker must be an active subcontractor in the SAME company.
 *
 * Writes with the admin client (task UPDATE RLS only permits self-assigned
 * edits), after the in-code authorization above.
 */
export async function reassignCallToWorker(
  taskId: string,
  workerId: string,
): Promise<ActionResult> {
  const auth = await authorizeTaskAccess(taskId)
  if (!auth.ok || !auth.caller) {
    return { ok: false, error: 'You are not allowed to reassign this call.' }
  }
  if (!auth.caller.isLead) {
    return { ok: false, error: 'Only the company lead can issue calls to workers.' }
  }
  // The task must be one of the company's allocated services (not merely a call
  // that happens to be assigned to the lead).
  if (auth.taskSupplierId !== auth.caller.supplierId) {
    return { ok: false, error: 'This call is not allocated to your company.' }
  }

  const admin = createAdminClient()

  // Confirm the target worker belongs to the same company and is active.
  const { data: worker } = await admin
    .from('profiles')
    .select('id, full_name, supplier_id, role, status')
    .eq('id', workerId)
    .single()
  if (
    !worker ||
    worker.role !== 'subcontractor' ||
    worker.supplier_id !== auth.caller.supplierId ||
    worker.status !== 'active'
  ) {
    return { ok: false, error: 'That worker is not part of your company.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({ assigned_engineer_id: workerId, assigned_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) {
    return { ok: false, error: error.message }
  }

  // Best-effort: notify the worker they have a new call.
  try {
    await notifyUsers({
      userIds: [workerId],
      title: 'New call issued to you',
      body: 'Your company lead has issued you a call. Open your portal to view it.',
      url: `/subcontractor/calls/${taskId}`,
      category: 'system',
      createdBy: auth.caller.profile.id,
    })
  } catch {
    // Non-fatal — the assignment itself succeeded.
  }

  revalidatePath('/subcontractor')
  revalidatePath('/subcontractor/future-works')
  revalidatePath(`/subcontractor/calls/${taskId}`)
  return { ok: true }
}

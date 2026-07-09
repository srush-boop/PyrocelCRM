'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'

// Server actions backing the Chargeable Calls review flow. A completed call is
// flagged chargeable automatically (service-type default OR parts used); office
// and admin then review it here before it feeds invoicing. Only office/admin
// may change charge/review state — engineers and clients cannot.

type ChargeReviewAction =
  | { kind: 'reviewed' }
  | { kind: 'reopen' }
  | { kind: 'set_chargeable'; chargeable: boolean }

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'id' | 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return { supabase, userId: user.id }
}

export async function setChargeReview(
  taskId: string,
  action: ChargeReviewAction,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const update: Record<string, unknown> = {}

  if (action.kind === 'reviewed') {
    update.charge_review_status = 'reviewed'
    update.charge_reviewed_at = new Date().toISOString()
    update.charge_reviewed_by = userId
  } else if (action.kind === 'reopen') {
    update.charge_review_status = 'pending'
    update.charge_reviewed_at = null
    update.charge_reviewed_by = null
  } else if (action.kind === 'set_chargeable') {
    update.chargeable = action.chargeable
    if (action.chargeable) {
      // Manual override to chargeable puts the call into the review queue.
      update.charge_reason = 'manual'
      update.charge_review_status = 'pending'
      update.charge_reviewed_at = null
      update.charge_reviewed_by = null
    } else {
      // No longer chargeable: clear it out of the review queue entirely.
      update.charge_review_status = 'none'
      update.charge_reason = null
      update.charge_reviewed_at = null
      update.charge_reviewed_by = null
    }
  }

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
  if (error) {
    console.error('[v0] setChargeReview error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

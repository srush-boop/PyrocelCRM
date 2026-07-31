'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CallCharge, Profile } from '@/lib/types/database'

// Server actions backing the ad-hoc "Charges" editor on the chargeable review
// dialog. A charge is a free-text chargeable line (extra labour, sundries) added
// to a call at review time; it flows into the generated invoice alongside parts
// and auto-labour. Only office/admin (is_staff) manage these — RLS is the real
// backstop; these helpers add friendly auth + validation on top.

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

/** All ad-hoc charges on a call, oldest first. */
export async function getCallCharges(taskId: string): Promise<CallCharge[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('call_charges')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  return (data ?? []) as CallCharge[]
}

/** Create or update an ad-hoc charge line. Pass `id` to update, omit to insert. */
export async function upsertCallCharge(input: {
  id?: string
  taskId: string
  description: string
  quantity: number
  unitPricePence: number
  kind: 'labour' | 'other'
  nominalCodeId?: string | null
}): Promise<{ error?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const description = input.description.trim()
  if (!description) return { error: 'Enter a description' }
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1
  const unitPricePence = Math.max(0, Math.round(input.unitPricePence || 0))
  const kind = input.kind === 'labour' ? 'labour' : 'other'

  if (input.id) {
    const { error } = await supabase
      .from('call_charges')
      .update({
        description,
        quantity,
        unit_price_pence: unitPricePence,
        kind,
        nominal_code_id: input.nominalCodeId ?? null,
      })
      .eq('id', input.id)
      .eq('task_id', input.taskId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('call_charges').insert({
      task_id: input.taskId,
      description,
      quantity,
      unit_price_pence: unitPricePence,
      kind,
      nominal_code_id: input.nominalCodeId ?? null,
      created_by: userId,
    })
    if (error) return { error: error.message }
  }

  revalidatePath(`/dashboard/tasks/${input.taskId}`)
  revalidatePath('/dashboard/chargeable')
  return {}
}

/** Delete an ad-hoc charge line. */
export async function deleteCallCharge(
  id: string,
  taskId: string,
): Promise<{ error?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('call_charges')
    .delete()
    .eq('id', id)
    .eq('task_id', taskId)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/tasks/${taskId}`)
  revalidatePath('/dashboard/chargeable')
  return {}
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

export interface DirectCostInput {
  id?: string
  role: string
  hourly_cost_pence: number
  notes?: string | null
  active: boolean
}

export async function saveDirectCost(
  input: DirectCostInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!input.role?.trim()) return { ok: false, error: 'A role name is required.' }

  const row = {
    role: input.role.trim(),
    hourly_cost_pence: Math.max(0, Math.round(input.hourly_cost_pence) || 0),
    notes: input.notes?.trim() || null,
    active: input.active,
  }

  if (input.id) {
    const { error: upErr } = await supabase
      .from('direct_costs')
      .update(row)
      .eq('id', input.id)
    if (upErr) return { ok: false, error: 'Could not update the direct cost.' }
  } else {
    const { error: insErr } = await supabase
      .from('direct_costs')
      .insert({ ...row, created_by: user.id })
    if (insErr) return { ok: false, error: 'Could not create the direct cost.' }
  }

  revalidatePath('/dashboard/sales/direct-costs')
  return { ok: true }
}

export async function deleteDirectCost(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('direct_costs').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the direct cost.' }

  revalidatePath('/dashboard/sales/direct-costs')
  return { ok: true }
}

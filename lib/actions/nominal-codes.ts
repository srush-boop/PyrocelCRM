'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { NominalCode, Profile } from '@/lib/types/database'

// Server actions for the managed nominal-code master list (Settings → Nominal
// Codes). Reads are open to any signed-in user; writes are office/admin only
// and also enforced by RLS (is_billing_manager).

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

export interface NominalCodeInput {
  code: string
  name: string
  active?: boolean
}

export async function getNominalCodes(includeInactive = true): Promise<NominalCode[]> {
  const supabase = await createClient()
  let q = supabase.from('nominal_codes').select('*').order('code')
  if (!includeInactive) q = q.eq('active', true)
  const { data } = await q
  return (data ?? []) as NominalCode[]
}

export async function createNominalCode(
  input: NominalCodeInput,
): Promise<{ error: string | null; id?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const code = input.code?.trim()
  const name = input.name?.trim()
  if (!code) return { error: 'A code is required' }
  if (!name) return { error: 'A name is required' }

  const { data, error } = await supabase
    .from('nominal_codes')
    .insert({
      code,
      name,
      active: input.active ?? true,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { error: 'That code already exists' }
    return { error: error?.message || 'Could not create the nominal code' }
  }

  revalidatePath('/dashboard/settings')
  return { error: null, id: data.id as string }
}

export async function updateNominalCode(
  id: string,
  input: NominalCodeInput,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const code = input.code?.trim()
  const name = input.name?.trim()
  if (!code) return { error: 'A code is required' }
  if (!name) return { error: 'A name is required' }

  const { error } = await supabase
    .from('nominal_codes')
    .update({
      code,
      name,
      active: input.active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'That code already exists' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

export async function deleteNominalCode(id: string): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  // FKs are ON DELETE SET NULL, so deleting a code simply clears mappings.
  const { error } = await supabase.from('nominal_codes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

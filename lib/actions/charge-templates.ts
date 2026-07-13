'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ChargeTemplate, Profile } from '@/lib/types/database'

// Server actions for the preconfigured charge catalog (Settings → Charges).
// Office/admin only; RLS (is_billing_manager) also enforces this in the DB.

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

export interface ChargeTemplateInput {
  name: string
  description?: string | null
  /** Default sell price in pence. */
  defaultUnitPricePence: number
  defaultTaxCode?: string | null
  defaultNominalCode?: string | null
  active?: boolean
}

export async function getChargeTemplates(
  includeInactive = true,
): Promise<ChargeTemplate[]> {
  const supabase = await createClient()
  let q = supabase.from('charge_templates').select('*').order('name')
  if (!includeInactive) q = q.eq('active', true)
  const { data } = await q
  return (data ?? []) as ChargeTemplate[]
}

function sanitisePrice(pence: number): number {
  const n = Number(pence)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

export async function createChargeTemplate(
  input: ChargeTemplateInput,
): Promise<{ error: string | null; id?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const name = input.name?.trim()
  if (!name) return { error: 'A name is required' }

  const { data, error } = await supabase
    .from('charge_templates')
    .insert({
      name,
      description: input.description?.trim() || null,
      default_unit_price_pence: sanitisePrice(input.defaultUnitPricePence),
      default_tax_code: input.defaultTaxCode?.trim() || null,
      default_nominal_code: input.defaultNominalCode?.trim() || null,
      active: input.active ?? true,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message || 'Could not create the charge' }

  revalidatePath('/dashboard/settings')
  return { error: null, id: data.id as string }
}

export async function updateChargeTemplate(
  id: string,
  input: ChargeTemplateInput,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const name = input.name?.trim()
  if (!name) return { error: 'A name is required' }

  const { error } = await supabase
    .from('charge_templates')
    .update({
      name,
      description: input.description?.trim() || null,
      default_unit_price_pence: sanitisePrice(input.defaultUnitPricePence),
      default_tax_code: input.defaultTaxCode?.trim() || null,
      default_nominal_code: input.defaultNominalCode?.trim() || null,
      active: input.active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

export async function deleteChargeTemplate(id: string): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { error } = await supabase.from('charge_templates').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

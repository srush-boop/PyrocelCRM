'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Profile,
  RecurringCharge,
  RecurringFrequency,
  RecurringTiming,
} from '@/lib/types/database'

// Server actions for recurring charges (Phase A). Office/admin only; RLS
// (is_billing_manager) also enforces this at the database level. Every price
// change writes a recurring_charge_price_history row for audit.

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

export interface RecurringChargeInput {
  billing_account_id: string
  site_service_id?: string | null
  client_id?: string | null
  site_id?: string | null
  description: string
  unit_price_pence: number
  quantity: number
  tax_code?: string | null
  nominal_code?: string | null
  timing: RecurringTiming
  frequency: RecurringFrequency
  renewal_month?: number | null
  group_key?: string | null
  is_subcontracted: boolean
  subcontract_price_pence?: number | null
  start_date?: string | null
  end_date?: string | null
}

function sanitize(input: RecurringChargeInput) {
  const subcontracted = !!input.is_subcontracted
  return {
    billing_account_id: input.billing_account_id,
    site_service_id: input.site_service_id ?? null,
    client_id: input.client_id ?? null,
    site_id: input.site_id ?? null,
    description: input.description.trim(),
    unit_price_pence: Math.max(0, Math.round(input.unit_price_pence ?? 0)),
    quantity: input.quantity > 0 ? input.quantity : 1,
    tax_code: input.tax_code?.trim() || null,
    nominal_code: input.nominal_code?.trim() || null,
    timing: input.timing,
    frequency: input.frequency,
    renewal_month: input.renewal_month ?? null,
    group_key: input.group_key?.trim() || null,
    is_subcontracted: subcontracted,
    // Only persist a buy price when actually subcontracted.
    subcontract_price_pence: subcontracted
      ? Math.max(0, Math.round(input.subcontract_price_pence ?? 0))
      : null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
  }
}

export async function getRecurringChargesForAccount(
  billingAccountId: string,
): Promise<RecurringCharge[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recurring_charges')
    .select('*')
    .eq('billing_account_id', billingAccountId)
    .order('active', { ascending: false })
    .order('description', { ascending: true })
  return (data ?? []) as RecurringCharge[]
}

export async function createRecurringCharge(input: RecurringChargeInput) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  if (!input.description?.trim()) return { error: 'Description is required' }

  const values = sanitize(input)
  const { data, error } = await supabase
    .from('recurring_charges')
    .insert({ ...values, created_by: userId })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const newId = (data as { id: string } | null)?.id
  // Seed the price history with the opening price.
  if (newId) {
    await supabase.from('recurring_charge_price_history').insert({
      recurring_charge_id: newId,
      old_price_pence: null,
      new_price_pence: values.unit_price_pence,
      reason: 'Initial price',
      changed_by: userId,
    })
  }

  revalidatePath('/dashboard/invoices')
  return { id: newId }
}

export async function updateRecurringCharge(id: string, input: RecurringChargeInput) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  if (!input.description?.trim()) return { error: 'Description is required' }

  // Read the current price so we only log history on an actual change.
  const { data: existing } = await supabase
    .from('recurring_charges')
    .select('unit_price_pence')
    .eq('id', id)
    .single()
  const oldPrice = (existing as { unit_price_pence: number } | null)?.unit_price_pence ?? null

  const values = sanitize(input)
  const { error } = await supabase
    .from('recurring_charges')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  if (oldPrice !== null && oldPrice !== values.unit_price_pence) {
    await supabase.from('recurring_charge_price_history').insert({
      recurring_charge_id: id,
      old_price_pence: oldPrice,
      new_price_pence: values.unit_price_pence,
      reason: 'Manual edit',
      changed_by: userId,
    })
  }

  revalidatePath('/dashboard/invoices')
  return { success: true }
}

export async function setRecurringChargeActive(id: string, active: boolean) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('recurring_charges')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/invoices')
  return { success: true }
}

export async function deleteRecurringCharge(id: string) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  // Block hard-delete once the charge has been invoiced; deactivate instead so
  // history/audit stays intact.
  const { data: charge } = await supabase
    .from('recurring_charges')
    .select('last_invoiced_date')
    .eq('id', id)
    .single()

  if ((charge as { last_invoiced_date: string | null } | null)?.last_invoiced_date) {
    return {
      error: 'This charge has already been invoiced. Deactivate it instead of deleting.',
    }
  }

  const { error } = await supabase.from('recurring_charges').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/invoices')
  return { success: true }
}

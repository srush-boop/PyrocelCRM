'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { BillingAccountStatus, Profile } from '@/lib/types/database'

// Server actions backing Phase 1 of billing: Client Billing Accounts
// (sub-clients & statuses). Only office/admin may mutate billing data;
// engineers and clients are read-only via RLS.

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

// Normalise a Sage A/C ref: trim, uppercase, empty -> null. Sage 50 caps at 8.
function normaliseSageRef(ref: string | null | undefined): string | null {
  const trimmed = (ref ?? '').trim().toUpperCase()
  return trimmed ? trimmed.slice(0, 8) : null
}

export interface BillingAccountInput {
  name: string
  sage_account_ref?: string | null
  invoice_address?: string | null
  invoice_postcode?: string | null
  invoice_contact_name?: string | null
  invoice_email?: string | null
  invoice_phone?: string | null
  payment_terms_days?: number
  default_tax_code?: string
  default_nominal_code?: string
  /** Optional rate-card override; null inherits the company default card. */
  rate_card_id?: string | null
  notes?: string | null
}

function sanitiseInput(input: BillingAccountInput) {
  return {
    name: input.name.trim(),
    sage_account_ref: normaliseSageRef(input.sage_account_ref),
    invoice_address: input.invoice_address?.trim() || null,
    invoice_postcode: input.invoice_postcode?.trim() || null,
    invoice_contact_name: input.invoice_contact_name?.trim() || null,
    invoice_email: input.invoice_email?.trim() || null,
    invoice_phone: input.invoice_phone?.trim() || null,
    payment_terms_days:
      typeof input.payment_terms_days === 'number' && input.payment_terms_days >= 0
        ? Math.round(input.payment_terms_days)
        : 30,
    default_tax_code: input.default_tax_code?.trim() || 'T1',
    default_nominal_code: input.default_nominal_code?.trim() || '4000',
    rate_card_id: input.rate_card_id || null,
    notes: input.notes?.trim() || null,
  }
}

export async function createBillingAccount(
  clientId: string,
  input: BillingAccountInput,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  if (!input.name?.trim()) return { error: 'Name is required' }

  // First account for a client becomes its default automatically.
  const { count } = await supabase
    .from('billing_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)

  const { error } = await supabase.from('billing_accounts').insert({
    client_id: clientId,
    ...sanitiseInput(input),
    is_default: (count ?? 0) === 0,
  })

  if (error) {
    if (error.code === '23505') return { error: 'That Sage A/C ref is already in use' }
    return { error: error.message }
  }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { error: null }
}

export async function updateBillingAccount(
  id: string,
  clientId: string,
  input: BillingAccountInput,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  if (!input.name?.trim()) return { error: 'Name is required' }

  const { error } = await supabase
    .from('billing_accounts')
    .update(sanitiseInput(input))
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'That Sage A/C ref is already in use' }
    return { error: error.message }
  }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { error: null }
}

export async function setBillingAccountStatus(
  id: string,
  clientId: string,
  status: BillingAccountStatus,
  reason: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('billing_accounts')
    .update({
      status,
      status_reason: reason?.trim() || null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: userId,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { error: null }
}

export async function setDefaultBillingAccount(
  id: string,
  clientId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  // Clear the existing default first (the partial unique index allows only one),
  // then promote the chosen account.
  const { error: clearError } = await supabase
    .from('billing_accounts')
    .update({ is_default: false })
    .eq('client_id', clientId)
    .eq('is_default', true)

  if (clearError) return { error: clearError.message }

  const { error } = await supabase
    .from('billing_accounts')
    .update({ is_default: true })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { error: null }
}

// Point a site at a billing account (or null to inherit the client default).
export async function setSiteBillingAccount(
  siteId: string,
  billingAccountId: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('sites')
    .update({ billing_account_id: billingAccountId })
    .eq('id', siteId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return { error: null }
}

// Point a single service at a billing account (or null to inherit the site).
export async function setServiceBillingAccount(
  siteServiceId: string,
  siteId: string,
  billingAccountId: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('site_services')
    .update({ billing_account_id: billingAccountId })
    .eq('id', siteServiceId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return { error: null }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  BillingAccount,
  ChargeTemplate,
  NominalCode,
  Profile,
  RecurringCharge,
  RecurringFrequency,
  RecurringTiming,
} from '@/lib/types/database'
import { resolveBillingAccount } from '@/lib/billing/resolve-billing-account'

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
  nominal_code_id?: string | null
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
    nominal_code_id: input.nominal_code_id ?? null,
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

export interface LinkableService {
  site_service_id: string
  site_id: string
  site_name: string
  service_type_name: string
  /** Human cadence label, e.g. "Every 12 months". */
  frequency_label: string
}

/**
 * Services a recurring charge can be linked to for a billing account: all
 * active services on sites belonging to the account's client. Returns a
 * readable "{Site} — {Service type}" shape for the picker.
 */
export async function getLinkableServices(clientId: string | null): Promise<LinkableService[]> {
  if (!clientId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('site_services')
    .select(
      'id, site_id, frequency_value, frequency_unit, active, site:sites!inner(name, client_id), service_type:service_types(name)',
    )
    .eq('active', true)
    .eq('sites.client_id', clientId)

  type Row = {
    id: string
    site_id: string
    frequency_value: number | null
    frequency_unit: string | null
    site: { name: string; client_id: string } | { name: string; client_id: string }[] | null
    service_type: { name: string } | { name: string }[] | null
  }

  const rows = (data ?? []) as Row[]
  const out: LinkableService[] = rows.map((r) => {
    const site = Array.isArray(r.site) ? r.site[0] : r.site
    const st = Array.isArray(r.service_type) ? r.service_type[0] : r.service_type
    const freq =
      r.frequency_value && r.frequency_unit
        ? `Every ${r.frequency_value} ${r.frequency_unit}${r.frequency_value === 1 ? '' : ''}`
        : '—'
    return {
      site_service_id: r.id,
      site_id: r.site_id,
      site_name: site?.name ?? 'Unknown site',
      service_type_name: st?.name ?? 'Service',
      frequency_label: freq,
    }
  })
  out.sort(
    (a, b) =>
      a.site_name.localeCompare(b.site_name) ||
      a.service_type_name.localeCompare(b.service_type_name),
  )
  return out
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

export interface ServiceChargeContext {
  siteServiceId: string
  siteId: string
  clientId: string | null
  serviceLabel: string
  /** Billing accounts on the service's client, selectable in the dialog. */
  billingAccounts: BillingAccount[]
  /** The resolved default account id (service → site → client default). */
  defaultBillingAccountId: string | null
  /** Active catalog charges to pick from. */
  chargeTemplates: ChargeTemplate[]
  /** Existing recurring charges already linked to this service. */
  existingCharges: RecurringCharge[]
  /** Active nominal codes for the managed picker. */
  nominalCodes: NominalCode[]
  /** This service type's nominal code — the auto-select fallback for charges. */
  serviceTypeNominalCodeId: string | null
}

/**
 * Everything the "Add charge" dialog on a site service needs: the client's
 * billing accounts, the resolved default account, the active charge catalog and
 * any charges already linked to this service. Read-only; office/admin gate via
 * RLS but any signed-in manager viewing the site can load this.
 */
export async function getServiceChargeContext(
  siteServiceId: string,
): Promise<ServiceChargeContext | null> {
  const supabase = await createClient()

  // The service carries its own billing override + its site; the site carries a
  // billing override + the client. One query resolves the whole chain.
  const { data: svc } = await supabase
    .from('site_services')
    .select(
      'id, site_id, billing_account_id, service_type:service_types(name, nominal_code_id), site:sites(id, client_id, billing_account_id)',
    )
    .eq('id', siteServiceId)
    .single()

  if (!svc) return null

  const site = Array.isArray((svc as any).site) ? (svc as any).site[0] : (svc as any).site
  const serviceType = Array.isArray((svc as any).service_type)
    ? (svc as any).service_type[0]
    : (svc as any).service_type
  const clientId: string | null = site?.client_id ?? null

  // Candidate accounts = every billing account on the client.
  const { data: accountRows } = clientId
    ? await supabase
        .from('billing_accounts')
        .select('*')
        .eq('client_id', clientId)
        .order('is_default', { ascending: false })
        .order('name')
    : { data: [] as BillingAccount[] }
  const billingAccounts = (accountRows ?? []) as BillingAccount[]

  const clientDefault = billingAccounts.find((a) => a.is_default) ?? null
  const resolved = resolveBillingAccount(
    { billing_account_id: (svc as any).billing_account_id },
    { billing_account_id: site?.billing_account_id },
    clientDefault,
    billingAccounts,
  )

  const [{ data: templateRows }, { data: existingRows }, { data: nominalRows }] = await Promise.all(
    [
      supabase.from('charge_templates').select('*').eq('active', true).order('name'),
      supabase
        .from('recurring_charges')
        .select('*')
        .eq('site_service_id', siteServiceId)
        .order('active', { ascending: false })
        .order('description'),
      supabase.from('nominal_codes').select('*').eq('active', true).order('code'),
    ],
  )

  return {
    siteServiceId,
    siteId: (svc as any).site_id,
    clientId,
    serviceLabel: serviceType?.name ?? 'Service',
    billingAccounts,
    defaultBillingAccountId: resolved.account?.id ?? null,
    chargeTemplates: (templateRows ?? []) as ChargeTemplate[],
    existingCharges: (existingRows ?? []) as RecurringCharge[],
    nominalCodes: (nominalRows ?? []) as NominalCode[],
    serviceTypeNominalCodeId: serviceType?.nominal_code_id ?? null,
  }
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

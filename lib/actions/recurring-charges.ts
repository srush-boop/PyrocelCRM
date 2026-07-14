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
  RecurringPriceBasis,
  RecurringTiming,
} from '@/lib/types/database'
import { resolveBillingAccount } from '@/lib/billing/resolve-billing-account'
import { perPeriodFromAnnual } from '@/lib/billing/recurring'

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
  /** Per-period price in pence — the canonical billed amount. Callers that let
   *  the user enter an annual total must divide it down before calling. */
  unit_price_pence: number
  /** How the value was entered (defaults to 'per_period' when omitted). */
  price_basis?: RecurringPriceBasis
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

// The renewal month drives charge generation, so every recurring charge must
// carry a valid 1–12 value. Enforced server-side across all create/update paths.
function isValidRenewalMonth(month: number | null | undefined): month is number {
  return typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12
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
    price_basis: input.price_basis === 'annual' ? 'annual' : 'per_period',
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

export interface SetupServiceCharge {
  siteServiceId: string
  /** Value the user entered for this service, in pence. */
  valuePence: number
}

/**
 * Bulk-create recurring charges during site setup. Applies one site-wide billing
 * config (template defaults, frequency, timing, renewal month, price basis) to
 * every service that has a value entered. The billing account is inherited
 * (site override → client default). Services with no value are skipped so the
 * "set up service charges" prompt can catch them later. Safe to call with an
 * empty list.
 */
export async function createSetupCharges(opts: {
  siteId: string
  templateId?: string | null
  priceBasis: RecurringPriceBasis
  frequency: RecurringFrequency
  timing: RecurringTiming
  renewalMonth?: number | null
  services: SetupServiceCharge[]
}): Promise<{ error?: string; created: number }> {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error, created: 0 }
  const { supabase, userId } = auth

  const priced = opts.services.filter((s) => s.valuePence > 0)
  if (priced.length === 0) return { created: 0 }
  // Renewal month drives charge generation, so it's required whenever charges
  // are actually created here.
  if (!isValidRenewalMonth(opts.renewalMonth)) {
    return { error: 'A renewal month is required to set up service charges.', created: 0 }
  }

  // Resolve the inherited billing account for this site (site override → client
  // default). Without one we cannot bill, so skip silently.
  const { data: site } = await supabase
    .from('sites')
    .select('id, client_id, billing_account_id')
    .eq('id', opts.siteId)
    .single()
  const clientId = (site as { client_id: string | null } | null)?.client_id ?? null
  if (!clientId) return { created: 0 }

  const { data: accountRows } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('client_id', clientId)
    .order('is_default', { ascending: false })
    .order('name')
  const accounts = (accountRows ?? []) as BillingAccount[]
  const clientDefault = accounts.find((a) => a.is_default) ?? null
  const resolved = resolveBillingAccount(
    { billing_account_id: null },
    { billing_account_id: (site as { billing_account_id: string | null }).billing_account_id },
    clientDefault,
    accounts,
  )
  const billingAccountId = resolved.account?.id ?? null
  if (!billingAccountId) return { created: 0 }

  // Template defaults (description/tax/nominal), if a preconfigured charge was picked.
  const template = opts.templateId
    ? ((
        await supabase.from('charge_templates').select('*').eq('id', opts.templateId).single()
      ).data as ChargeTemplate | null)
    : null

  // Service type names + nominal codes for description/nominal fallbacks.
  const { data: svcRows } = await supabase
    .from('site_services')
    .select('id, service_type:service_types(name, nominal_code_id)')
    .in(
      'id',
      priced.map((s) => s.siteServiceId),
    )
  type SvcRow = {
    id: string
    service_type:
      | { name: string; nominal_code_id: string | null }
      | { name: string; nominal_code_id: string | null }[]
      | null
  }
  const svcById = new Map<string, { name: string; nominalId: string | null }>()
  for (const r of (svcRows ?? []) as SvcRow[]) {
    const st = Array.isArray(r.service_type) ? r.service_type[0] : r.service_type
    svcById.set(r.id, { name: st?.name ?? 'Service', nominalId: st?.nominal_code_id ?? null })
  }

  let created = 0
  for (const svc of priced) {
    const meta = svcById.get(svc.siteServiceId)
    const unitPrice =
      opts.priceBasis === 'annual'
        ? perPeriodFromAnnual(svc.valuePence, opts.frequency)
        : svc.valuePence
    const values = sanitize({
      billing_account_id: billingAccountId,
      site_service_id: svc.siteServiceId,
      site_id: opts.siteId,
      client_id: clientId,
      description: template?.name || meta?.name || 'Recurring charge',
      unit_price_pence: unitPrice,
      price_basis: opts.priceBasis,
      quantity: 1,
      tax_code: template?.default_tax_code ?? null,
      nominal_code_id: template?.nominal_code_id ?? meta?.nominalId ?? null,
      timing: opts.timing,
      frequency: opts.frequency,
      renewal_month: opts.renewalMonth ?? null,
      is_subcontracted: false,
    })
    const { data: inserted, error } = await supabase
      .from('recurring_charges')
      .insert({ ...values, created_by: userId })
      .select('id')
      .single()
    if (error) continue
    const newId = (inserted as { id: string } | null)?.id
    if (newId) {
      await supabase.from('recurring_charge_price_history').insert({
        recurring_charge_id: newId,
        old_price_pence: null,
        new_price_pence: values.unit_price_pence,
        reason: 'Initial price (site setup)',
        changed_by: userId,
      })
      created += 1
    }
  }

  revalidatePath('/dashboard/invoices')
  return { created }
}

export async function createRecurringCharge(input: RecurringChargeInput) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  if (!input.description?.trim()) return { error: 'Description is required' }
  if (!isValidRenewalMonth(input.renewal_month)) {
    return { error: 'A renewal month is required — the system relies on it to generate this charge.' }
  }

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
  if (!isValidRenewalMonth(input.renewal_month)) {
    return { error: 'A renewal month is required — the system relies on it to generate this charge.' }
  }

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

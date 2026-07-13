'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { BillingAccount, Profile } from '@/lib/types/database'
import {
  computeInvoiceTotals,
  DEFAULT_TAX_RATE,
  financialYearOf,
  formatInvoiceNumber,
  lineAmountPence,
} from '@/lib/billing/invoices'
import { isDueNow, nextDueDate, toISODate } from '@/lib/billing/recurring'

// Phase B: assemble & raise invoices from DUE recurring charges. These invoices
// are stamped origin='recurring' and are hard-segregated from ad-hoc/call
// invoices. Office/admin only; RLS also enforces at the DB level.

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

export interface RecurringDueCharge {
  id: string
  description: string
  unitPricePence: number
  quantity: number
  amountPence: number
  frequency: string
  timing: string
  groupKey: string | null
  nextDueDate: string
}

export interface RecurringDueGroup {
  accountId: string
  accountName: string
  accountStatus: string | null
  clientName: string
  onHold: boolean
  groupKey: string | null
  charges: RecurringDueCharge[]
  totalPence: number
}

interface ChargeRow {
  id: string
  billing_account_id: string
  site_service_id: string | null
  description: string
  unit_price_pence: number
  quantity: number | string
  frequency: string
  timing: string
  group_key: string | null
  active: boolean
  start_date: string | null
  last_invoiced_date: string | null
  billing_account: {
    id: string
    name: string
    status: string | null
    client_id: string | null
    client: { name: string } | null
  } | null
}

/**
 * Recurring charges that are due to be invoiced now, grouped by billing account
 * and group_key. advance/arrears charges are date-driven; on_completion charges
 * are surfaced only when their linked service has a completed, not-yet-invoiced
 * call since the charge was last invoiced.
 */
export async function getRecurringDue(): Promise<RecurringDueGroup[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('recurring_charges')
    .select(
      `
      id, billing_account_id, site_service_id, description, unit_price_pence,
      quantity, frequency, timing, group_key, active, start_date, last_invoiced_date,
      billing_account:billing_accounts(id, name, status, client_id, client:clients(name))
    `,
    )
    .eq('active', true)
    .order('description', { ascending: true })

  const rows = (data ?? []) as unknown as ChargeRow[]

  // Resolve on_completion eligibility in one query: any completed task on the
  // charge's site_service after its last_invoiced_date makes it due.
  const onCompletionServiceIds = rows
    .filter((r) => r.timing === 'on_completion' && r.site_service_id)
    .map((r) => r.site_service_id as string)

  const completedByService = new Map<string, string[]>() // serviceId -> completed_at[]
  if (onCompletionServiceIds.length > 0) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('site_service_id, completed_at')
      .in('site_service_id', onCompletionServiceIds)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
    for (const t of (tasks ?? []) as { site_service_id: string; completed_at: string }[]) {
      const list = completedByService.get(t.site_service_id) ?? []
      list.push(t.completed_at)
      completedByService.set(t.site_service_id, list)
    }
  }

  function isCharDue(r: ChargeRow): boolean {
    if (r.timing === 'on_completion') {
      if (!r.site_service_id) return false
      const completions = completedByService.get(r.site_service_id) ?? []
      if (completions.length === 0) return false
      // Due if there's a completion after the last invoiced date (or ever, if never invoiced).
      if (!r.last_invoiced_date) return true
      return completions.some((c) => c > r.last_invoiced_date!)
    }
    return isDueNow({
      frequency: r.frequency as never,
      last_invoiced_date: r.last_invoiced_date,
      start_date: r.start_date,
      timing: r.timing as never,
      active: r.active,
    })
  }

  const groups = new Map<string, RecurringDueGroup>()
  for (const r of rows) {
    if (!r.billing_account) continue
    if (!isCharDue(r)) continue

    const qty = typeof r.quantity === 'string' ? Number.parseFloat(r.quantity) : r.quantity
    const amountPence = lineAmountPence(qty || 1, r.unit_price_pence)
    const key = `${r.billing_account_id}::${r.group_key ?? ''}`

    let group = groups.get(key)
    if (!group) {
      group = {
        accountId: r.billing_account_id,
        accountName: r.billing_account.name,
        accountStatus: r.billing_account.status,
        clientName: r.billing_account.client?.name ?? '',
        onHold: r.billing_account.status !== 'live',
        groupKey: r.group_key,
        charges: [],
        totalPence: 0,
      }
      groups.set(key, group)
    }
    group.charges.push({
      id: r.id,
      description: r.description,
      unitPricePence: r.unit_price_pence,
      quantity: qty || 1,
      amountPence,
      frequency: r.frequency,
      timing: r.timing,
      groupKey: r.group_key,
      nextDueDate: nextDueDate({
        frequency: r.frequency as never,
        last_invoiced_date: r.last_invoiced_date,
        start_date: r.start_date,
      }),
    })
    group.totalPence += amountPence
  }

  return Array.from(groups.values()).sort((a, b) => {
    const byAccount = a.accountName.localeCompare(b.accountName)
    if (byAccount !== 0) return byAccount
    return (a.groupKey ?? '').localeCompare(b.groupKey ?? '')
  })
}

/**
 * Create a draft recurring invoice from a set of due recurring charges under one
 * billing account. Each charge becomes an "other" line; the charge's
 * last_invoiced_date is stamped so it drops out of the due queue.
 */
export async function createInvoiceFromRecurringCharges(
  billingAccountId: string,
  chargeIds: string[],
): Promise<{ error: string | null; invoiceId?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  if (!billingAccountId) return { error: 'A billing account is required' }
  if (chargeIds.length === 0) return { error: 'Select at least one charge' }

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', billingAccountId)
    .single<BillingAccount>()
  if (!account) return { error: 'Billing account not found' }

  // Re-fetch charges server-side (trusted amounts) and confirm ownership + active.
  const { data: charges } = await supabase
    .from('recurring_charges')
    .select('id, description, unit_price_pence, quantity, tax_code, nominal_code')
    .in('id', chargeIds)
    .eq('billing_account_id', billingAccountId)
    .eq('active', true)

  const rows = (charges ?? []) as {
    id: string
    description: string
    unit_price_pence: number
    quantity: number | string
  }[]
  if (rows.length === 0) return { error: 'These charges are no longer available to invoice' }

  const now = new Date()
  const fy = financialYearOf(now)
  const { data: seq, error: seqError } = await supabase.rpc('next_invoice_seq', { p_fy: fy })
  if (seqError || typeof seq !== 'number') {
    return { error: seqError?.message || 'Could not allocate an invoice number' }
  }
  const invoiceNumber = formatInvoiceNumber(fy, seq)

  const billToAddress = [account.invoice_address, account.invoice_postcode]
    .filter(Boolean)
    .join('\n')

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      financial_year: fy,
      sequence: seq,
      billing_account_id: account.id,
      client_id: account.client_id,
      status: 'draft',
      origin: 'recurring',
      bill_to_name: account.invoice_contact_name || account.name,
      bill_to_address: billToAddress || null,
      bill_to_email: account.invoice_email,
      sage_account_ref: account.sage_account_ref,
      payment_terms_days: account.payment_terms_days ?? 30,
      tax_rate: DEFAULT_TAX_RATE,
      created_by: userId,
    })
    .select('id')
    .single()

  if (invError || !invoice) {
    return { error: invError?.message || 'Could not create the invoice' }
  }
  const invoiceId = invoice.id as string

  const lines = rows.map((r, i) => {
    const qty = typeof r.quantity === 'string' ? Number.parseFloat(r.quantity) : r.quantity
    const q = qty || 1
    return {
      invoice_id: invoiceId,
      kind: 'other' as const,
      description: r.description,
      quantity: q,
      unit_price_pence: r.unit_price_pence,
      amount_pence: lineAmountPence(q, r.unit_price_pence),
      sort_order: i,
    }
  })

  const { error: lineError } = await supabase.from('invoice_line_items').insert(lines)
  if (lineError) return { error: lineError.message }

  // Persist totals.
  const { subtotalPence, taxPence, totalPence } = computeInvoiceTotals(lines, DEFAULT_TAX_RATE)
  await supabase
    .from('invoices')
    .update({ subtotal_pence: subtotalPence, tax_pence: taxPence, total_pence: totalPence })
    .eq('id', invoiceId)

  // Stamp last_invoiced_date so these charges leave the due queue.
  await supabase
    .from('recurring_charges')
    .update({ last_invoiced_date: toISODate(now), updated_at: now.toISOString() })
    .in(
      'id',
      rows.map((r) => r.id),
    )

  revalidatePath('/dashboard/invoices')
  return { error: null, invoiceId }
}

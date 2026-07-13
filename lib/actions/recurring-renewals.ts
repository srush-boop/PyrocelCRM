'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile, RecurringCharge } from '@/lib/types/database'
import { sendEmail } from '@/lib/email/send-email'
import {
  buildRenewalNoticeHtml,
  renewalNoticeSubject,
} from '@/lib/email/renewal-notice-template'
import { MONTH_LABELS } from '@/lib/billing/recurring'

// Phase C: renewals. Charges are grouped/actioned by their renewal_month. A
// bulk increase applies immediately to the live price (writing a history row),
// then a renewal notice email tells the client the forthcoming-period price.

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

export interface RenewalRow extends Omit<RecurringCharge, 'billing_account'> {
  billing_account: {
    id: string
    name: string
    invoice_email: string | null
    invoice_contact_name: string | null
    client: { name: string; contact_email: string | null; contact_name: string | null } | null
  } | null
}

/**
 * Active, price-bearing charges whose renewal_month matches the requested month
 * (defaults to the current month). Grouped by billing account in the UI.
 */
export async function getRenewalsDue(month?: number): Promise<RenewalRow[]> {
  const supabase = await createClient()
  const targetMonth = month && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1

  const { data } = await supabase
    .from('recurring_charges')
    .select(
      '*, billing_account:billing_accounts(id, name, invoice_email, invoice_contact_name, client:clients(name, contact_email, contact_name))',
    )
    .eq('active', true)
    .eq('renewal_month', targetMonth)
    .order('description', { ascending: true })

  return (data ?? []) as RenewalRow[]
}

export interface BulkIncreaseInput {
  /** Charge ids to apply the increase to. */
  chargeIds: string[]
  /** Percentage increase, e.g. 5 for +5%. Mutually exclusive with fixedPence. */
  percent?: number | null
  /** Fixed pence increase applied to unit price. */
  fixedPence?: number | null
  /** Optional round result to nearest whole pound. */
  roundToPound?: boolean
  reason?: string | null
}

/**
 * Apply a bulk price increase immediately to the live unit price of each charge,
 * writing a price-history row per change. Returns how many were updated.
 */
export async function applyBulkIncrease(input: BulkIncreaseInput) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  if (!input.chargeIds?.length) return { error: 'No charges selected' }
  const pct = input.percent ?? null
  const fixed = input.fixedPence ?? null
  if ((pct === null || pct === 0) && (fixed === null || fixed === 0)) {
    return { error: 'Enter a percentage or fixed increase' }
  }

  const { data: charges } = await supabase
    .from('recurring_charges')
    .select('id, unit_price_pence')
    .in('id', input.chargeIds)

  const rows = (charges ?? []) as { id: string; unit_price_pence: number }[]
  if (!rows.length) return { error: 'Charges not found' }

  let updated = 0
  const reason = input.reason?.trim() || `Bulk increase${pct ? ` +${pct}%` : ''}`

  for (const row of rows) {
    const old = row.unit_price_pence
    let next = old
    if (pct) next = Math.round(next * (1 + pct / 100))
    if (fixed) next = next + fixed
    if (input.roundToPound) next = Math.round(next / 100) * 100
    next = Math.max(0, next)
    if (next === old) continue

    const { error } = await supabase
      .from('recurring_charges')
      .update({ unit_price_pence: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) continue

    await supabase.from('recurring_charge_price_history').insert({
      recurring_charge_id: row.id,
      old_price_pence: old,
      new_price_pence: next,
      reason,
      changed_by: userId,
    })
    updated += 1
  }

  revalidatePath('/dashboard/invoices/renewals')
  return { updated }
}

/**
 * Send a renewal notice email for a single billing account, covering all the
 * given (already-priced) charges. Stamps notice_sent_at on each charge.
 */
export async function sendRenewalNotice(billingAccountId: string, chargeIds: string[]) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  if (!chargeIds?.length) return { error: 'No charges to include' }

  const { data: account } = await supabase
    .from('billing_accounts')
    .select(
      'id, name, invoice_email, invoice_contact_name, client:clients(name, contact_email, contact_name)',
    )
    .eq('id', billingAccountId)
    .single()

  const acc = account as {
    id: string
    name: string
    invoice_email: string | null
    invoice_contact_name: string | null
    client: { name: string; contact_email: string | null; contact_name: string | null } | null
  } | null

  const recipient = acc?.invoice_email || acc?.client?.contact_email || null
  if (!recipient) {
    return { error: 'No invoice email on this billing account or its client.' }
  }

  const { data: charges } = await supabase
    .from('recurring_charges')
    .select('*')
    .in('id', chargeIds)
    .eq('billing_account_id', billingAccountId)

  const rows = (charges ?? []) as RecurringCharge[]
  if (!rows.length) return { error: 'Charges not found for this account' }

  const contactName = acc?.invoice_contact_name || acc?.client?.contact_name || null
  // Period label from the (shared) renewal month of the covered charges.
  const renewalMonth = rows.find((c) => c.renewal_month)?.renewal_month ?? null
  const periodLabel = renewalMonth
    ? `${MONTH_LABELS[renewalMonth - 1]} ${new Date().getFullYear()}`
    : `${new Date().getFullYear()}`
  const lines = rows.map((c) => ({
    description: c.description,
    frequency: c.frequency,
    newPricePence: c.unit_price_pence * c.quantity,
  }))

  const content = {
    accountName: acc?.name ?? 'Customer',
    contactName,
    periodLabel,
    lines,
  }
  const result = await sendEmail(recipient, renewalNoticeSubject(content), buildRenewalNoticeHtml(content))
  if (!result.success) {
    return { error: result.error || 'Failed to send renewal notice' }
  }

  await supabase
    .from('recurring_charges')
    .update({ notice_sent_at: new Date().toISOString() })
    .in('id', chargeIds)

  revalidatePath('/dashboard/invoices/renewals')
  return { success: true, sentTo: recipient }
}

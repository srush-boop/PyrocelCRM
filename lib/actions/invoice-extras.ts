'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'
import { financialYearOf, formatCreditNoteNumber } from '@/lib/billing/invoices'

// Phase D: credit notes + hold/release. Office/admin only (RLS also enforces).

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
  if (role !== 'admin' && role !== 'office') return { error: 'Not authorised' as const }
  return { supabase, userId: user.id }
}

// ---- Credit notes --------------------------------------------------------

/**
 * Raise a credit note against an issued or paid invoice. Copies the invoice's
 * line items across (kept positive — the CREDIT NOTE document itself represents
 * a credit), into a new draft the user can trim to a partial credit before
 * issuing. Gets its own CRN-YYYY-#### number.
 */
export async function raiseCreditNote(invoiceId: string) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  const { data: src } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()
  const invoice = src as
    | {
        id: string
        status: string
        document_type: string
        billing_account_id: string | null
        client_id: string | null
        po_number: string | null
        site_id: string | null
        site_address: string | null
        bill_to_name: string | null
        bill_to_address: string | null
        bill_to_email: string | null
        sage_account_ref: string | null
        payment_terms_days: number
        tax_rate: number
      }
    | null

  if (!invoice) return { error: 'Invoice not found' }
  if (invoice.document_type === 'credit_note') {
    return { error: 'You cannot raise a credit note against another credit note' }
  }
  if (invoice.status !== 'issued' && invoice.status !== 'paid') {
    return { error: 'Credit notes can only be raised against issued or paid invoices' }
  }

  // Allocate a credit-note number in the current financial year.
  const now = new Date()
  const fy = financialYearOf(now)
  const { data: seq, error: seqError } = await supabase.rpc('next_credit_note_seq', { p_fy: fy })
  if (seqError || typeof seq !== 'number') {
    return { error: seqError?.message || 'Could not allocate a credit-note number' }
  }
  const number = formatCreditNoteNumber(fy, seq)

  const { data: created, error: insError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: number,
      financial_year: fy,
      sequence: seq,
      document_type: 'credit_note',
      credited_invoice_id: invoice.id,
      status: 'draft',
      origin: 'adhoc',
      billing_account_id: invoice.billing_account_id,
      client_id: invoice.client_id,
      po_number: invoice.po_number,
      site_id: invoice.site_id,
      site_address: invoice.site_address,
      bill_to_name: invoice.bill_to_name,
      bill_to_address: invoice.bill_to_address,
      bill_to_email: invoice.bill_to_email,
      sage_account_ref: invoice.sage_account_ref,
      payment_terms_days: invoice.payment_terms_days ?? 0,
      tax_rate: invoice.tax_rate,
      notes: `Credit note against invoice ${invoiceId}`,
      created_by: userId,
    })
    .select('id')
    .single()

  if (insError || !created) {
    return { error: insError?.message || 'Could not create the credit note' }
  }
  const creditId = (created as { id: string }).id

  // Copy the source lines across.
  const { data: srcLines } = await supabase
    .from('invoice_line_items')
    .select(
      'task_id, part_id, kind, description, quantity, unit_price_pence, amount_pence, sort_order, nominal_code_id, nominal_code',
    )
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })

  const lines = (srcLines ?? []) as {
    task_id: string | null
    part_id: string | null
    kind: string
    description: string
    quantity: number
    unit_price_pence: number
    amount_pence: number
    sort_order: number
    nominal_code_id: string | null
    nominal_code: string | null
  }[]

  if (lines.length) {
    await supabase.from('invoice_line_items').insert(
      lines.map((l) => ({
        invoice_id: creditId,
        // Don't re-link tasks/parts — a credit note must never release calls
        // back to the chargeable queue.
        task_id: null,
        part_id: null,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unit_price_pence: l.unit_price_pence,
        amount_pence: l.amount_pence,
        sort_order: l.sort_order,
        // Carry the accounting code snapshot onto the credit note.
        nominal_code_id: l.nominal_code_id,
        nominal_code: l.nominal_code,
      })),
    )
  }

  // Compute totals on the new credit note.
  const subtotal = lines.reduce((s, l) => s + (l.amount_pence ?? 0), 0)
  const taxPence = Math.round((subtotal * (invoice.tax_rate ?? 0)) / 100)
  await supabase
    .from('invoices')
    .update({
      subtotal_pence: subtotal,
      tax_pence: taxPence,
      total_pence: subtotal + taxPence,
    })
    .eq('id', creditId)

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${creditId}`)
  return { id: creditId }
}

// ---- Hold / release (draft invoices) -------------------------------------

export async function holdInvoice(invoiceId: string, reason: string | null) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId } = auth

  const { data } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single()
  if ((data as { status: string } | null)?.status !== 'draft') {
    return { error: 'Only draft invoices can be put on hold' }
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      on_hold: true,
      hold_reason: reason?.trim() || null,
      held_at: new Date().toISOString(),
      held_by: userId,
    })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { success: true }
}

export async function releaseInvoice(invoiceId: string) {
  const auth = await requireManager()
  if ('error' in auth) return { error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('invoices')
    .update({ on_hold: false, hold_reason: null, held_at: null, held_by: null })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { success: true }
}

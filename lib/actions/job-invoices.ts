'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { InvoiceLineKind, Profile } from '@/lib/types/database'
import {
  computeInvoiceTotals,
  DEFAULT_TAX_RATE,
  financialYearOf,
  formatInvoiceNumber,
  lineAmountPence,
} from '@/lib/billing/invoices'

// Server actions for raising invoices from a job. Three billing modes:
//  - claim:     works-completed-to-date (percent of quoted net, or an amount)
//  - equipment: client-issued equipment (issued-but-un-invoiced quote lines)
//  - job_line:  selected quote lines billed directly
// All modes dedup against prior non-void invoice lines for the job so repeat
// invoices only bill the remainder. Money is in pence throughout.

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

// ---- Types shared with the UI -------------------------------------------

export interface JobQuoteLine {
  id: string
  description: string
  quantity: number
  unitPricePence: number
  lineTotalPence: number
  isService: boolean
  position: number
  /** Quantity recorded as issued/delivered to the client. */
  issuedQty: number
  /** Quantity already billed on prior (non-void) invoices for this line. */
  invoicedQty: number
  /** Net amount already billed against this line (non-void). */
  invoicedPence: number
}

export interface JobInvoiceData {
  jobId: string
  jobNumber: string | null
  title: string | null
  poNumber: string | null
  quotedNetPence: number
  /** Net already invoiced across all prior (non-void) invoices for the job. */
  invoicedNetPence: number
  /** Claim invoices raised so far (for "claim N" numbering). */
  claimCount: number
  hasBillingAccount: boolean
  lines: JobQuoteLine[]
}

// ---- Dedup: what has already been invoiced for this job -----------------

interface InvoicedTotals {
  netPence: number
  claimCount: number
  byQuoteLine: Map<string, { qty: number; pence: number }>
}

async function getJobInvoicedTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
): Promise<InvoicedTotals> {
  // Only count lines on invoices that are not void.
  const { data } = await supabase
    .from('invoice_line_items')
    .select(
      'kind, quantity, amount_pence, quote_line_item_id, invoice:invoices!inner(status, job_id)',
    )
    .eq('invoice.job_id', jobId)

  const rows = (data ?? []) as {
    kind: InvoiceLineKind
    quantity: number
    amount_pence: number
    quote_line_item_id: string | null
    invoice: { status: string } | { status: string }[]
  }[]

  const byQuoteLine = new Map<string, { qty: number; pence: number }>()
  let netPence = 0
  let claimCount = 0

  for (const r of rows) {
    const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
    if (!inv || inv.status === 'void') continue
    netPence += r.amount_pence || 0
    if (r.kind === 'job_claim') claimCount += 1
    if (r.quote_line_item_id) {
      const cur = byQuoteLine.get(r.quote_line_item_id) ?? { qty: 0, pence: 0 }
      cur.qty += Number(r.quantity) || 0
      cur.pence += r.amount_pence || 0
      byQuoteLine.set(r.quote_line_item_id, cur)
    }
  }

  return { netPence, claimCount, byQuoteLine }
}

// ---- Load everything the job-invoice dialog needs -----------------------

export async function getJobInvoiceData(
  jobId: string,
): Promise<{ error: string | null; data: JobInvoiceData | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised', data: null }
  const { supabase } = ctx

  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_number, title, po_number, quote_id, site_id, client_id, quoted_subtotal_pence')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found', data: null }
  const j = job as {
    id: string
    job_number: string | null
    title: string | null
    po_number: string | null
    quote_id: string | null
    site_id: string | null
    client_id: string | null
    quoted_subtotal_pence: number | null
  }

  // Quote lines (equipment vs service) for equipment / job_line modes.
  const { data: qlRows } = j.quote_id
    ? await supabase
        .from('quote_line_items')
        .select('id, description, quantity, unit_price_pence, line_total_pence, is_service, position')
        .eq('quote_id', j.quote_id)
        .order('position')
    : { data: [] }

  // Issued quantities per quote line.
  const { data: issuedRows } = await supabase
    .from('job_issued_items')
    .select('quote_line_item_id, quantity')
    .eq('job_id', jobId)
  const issuedByLine = new Map<string, number>()
  for (const r of (issuedRows ?? []) as { quote_line_item_id: string | null; quantity: number }[]) {
    if (!r.quote_line_item_id) continue
    issuedByLine.set(
      r.quote_line_item_id,
      (issuedByLine.get(r.quote_line_item_id) ?? 0) + (Number(r.quantity) || 0),
    )
  }

  const totals = await getJobInvoicedTotals(supabase, jobId)

  const lines: JobQuoteLine[] = (
    (qlRows ?? []) as {
      id: string
      description: string
      quantity: number
      unit_price_pence: number
      line_total_pence: number
      is_service: boolean
      position: number
    }[]
  ).map((q) => {
    const billed = totals.byQuoteLine.get(q.id) ?? { qty: 0, pence: 0 }
    return {
      id: q.id,
      description: q.description,
      quantity: Number(q.quantity) || 0,
      unitPricePence: q.unit_price_pence || 0,
      lineTotalPence: q.line_total_pence || 0,
      isService: !!q.is_service,
      position: q.position ?? 0,
      issuedQty: issuedByLine.get(q.id) ?? 0,
      invoicedQty: billed.qty,
      invoicedPence: billed.pence,
    }
  })

  // Can we resolve a billing account? Site override -> client default.
  const hasBillingAccount = await resolveJobBillingAccountId(supabase, j.site_id, j.client_id)
    .then((r) => !!r)
    .catch(() => false)

  return {
    error: null,
    data: {
      jobId: j.id,
      jobNumber: j.job_number,
      title: j.title,
      poNumber: j.po_number,
      quotedNetPence: j.quoted_subtotal_pence || 0,
      invoicedNetPence: totals.netPence,
      claimCount: totals.claimCount,
      hasBillingAccount,
      lines,
    },
  }
}

// Resolve the job's billing account id: site override, else client default.
async function resolveJobBillingAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string | null,
  clientId: string | null,
): Promise<string | null> {
  if (siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('billing_account_id')
      .eq('id', siteId)
      .single()
    const id = (site as { billing_account_id: string | null } | null)?.billing_account_id
    if (id) return id
  }
  if (clientId) {
    const { data: acc } = await supabase
      .from('billing_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('is_default', true)
      .maybeSingle()
    const id = (acc as { id: string } | null)?.id
    if (id) return id
  }
  return null
}

// ---- Create a job invoice ------------------------------------------------

export type JobInvoiceInput =
  | { mode: 'claim'; claimType: 'percent' | 'amount'; value: number }
  | { mode: 'equipment'; lines: { quoteLineItemId: string; quantity: number }[] }
  | { mode: 'job_line'; quoteLineItemIds: string[] }

export async function createJobInvoice(
  jobId: string,
  input: JobInvoiceInput,
): Promise<{ error: string | null; invoiceId?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_number, title, po_number, quote_id, site_id, client_id, status, quoted_subtotal_pence, department_id')
    .eq('id', jobId)
    .single()
  if (!job) return { error: 'Job not found' }
  const j = job as {
    id: string
    job_number: string | null
    title: string | null
    po_number: string | null
    quote_id: string | null
    site_id: string | null
    client_id: string | null
    status: string
    quoted_subtotal_pence: number | null
    department_id: string | null
  }
  if (j.status === 'cancelled') return { error: 'Cancelled jobs cannot be invoiced' }

  const accountId = await resolveJobBillingAccountId(supabase, j.site_id, j.client_id)
  if (!accountId) {
    return { error: 'No billing account is set for this job’s site or client' }
  }
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', accountId)
    .single()
  if (!account) return { error: 'Billing account not found' }
  const acc = account as Record<string, any>

  // Build the line items for the chosen mode (dedup-aware).
  const totals = await getJobInvoicedTotals(supabase, jobId)
  const lineLabel = j.job_number ? `Job ${j.job_number}` : j.title || 'Job'

  const draftLines: {
    kind: InvoiceLineKind
    description: string
    quantity: number
    unit_price_pence: number
    amount_pence: number
    quote_line_item_id: string | null
  }[] = []

  if (input.mode === 'claim') {
    const quotedNet = j.quoted_subtotal_pence || 0
    if (quotedNet <= 0) return { error: 'This job has no quoted value to claim against' }
    const remaining = Math.max(0, quotedNet - totals.netPence)
    let amount: number
    if (input.claimType === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(input.value) || 0))
      // Percent is of the whole contract; cap at what remains uninvoiced.
      amount = Math.min(remaining, Math.round((quotedNet * pct) / 100))
    } else {
      amount = Math.min(remaining, Math.round(Number(input.value) || 0))
    }
    if (amount <= 0) return { error: 'Nothing left to claim on this job' }
    const claimNo = totals.claimCount + 1
    draftLines.push({
      kind: 'job_claim',
      description: `${lineLabel} — works completed to date (claim ${claimNo})`,
      quantity: 1,
      unit_price_pence: amount,
      amount_pence: amount,
      quote_line_item_id: null,
    })
  } else if (input.mode === 'equipment') {
    // Bill selected issued-but-un-invoiced equipment quantities.
    if (!input.lines.length) return { error: 'Select at least one equipment line to invoice' }
    const { data: qlRows } = j.quote_id
      ? await supabase
          .from('quote_line_items')
          .select('id, description, unit_price_pence, quantity, is_service')
          .eq('quote_id', j.quote_id)
          .in(
            'id',
            input.lines.map((l) => l.quoteLineItemId),
          )
      : { data: [] }
    const byId = new Map(
      ((qlRows ?? []) as {
        id: string
        description: string
        unit_price_pence: number
        quantity: number
        is_service: boolean
      }[]).map((q) => [q.id, q]),
    )
    for (const sel of input.lines) {
      const q = byId.get(sel.quoteLineItemId)
      if (!q) continue
      const billed = totals.byQuoteLine.get(q.id)?.qty ?? 0
      const remainingQty = Math.max(0, (Number(q.quantity) || 0) - billed)
      const qty = Math.min(remainingQty, Math.max(0, Number(sel.quantity) || 0))
      if (qty <= 0) continue
      draftLines.push({
        kind: 'equipment',
        description: `${q.description} — ${lineLabel}`,
        quantity: qty,
        unit_price_pence: q.unit_price_pence || 0,
        amount_pence: lineAmountPence(qty, q.unit_price_pence || 0),
        quote_line_item_id: q.id,
      })
    }
    if (!draftLines.length) return { error: 'Selected equipment has already been fully invoiced' }
  } else {
    // job_line: bill selected quote lines in full (minus anything already billed).
    if (!input.quoteLineItemIds.length) return { error: 'Select at least one quote line' }
    const { data: qlRows } = j.quote_id
      ? await supabase
          .from('quote_line_items')
          .select('id, description, unit_price_pence, quantity, line_total_pence')
          .eq('quote_id', j.quote_id)
          .in('id', input.quoteLineItemIds)
          .order('position')
      : { data: [] }
    for (const q of (qlRows ?? []) as {
      id: string
      description: string
      unit_price_pence: number
      quantity: number
      line_total_pence: number
    }[]) {
      // Skip lines already billed (dedup by quote line).
      if (totals.byQuoteLine.has(q.id)) continue
      const qty = Number(q.quantity) || 1
      draftLines.push({
        kind: 'job_line',
        description: `${q.description} — ${lineLabel}`,
        quantity: qty,
        unit_price_pence: q.unit_price_pence || 0,
        amount_pence: q.line_total_pence || lineAmountPence(qty, q.unit_price_pence || 0),
        quote_line_item_id: q.id,
      })
    }
    if (!draftLines.length) return { error: 'Selected lines have already been invoiced' }
  }

  // Site address snapshot for the invoice header.
  let siteAddress: string | null = null
  if (j.site_id) {
    const { data: site } = await supabase
      .from('sites')
      .select('address, postcode')
      .eq('id', j.site_id)
      .single()
    const s = site as { address: string | null; postcode: string | null } | null
    siteAddress = s ? [s.address, s.postcode].filter(Boolean).join('\n') || null : null
  }

  // Reserve an invoice number for the current financial year.
  const now = new Date()
  const fy = financialYearOf(now)
  const { data: seq, error: seqError } = await supabase.rpc('next_invoice_seq', { p_fy: fy })
  if (seqError || typeof seq !== 'number') {
    return { error: seqError?.message || 'Could not allocate an invoice number' }
  }
  const invoiceNumber = formatInvoiceNumber(fy, seq)

  const billToAddress = [acc.invoice_address, acc.invoice_postcode].filter(Boolean).join('\n')

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      financial_year: fy,
      sequence: seq,
      billing_account_id: acc.id,
      client_id: acc.client_id,
      job_id: j.id,
      status: 'draft',
      po_number: j.po_number || null,
      site_id: j.site_id,
      site_address: siteAddress,
      bill_to_name: acc.invoice_contact_name || acc.name,
      bill_to_address: billToAddress || null,
      bill_to_email: acc.invoice_email,
      sage_account_ref: acc.sage_account_ref,
      payment_terms_days: acc.payment_terms_days ?? 30,
      tax_rate: DEFAULT_TAX_RATE,
      created_by: userId,
    })
    .select('id')
    .single()

  if (invError || !invoice) {
    return { error: invError?.message || 'Could not create the invoice' }
  }
  const invoiceId = (invoice as { id: string }).id

  // Resolve the job's department nominal code (jobs have no service type, so the
  // department code is the only auto-source here) and snapshot its text.
  let jobNominalId: string | null = null
  let jobNominalText: string | null = null
  if (j.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('nominal_code_id')
      .eq('id', j.department_id)
      .single()
    jobNominalId = (dept as { nominal_code_id: string | null } | null)?.nominal_code_id ?? null
    if (jobNominalId) {
      const { data: nc } = await supabase
        .from('nominal_codes')
        .select('code')
        .eq('id', jobNominalId)
        .single()
      jobNominalText = (nc as { code: string } | null)?.code ?? null
    }
  }

  const { error: liError } = await supabase.from('invoice_line_items').insert(
    draftLines.map((l, i) => ({
      invoice_id: invoiceId,
      task_id: null,
      part_id: null,
      job_id: j.id,
      quote_line_item_id: l.quote_line_item_id,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      amount_pence: l.amount_pence,
      sort_order: i,
      nominal_code_id: jobNominalId,
      nominal_code: jobNominalText,
    })),
  )
  if (liError) {
    await supabase.from('invoices').delete().eq('id', invoiceId)
    return { error: liError.message }
  }

  await recomputeTotals(supabase, invoiceId)

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/jobs/${jobId}`)
  return { error: null, invoiceId }
}

// ---- Record issued equipment --------------------------------------------

export async function recordJobIssuedItems(
  jobId: string,
  items: { quoteLineItemId: string; quantity: number; note?: string | null }[],
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const rows = items
    .filter((i) => (Number(i.quantity) || 0) !== 0)
    .map((i) => ({
      job_id: jobId,
      quote_line_item_id: i.quoteLineItemId,
      quantity: Number(i.quantity) || 0,
      note: i.note?.trim() || null,
      issued_by: userId,
    }))
  if (!rows.length) return { error: 'Enter at least one issued quantity' }

  const { error } = await supabase.from('job_issued_items').insert(rows)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/jobs/${jobId}`)
  return { error: null }
}

// ---- Totals (local copy; mirrors invoices.ts) ---------------------------

async function recomputeTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('tax_rate')
    .eq('id', invoiceId)
    .single()
  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('amount_pence')
    .eq('invoice_id', invoiceId)

  const { subtotalPence, taxPence, totalPence } = computeInvoiceTotals(
    (lines ?? []) as { amount_pence: number }[],
    (inv as { tax_rate: number } | null)?.tax_rate ?? DEFAULT_TAX_RATE,
  )

  await supabase
    .from('invoices')
    .update({
      subtotal_pence: subtotalPence,
      tax_pence: taxPence,
      total_pence: totalPence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
}

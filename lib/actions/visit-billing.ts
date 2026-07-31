'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeInvoiceTotals,
  financialYearOf,
  formatInvoiceNumber,
} from '@/lib/billing/invoices'
import { perVisitAmountPence, systemServiceLabel } from '@/lib/billing/recurring'
import { getCompanyTaxConfig } from '@/lib/billing/company-tax'
import type { RecurringCharge } from '@/lib/types/database'

// Per-visit "invoice on completion" engine.
//
// When a recurring service visit completes, any `per_visit` recurring charge on
// that service is billed a share of its full annual value (see
// lib/billing/recurring.ts for the split maths). Each (charge × visit) is
// recorded once in `recurring_visit_billings` — the UNIQUE(charge, task)
// constraint makes the whole thing idempotent, so completing/submitting a visit
// repeatedly never double-bills.
//
// Runs with the service-role client because the engineer who completes a visit
// has no billing-manager RLS access. It is deliberately best-effort and safe to
// call from the completion flow: the recurring due queue is the backstop for any
// visit this misses.

export interface VisitBillingResult {
  error: string | null
  /** Draft invoice ids created (or appended to) by this call. */
  invoiceIds?: string[]
  /** Number of charge-visits billed by this call (0 when already billed). */
  billedCount?: number
}

interface ChargeRow {
  id: string
  billing_account_id: string
  site_service_id: string | null
  description: string
  unit_price_pence: number
  quantity: number | string
  frequency: RecurringCharge['frequency']
  timing: string
  visits_per_cycle: number | null
  group_key: string | null
  nominal_code_id: string | null
  nominal_code: string | null
  site_service?: {
    service_type?: { name: string | null } | null
    site_system?: {
      name: string | null
      system_type?: { name: string | null } | null
    } | null
  } | null
}

/**
 * Bill every `per_visit` recurring charge on a completed visit's service.
 * Idempotent and side-effect-safe; returns the drafts touched.
 */
export async function generateVisitCompletionInvoice(
  taskId: string,
): Promise<VisitBillingResult> {
  if (!taskId) return { error: 'A task id is required' }

  // Caller must be an authenticated user (the completing engineer). Privileged
  // work then runs through the service-role client.
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const db = createAdminClient()
  // Company-level VAT rate applied to every invoice this creates.
  const { rate: taxRate } = await getCompanyTaxConfig()

  // The visit must be a genuine, completed PPM service visit. Remedials,
  // emergencies, commissioning and follow-ups are not part of the recurring
  // visit cycle and never trigger a per-visit split.
  const { data: task } = await db
    .from('tasks')
    .select(
      'id, status, site_service_id, is_remedial, is_emergency, is_commissioning, follow_up_to_id',
    )
    .eq('id', taskId)
    .single<{
      id: string
      status: string
      site_service_id: string | null
      is_remedial: boolean
      is_emergency: boolean
      is_commissioning: boolean
      follow_up_to_id: string | null
    }>()

  if (!task) return { error: 'Task not found' }
  if (task.status !== 'completed') return { error: null, billedCount: 0 }
  if (!task.site_service_id) return { error: null, billedCount: 0 }
  if (
    task.is_remedial ||
    task.is_emergency ||
    task.is_commissioning ||
    task.follow_up_to_id
  ) {
    return { error: null, billedCount: 0 }
  }

  // The service's visit interval drives the default split denominator.
  const { data: service } = await db
    .from('site_services')
    .select('id, frequency_months')
    .eq('id', task.site_service_id)
    .single<{ id: string; frequency_months: number | null }>()
  const frequencyMonths = service?.frequency_months ?? null

  // Active per_visit charges on this service.
  const { data: chargeData } = await db
    .from('recurring_charges')
    .select(
      `id, billing_account_id, site_service_id, description, unit_price_pence, quantity,
       frequency, timing, visits_per_cycle, group_key, nominal_code_id, nominal_code,
       site_service:site_services(
         service_type:service_types(name),
         site_system:site_systems(name, system_type:system_types(name))
       )`,
    )
    .eq('site_service_id', task.site_service_id)
    .eq('timing', 'per_visit')
    .eq('active', true)

  const charges = (chargeData ?? []) as ChargeRow[]
  if (charges.length === 0) return { error: null, billedCount: 0 }

  // Drop charges already billed for this visit (idempotency).
  const { data: existing } = await db
    .from('recurring_visit_billings')
    .select('recurring_charge_id, invoice_id')
    .eq('task_id', taskId)
  const alreadyBilled = new Set(
    (existing ?? []).map((r: { recurring_charge_id: string }) => r.recurring_charge_id),
  )
  const todo = charges.filter((c) => !alreadyBilled.has(c.id))
  if (todo.length === 0) {
    const invoiceIds = Array.from(
      new Set(
        (existing ?? [])
          .map((r: { invoice_id: string | null }) => r.invoice_id)
          .filter((v): v is string => !!v),
      ),
    )
    return { error: null, billedCount: 0, invoiceIds }
  }

  // Nominal-code text snapshot lookup for any charge lacking the text form.
  const { data: ncRows } = await db.from('nominal_codes').select('id, code')
  const nominalText = new Map<string, string>(
    (ncRows ?? []).map((n: { id: string; code: string }) => [n.id, n.code]),
  )

  // Group the outstanding charges by billing account → one draft invoice each.
  const byAccount = new Map<string, ChargeRow[]>()
  for (const c of todo) {
    const list = byAccount.get(c.billing_account_id) ?? []
    list.push(c)
    byAccount.set(c.billing_account_id, list)
  }

  const now = new Date()
  const invoiceIds: string[] = []
  let billedCount = 0

  for (const [accountId, accountCharges] of byAccount) {
    const { data: account } = await db
      .from('billing_accounts')
      .select(
        'id, name, client_id, invoice_address, invoice_postcode, invoice_contact_name, invoice_email, sage_account_ref, payment_terms_days',
      )
      .eq('id', accountId)
      .single<{
        id: string
        name: string
        client_id: string | null
        invoice_address: string | null
        invoice_postcode: string | null
        invoice_contact_name: string | null
        invoice_email: string | null
        sage_account_ref: string | null
        payment_terms_days: number | null
      }>()
    if (!account) continue

    // Compute each charge's share first so we can skip creating an empty invoice.
    const prepared: {
      charge: ChargeRow
      amountPence: number
      cycleIndex: number
      visitsInCycle: number
    }[] = []
    for (const charge of accountCharges) {
      // Prior billings for THIS charge (across all visits) set the cycle position.
      const { count: priorCount } = await db
        .from('recurring_visit_billings')
        .select('id', { count: 'exact', head: true })
        .eq('recurring_charge_id', charge.id)

      const qty =
        typeof charge.quantity === 'string'
          ? Number.parseFloat(charge.quantity)
          : charge.quantity
      const { amountPence, cycleIndex, visitsInCycle } = perVisitAmountPence(
        {
          unit_price_pence: charge.unit_price_pence,
          quantity: qty || 1,
          frequency: charge.frequency,
          visits_per_cycle: charge.visits_per_cycle,
        },
        frequencyMonths,
        priorCount ?? 0,
      )
      prepared.push({ charge, amountPence, cycleIndex, visitsInCycle })
    }

    if (prepared.length === 0) continue

    // Allocate an invoice number and create the draft.
    const fy = financialYearOf(now)
    const { data: seq, error: seqError } = await db.rpc('next_invoice_seq', { p_fy: fy })
    if (seqError || typeof seq !== 'number') continue
    const invoiceNumber = formatInvoiceNumber(fy, seq)
    const billToAddress = [account.invoice_address, account.invoice_postcode]
      .filter(Boolean)
      .join('\n')

    const { data: invoice, error: invError } = await db
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
        tax_rate: taxRate,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (invError || !invoice) continue
    const invoiceId = invoice.id as string

    // Insert one line per charge, capturing the line id for the ledger row.
    const lines = prepared.map((p, i) => {
      // Prefix the service type + system type so the per-visit recurring line
      // reads e.g. "Annual maintenance — Fire Alarm / Inspection · visit 1 of 4".
      const label = systemServiceLabel({
        systemName: p.charge.site_service?.site_system?.name,
        systemTypeName: p.charge.site_service?.site_system?.system_type?.name,
        serviceName: p.charge.site_service?.service_type?.name,
      })
      const visitSuffix = `visit ${p.cycleIndex + 1} of ${p.visitsInCycle}`
      const suffix = [label, visitSuffix].filter(Boolean).join(' \u00b7 ')
      return {
      invoice_id: invoiceId,
      kind: 'other' as const,
      description: `${p.charge.description} \u2014 ${suffix}`,
      quantity: 1,
      unit_price_pence: p.amountPence,
      amount_pence: p.amountPence,
      sort_order: i,
      site_service_id: p.charge.site_service_id,
      task_id: taskId,
      nominal_code_id: p.charge.nominal_code_id ?? null,
      nominal_code:
        p.charge.nominal_code ??
        (p.charge.nominal_code_id ? nominalText.get(p.charge.nominal_code_id) ?? null : null),
      }
    })

    const { data: insertedLines, error: lineError } = await db
      .from('invoice_line_items')
      .insert(lines)
      .select('id, sort_order')
    if (lineError || !insertedLines) {
      // Roll back the empty invoice so we don't leave an orphan draft.
      await db.from('invoices').delete().eq('id', invoiceId)
      continue
    }

    const lineIdBySort = new Map<number, string>(
      (insertedLines as { id: string; sort_order: number }[]).map((l) => [l.sort_order, l.id]),
    )

    // Ledger rows — the idempotency guard. On a unique-violation race, skip.
    const ledgerRows = prepared.map((p, i) => ({
      recurring_charge_id: p.charge.id,
      task_id: taskId,
      invoice_id: invoiceId,
      invoice_line_item_id: lineIdBySort.get(i) ?? null,
      cycle_index: p.cycleIndex,
      visits_in_cycle: p.visitsInCycle,
      amount_pence: p.amountPence,
    }))
    const { error: ledgerError } = await db
      .from('recurring_visit_billings')
      .insert(ledgerRows)
    if (ledgerError) {
      // Another completion beat us to it — discard our duplicate invoice + lines.
      await db.from('invoices').delete().eq('id', invoiceId)
      continue
    }

    // Persist invoice totals.
    const { subtotalPence, taxPence, totalPence } = computeInvoiceTotals(lines, taxRate)
    await db
      .from('invoices')
      .update({ subtotal_pence: subtotalPence, tax_pence: taxPence, total_pence: totalPence })
      .eq('id', invoiceId)

    invoiceIds.push(invoiceId)
    billedCount += prepared.length
  }

  return { error: null, invoiceIds, billedCount }
}

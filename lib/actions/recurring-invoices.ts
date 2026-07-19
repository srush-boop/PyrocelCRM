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
import {
  isDueNow,
  nextDueDate,
  toISODate,
  perVisitAmountPence,
  formatCoveragePeriod,
  systemServiceLabel,
} from '@/lib/billing/recurring'
import { generateVisitCompletionInvoice } from '@/lib/actions/visit-billing'
import { resolveCustomerPo } from '@/lib/billing/customer-po'

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
  /** "System / Service" this charge relates to, when linked to a site_service. */
  systemService: string | null
  /** Human label of the period this occurrence covers, e.g. "Jul–Sep 2026". */
  coveragePeriod: string
  /** For per_visit charges: completed visits awaiting billing (drives the raise). */
  perVisitTaskIds?: string[]
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
  visits_per_cycle: number | null
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
  site_service: {
    service_type: { name: string } | null
    site_system: {
      name: string | null
      system_type: { name: string } | null
    } | null
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
      quantity, frequency, timing, visits_per_cycle, group_key, active, start_date, last_invoiced_date,
      billing_account:billing_accounts(id, name, status, client_id, client:clients(name)),
      site_service:site_services(
        service_type:service_types(name),
        site_system:site_systems(name, system_type:system_types(name))
      )
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

  // --- per_visit backstop -------------------------------------------------
  // For per_visit charges, surface any completed, eligible PPM visit that has
  // not yet been billed for the charge (i.e. has no recurring_visit_billings
  // row). Amounts use the same split maths as the completion engine so the
  // queue total matches what raising will actually invoice.
  const perVisitCharges = rows.filter((r) => r.timing === 'per_visit' && r.site_service_id)
  // chargeId -> { taskIds (unbilled, oldest first), amountPence (sum of shares) }
  const perVisitDue = new Map<string, { taskIds: string[]; amountPence: number }>()
  if (perVisitCharges.length > 0) {
    const serviceIds = Array.from(new Set(perVisitCharges.map((r) => r.site_service_id as string)))

    // Service visit intervals drive the default split denominator.
    const { data: svcRows } = await supabase
      .from('site_services')
      .select('id, frequency_months')
      .in('id', serviceIds)
    const freqByService = new Map<string, number | null>(
      (svcRows ?? []).map((s: { id: string; frequency_months: number | null }) => [
        s.id,
        s.frequency_months,
      ]),
    )

    // Completed, genuinely-recurring visits per service (exclude remedial /
    // emergency / commissioning / follow-up, matching the engine).
    const { data: pvTasks } = await supabase
      .from('tasks')
      .select(
        'id, site_service_id, completed_at, is_remedial, is_emergency, is_commissioning, follow_up_to_id',
      )
      .in('site_service_id', serviceIds)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true })
    const eligibleByService = new Map<string, { id: string }[]>()
    for (const t of (pvTasks ?? []) as {
      id: string
      site_service_id: string
      is_remedial: boolean
      is_emergency: boolean
      is_commissioning: boolean
      follow_up_to_id: string | null
    }[]) {
      if (t.is_remedial || t.is_emergency || t.is_commissioning || t.follow_up_to_id) continue
      const list = eligibleByService.get(t.site_service_id) ?? []
      list.push({ id: t.id })
      eligibleByService.set(t.site_service_id, list)
    }

    // Already-billed (charge, task) pairs.
    const { data: billed } = await supabase
      .from('recurring_visit_billings')
      .select('recurring_charge_id, task_id')
      .in(
        'recurring_charge_id',
        perVisitCharges.map((r) => r.id),
      )
    const billedByCharge = new Map<string, Set<string>>()
    let priorCountByCharge = new Map<string, number>()
    for (const b of (billed ?? []) as { recurring_charge_id: string; task_id: string }[]) {
      const set = billedByCharge.get(b.recurring_charge_id) ?? new Set<string>()
      set.add(b.task_id)
      billedByCharge.set(b.recurring_charge_id, set)
      priorCountByCharge.set(
        b.recurring_charge_id,
        (priorCountByCharge.get(b.recurring_charge_id) ?? 0) + 1,
      )
    }

    for (const c of perVisitCharges) {
      const eligible = eligibleByService.get(c.site_service_id as string) ?? []
      const billedSet = billedByCharge.get(c.id) ?? new Set<string>()
      const unbilled = eligible.filter((t) => !billedSet.has(t.id))
      if (unbilled.length === 0) continue

      const qty = typeof c.quantity === 'string' ? Number.parseFloat(c.quantity) : c.quantity
      let prior = priorCountByCharge.get(c.id) ?? 0
      let total = 0
      for (const _t of unbilled) {
        const { amountPence } = perVisitAmountPence(
          {
            unit_price_pence: c.unit_price_pence,
            quantity: qty || 1,
            frequency: c.frequency as never,
            visits_per_cycle: c.visits_per_cycle,
          },
          freqByService.get(c.site_service_id as string) ?? null,
          prior,
        )
        total += amountPence
        prior += 1
      }
      perVisitDue.set(c.id, { taskIds: unbilled.map((t) => t.id), amountPence: total })
    }
  }

  function isCharDue(r: ChargeRow): boolean {
    if (r.timing === 'per_visit') return perVisitDue.has(r.id)
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
    const pv = r.timing === 'per_visit' ? perVisitDue.get(r.id) : undefined
    const amountPence = pv ? pv.amountPence : lineAmountPence(qty || 1, r.unit_price_pence)
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
    const dueDate = nextDueDate({
      frequency: r.frequency as never,
      last_invoiced_date: r.last_invoiced_date,
      start_date: r.start_date,
    })
    group.charges.push({
      id: r.id,
      description: r.description,
      unitPricePence: r.unit_price_pence,
      quantity: qty || 1,
      amountPence,
      frequency: r.frequency,
      timing: r.timing,
      groupKey: r.group_key,
      nextDueDate: dueDate,
      systemService: systemServiceLabel({
        systemName: r.site_service?.site_system?.name,
        systemTypeName: r.site_service?.site_system?.system_type?.name,
        serviceName: r.site_service?.service_type?.name,
      }),
      coveragePeriod: formatCoveragePeriod(
        { frequency: r.frequency as never, timing: r.timing as never },
        dueDate,
      ),
      perVisitTaskIds: pv?.taskIds,
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
    .select(
      `id, description, unit_price_pence, quantity, tax_code, nominal_code, nominal_code_id,
       timing, site_service_id, frequency, start_date, last_invoiced_date,
       site:sites(po_number, client:clients(po_number)),
       client:clients(po_number),
       site_service:site_services(
         po_number,
         service_type:service_types(name),
         site_system:site_systems(name, po_number, system_type:system_types(name)),
         site:sites(po_number, client:clients(po_number))
       )`,
    )
    .in('id', chargeIds)
    .eq('billing_account_id', billingAccountId)
    .eq('active', true)

  const allRows = (charges ?? []) as unknown as {
    id: string
    description: string
    unit_price_pence: number
    quantity: number | string
    nominal_code_id: string | null
    timing: string
    site_service_id: string | null
    frequency: string
    start_date: string | null
    last_invoiced_date: string | null
    site: { po_number: string | null; client: { po_number: string | null } | null } | null
    client: { po_number: string | null } | null
    site_service: {
      po_number: string | null
      service_type: { name: string } | null
      site_system: {
        name: string | null
        po_number: string | null
        system_type: { name: string } | null
      } | null
      site: { po_number: string | null; client: { po_number: string | null } | null } | null
    } | null
  }[]
  if (allRows.length === 0) return { error: 'These charges are no longer available to invoice' }

  // Per-visit charges are billed through the completion engine (correct split +
  // idempotency ledger), never via the flat full-amount path below. Raise them
  // first by replaying each affected charge's unbilled completed visits.
  const perVisitRows = allRows.filter((r) => r.timing === 'per_visit')
  const engineInvoiceIds: string[] = []
  if (perVisitRows.length > 0) {
    const serviceIds = Array.from(
      new Set(perVisitRows.map((r) => r.site_service_id).filter((v): v is string => !!v)),
    )
    if (serviceIds.length > 0) {
      // Completed, genuinely-recurring visits on the affected services.
      const { data: pvTasks } = await supabase
        .from('tasks')
        .select(
          'id, completed_at, is_remedial, is_emergency, is_commissioning, follow_up_to_id',
        )
        .in('site_service_id', serviceIds)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: true })
      // Visits already fully billed for every selected per_visit charge are skipped
      // naturally by the engine's ledger; we just replay all completed visits.
      const taskIds = Array.from(
        new Set(
          ((pvTasks ?? []) as {
            id: string
            is_remedial: boolean
            is_emergency: boolean
            is_commissioning: boolean
            follow_up_to_id: string | null
          }[])
            .filter(
              (t) =>
                !t.is_remedial && !t.is_emergency && !t.is_commissioning && !t.follow_up_to_id,
            )
            .map((t) => t.id),
        ),
      )
      for (const tId of taskIds) {
        const res = await generateVisitCompletionInvoice(tId)
        for (const id of res.invoiceIds ?? []) {
          if (!engineInvoiceIds.includes(id)) engineInvoiceIds.push(id)
        }
      }
    }
  }

  // Remaining (advance/arrears/on_completion) charges use the flat path.
  const rows = allRows.filter((r) => r.timing !== 'per_visit')
  if (rows.length === 0) {
    revalidatePath('/dashboard/invoices')
    return { error: null, invoiceId: engineInvoiceIds[0] }
  }

  // Map nominal-code id → code text for a stable per-line snapshot.
  const { data: ncRows } = await supabase.from('nominal_codes').select('id, code')
  const nominalText = new Map<string, string>((ncRows ?? []).map((n: any) => [n.id, n.code]))

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
    // Append the system/service and coverage period so the invoice line reads
    // e.g. "Annual maintenance — Fire Alarm / Inspection · Jul–Sep 2026".
    const label = systemServiceLabel({
      systemName: r.site_service?.site_system?.name,
      systemTypeName: r.site_service?.site_system?.system_type?.name,
      serviceName: r.site_service?.service_type?.name,
    })
    const dueDate = nextDueDate({
      frequency: r.frequency as never,
      last_invoiced_date: r.last_invoiced_date,
      start_date: r.start_date,
    })
    const period = formatCoveragePeriod(
      { frequency: r.frequency as never, timing: r.timing as never },
      dueDate,
    )
    const suffix = [label, period].filter(Boolean).join(' \u00b7 ')
    const description = suffix ? `${r.description} \u2014 ${suffix}` : r.description
    // Resolve the customer PO from the charge -> system -> site -> client chain
    // and snapshot it onto the line so it survives later source edits.
    const customerPo = resolveCustomerPo({
      servicePo: r.site_service?.po_number,
      systemPo: r.site_service?.site_system?.po_number,
      sitePo: r.site_service?.site?.po_number ?? r.site?.po_number,
      clientPo: r.site_service?.site?.client?.po_number ?? r.site?.client?.po_number ?? r.client?.po_number,
    })
    return {
      invoice_id: invoiceId,
      kind: 'other' as const,
      description,
      quantity: q,
      unit_price_pence: r.unit_price_pence,
      amount_pence: lineAmountPence(q, r.unit_price_pence),
      sort_order: i,
      site_service_id: r.site_service_id ?? null,
      customer_po: customerPo,
      nominal_code_id: r.nominal_code_id ?? null,
      nominal_code: r.nominal_code_id ? nominalText.get(r.nominal_code_id) ?? null : null,
    }
  })

  const { error: lineError } = await supabase.from('invoice_line_items').insert(lines)
  if (lineError) return { error: lineError.message }

  // Persist totals. When every line resolved to the same customer PO, also set
  // it as the invoice header PO (a mix of POs stays per-line only).
  const { subtotalPence, taxPence, totalPence } = computeInvoiceTotals(lines, DEFAULT_TAX_RATE)
  const distinctPos = Array.from(new Set(lines.map((l) => l.customer_po).filter(Boolean)))
  const headerPo = distinctPos.length === 1 ? distinctPos[0] : null
  await supabase
    .from('invoices')
    .update({
      subtotal_pence: subtotalPence,
      tax_pence: taxPence,
      total_pence: totalPence,
      ...(headerPo ? { po_number: headerPo } : {}),
    })
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

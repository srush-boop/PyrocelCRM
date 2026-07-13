'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  BillingAccount,
  BillingFrequency,
  InvoiceLineKind,
  Profile,
} from '@/lib/types/database'
import { resolveBillingAccount } from '@/lib/billing/resolve-billing-account'
import {
  billingDueHint,
  computeInvoiceTotals,
  DEFAULT_TAX_RATE,
  financialYearOf,
  formatInvoiceNumber,
  lineAmountPence,
} from '@/lib/billing/invoices'
import {
  computeOnSiteHours,
  deriveRateBand,
  priceCall,
  resolveRateCard,
  RATE_BAND_LABELS,
  toLocalISODate,
  type RateCard,
} from '@/lib/billing/rate-cards'

// Server actions for Phase 3 invoicing: build CRM invoices from reviewed
// chargeable calls (grouped by billing account), edit line items, and move
// invoices through draft -> issued -> paid (or void). Office/admin only; RLS
// also enforces this at the database level.

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

// ---- Rate card loading (for auto-priced labour) -------------------------

interface RateCardRow {
  id: string
  name: string
  is_default: boolean
  include_travel_time: boolean
  min_labour_hours: number | string
  round_increment_hours: number | string
  active: boolean
  bands:
    | {
        band: string
        attendance_fee_pence: number
        attendance_included_hours: number | string
        hourly_rate_pence: number
      }[]
    | null
}

// numeric columns can arrive as strings; coerce defensively.
function mapRateCard(row: RateCardRow): RateCard {
  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
    include_travel_time: row.include_travel_time,
    min_labour_hours: Number(row.min_labour_hours) || 0,
    round_increment_hours: Number(row.round_increment_hours) || 0,
    active: row.active,
    bands: (row.bands ?? []).map((b) => ({
      band: b.band as RateCard['bands'][number]['band'],
      attendance_fee_pence: Number(b.attendance_fee_pence) || 0,
      attendance_included_hours: Number(b.attendance_included_hours) || 0,
      hourly_rate_pence: Number(b.hourly_rate_pence) || 0,
    })),
  }
}

async function loadRateCards(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ cardsById: Map<string, RateCard>; defaultCard: RateCard | null }> {
  const { data } = await supabase
    .from('rate_cards')
    .select('*, bands:rate_card_bands(band, attendance_fee_pence, attendance_included_hours, hourly_rate_pence)')
  const cards = ((data ?? []) as RateCardRow[]).map(mapRateCard)
  const cardsById = new Map(cards.map((c) => [c.id, c]))
  const defaultCard = cards.find((c) => c.is_default && c.active) ?? null
  return { cardsById, defaultCard }
}

// All UK bank holidays as a Set of local yyyy-mm-dd for band derivation.
async function loadBankHolidays(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('calendar_entries')
    .select('start_at')
    .eq('source', 'uk-bank-holiday')
  const set = new Set<string>()
  for (const row of (data ?? []) as { start_at: string | null }[]) {
    if (row.start_at) set.add(toLocalISODate(new Date(row.start_at)))
  }
  return set
}

// ---- Ready-to-invoice grouping -----------------------------------------

export interface ReadyPart {
  id: string
  name: string
  quantity: number
  unitPricePence: number
  amountPence: number
}

export interface ReadyTask {
  id: string
  reference: string
  siteName: string
  serviceName: string
  completedAt: string | null
  parts: ReadyPart[]
  partsTotalPence: number
}

export interface ReadyGroup {
  accountId: string | null
  accountName: string
  accountStatus: string | null
  clientName: string
  onHold: boolean
  /** Client prefers one invoice per call; UI leads with per-call raising. */
  invoiceCallsIndividually: boolean
  /** Inform-only cadence hint (never blocks raising). */
  billingFrequency: BillingFrequency
  /** Human due hint derived from cadence + last issued invoice, or null. */
  dueHint: { due: boolean; label: string } | null
  tasks: ReadyTask[]
  partsTotalPence: number
}

/**
 * Load reviewed chargeable calls that have not yet been placed on an invoice,
 * resolve each call's billing account (service -> site -> client default) and
 * group them so the office can raise one invoice per billing account.
 */
export async function getReadyToInvoiceGroups(): Promise<ReadyGroup[]> {
  const supabase = await createClient()

  const [{ data: tasks }, { data: accounts }] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        `
        id, completed_at, client_id, site_id, site_service_id,
        task_result:task_results(reference_number),
        direct_site:sites!tasks_site_id_fkey(id, name, billing_account_id, client_id, clients(id, name, invoice_calls_individually)),
        site_service:site_services(
          id, billing_account_id,
          service_type:service_types(name),
          sites(id, name, billing_account_id, client_id, clients(id, name, invoice_calls_individually))
        ),
        call_parts(id, quantity, unit_cost_pence, sale_unit_price_pence, chargeable, part:parts(name, sku))
      `,
      )
      .eq('status', 'completed')
      .eq('chargeable', true)
      .eq('charge_review_status', 'reviewed')
      .is('charge_invoiced_at', null)
      .is('invoice_id', null)
      .order('completed_at', { ascending: true })
      .limit(1000),
    supabase.from('billing_accounts').select('*'),
  ])

  const pool = (accounts ?? []) as BillingAccount[]

  // Last issued invoice date per billing account, for the cadence due-hint.
  const { data: issuedRows } = await supabase
    .from('invoices')
    .select('billing_account_id, invoice_date')
    .not('invoice_date', 'is', null)
    .order('invoice_date', { ascending: false })
  const lastIssuedByAccount = new Map<string, string>()
  for (const row of (issuedRows ?? []) as { billing_account_id: string | null; invoice_date: string | null }[]) {
    if (row.billing_account_id && row.invoice_date && !lastIssuedByAccount.has(row.billing_account_id)) {
      lastIssuedByAccount.set(row.billing_account_id, row.invoice_date)
    }
  }

  const groups = new Map<string, ReadyGroup>()

  for (const t of (tasks ?? []) as any[]) {
    const siteService = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const site = siteService?.sites || t.direct_site
    const client = site?.clients
    const clientId = client?.id || site?.client_id || t.client_id

    const clientDefault =
      pool.find((a) => a.client_id === clientId && a.is_default) ?? null

    const { account } = resolveBillingAccount(
      siteService ? { billing_account_id: siteService.billing_account_id } : null,
      site ? { billing_account_id: site.billing_account_id } : null,
      clientDefault,
      pool,
    )

    // Build chargeable part lines (sale price where set, else cost).
    const parts: ReadyPart[] = (t.call_parts ?? [])
      .filter((p: any) => p.chargeable !== false && (p.quantity ?? 0) > 0)
      .map((p: any) => {
        const part = Array.isArray(p.part) ? p.part[0] : p.part
        const unit = p.sale_unit_price_pence ?? p.unit_cost_pence ?? 0
        const qty = p.quantity ?? 0
        return {
          id: p.id,
          name: part?.name || part?.sku || 'Part',
          quantity: qty,
          unitPricePence: unit,
          amountPence: lineAmountPence(qty, unit),
        }
      })
    const partsTotalPence = parts.reduce((s, p) => s + p.amountPence, 0)

    const reference =
      (Array.isArray(t.task_result)
        ? t.task_result[0]?.reference_number
        : t.task_result?.reference_number) || '—'

    const readyTask: ReadyTask = {
      id: t.id,
      reference,
      siteName: site?.name || 'Unknown site',
      serviceName: siteService?.service_type?.name || 'Ad-hoc / reactive',
      completedAt: t.completed_at,
      parts,
      partsTotalPence,
    }

    const key = account?.id ?? `unassigned:${clientId ?? 'none'}`
    let group = groups.get(key)
    if (!group) {
      group = {
        accountId: account?.id ?? null,
        accountName: account?.name ?? 'No billing account',
        accountStatus: account?.status ?? null,
        clientName: client?.name || '',
        onHold: !!account && account.status !== 'live',
        invoiceCallsIndividually: !!client?.invoice_calls_individually,
        billingFrequency: account?.billing_frequency ?? 'on_demand',
        dueHint: account
          ? billingDueHint(
              account.billing_frequency ?? 'on_demand',
              lastIssuedByAccount.get(account.id) ?? null,
            )
          : null,
        tasks: [],
        partsTotalPence: 0,
      }
      groups.set(key, group)
    }
    group.tasks.push(readyTask)
    group.partsTotalPence += partsTotalPence
  }

  // Real accounts first, then unassigned; each alphabetical.
  return Array.from(groups.values()).sort((a, b) => {
    if (!!a.accountId !== !!b.accountId) return a.accountId ? -1 : 1
    return a.accountName.localeCompare(b.accountName)
  })
}

// ---- Create --------------------------------------------------------------

/**
 * Create a draft invoice from a set of reviewed chargeable calls under one
 * billing account. Parts become priced line items automatically, and each call
 * is auto-priced against the resolved rate card (account override or company
 * default) into an attendance line plus a labour line for any chargeable hours.
 * All lines remain editable while the invoice is in draft.
 */
export async function createInvoiceFromTasks(
  billingAccountId: string,
  taskIds: string[],
): Promise<{ error: string | null; invoiceId?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  if (!billingAccountId) return { error: 'A billing account is required' }
  if (taskIds.length === 0) return { error: 'Select at least one call' }

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', billingAccountId)
    .single<BillingAccount>()
  if (!account) return { error: 'Billing account not found' }

  // Re-fetch the tasks server-side so line amounts come from trusted data, and
  // guard against a call being invoiced twice via a stale client.
  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      `
      id, started_at, completed_at, scheduled_date, is_emergency, client_ref,
      task_result:task_results(reference_number),
      direct_site:sites!tasks_site_id_fkey(id, name, address, postcode),
      site_service:site_services(service_type:service_types(name), sites(id, name, address, postcode)),
      call_parts(id, part_id, quantity, unit_cost_pence, sale_unit_price_pence, chargeable, part:parts(name, sku))
    `,
    )
    .in('id', taskIds)
    .eq('status', 'completed')
    .eq('chargeable', true)
    .is('charge_invoiced_at', null)
    .is('invoice_id', null)

  const rows = (tasks ?? []) as any[]
  if (rows.length === 0) {
    return { error: 'These calls are no longer available to invoice' }
  }

  // Resolve the rate card (account override or company default) + bank holidays
  // so each call's labour can be auto-priced. Falls back to null (zero-priced
  // lines) when no card is configured.
  const [{ cardsById, defaultCard }, bankHolidays] = await Promise.all([
    loadRateCards(supabase),
    loadBankHolidays(supabase),
  ])
  const rateCard = resolveRateCard(account.rate_card_id, cardsById, defaultCard)

  // Derive each call's PO number + site so we can (a) set invoice-level values
  // when they're common across all calls, and (b) prefix line descriptions when
  // they differ (per-line rollup). Site address is a newline-joined snapshot.
  const rowMeta = new Map<
    string,
    { po: string | null; siteId: string | null; siteName: string | null; siteAddress: string | null }
  >()
  for (const t of rows) {
    const siteService = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const site = siteService?.sites || t.direct_site || null
    const address = site ? [site.address, site.postcode].filter(Boolean).join('\n') || null : null
    rowMeta.set(t.id, {
      po: t.client_ref?.trim() || null,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
      siteAddress: address,
    })
  }
  const metas = [...rowMeta.values()]
  const commonOrNull = <T,>(vals: (T | null)[]): T | null => {
    const distinct = new Set(vals.map((v) => v ?? ''))
    return distinct.size === 1 ? (vals[0] ?? null) : null
  }
  const commonPo = commonOrNull(metas.map((m) => m.po))
  const commonSiteId = commonOrNull(metas.map((m) => m.siteId))
  const commonSiteAddress = commonOrNull(metas.map((m) => m.siteAddress))
  // Only prefix per-line PO/site when they actually differ between calls.
  const mixedPo = commonPo === null && metas.some((m) => m.po)
  const mixedSite = commonSiteId === null && metas.length > 1

  // Reserve a per-financial-year sequence number atomically.
  const now = new Date()
  const fy = financialYearOf(now)
  const { data: seq, error: seqError } = await supabase.rpc('next_invoice_seq', {
    p_fy: fy,
  })
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
      origin: 'adhoc',
      po_number: commonPo,
      site_id: commonSiteId,
      site_address: commonSiteAddress,
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

  // Build line items: priced attendance (+ labour) lines per call, then a line
  // per chargeable part.
  const lines: {
    invoice_id: string
    task_id: string | null
    part_id: string | null
    kind: InvoiceLineKind
    description: string
    quantity: number
    unit_price_pence: number
    amount_pence: number
    sort_order: number
  }[] = []
  let order = 0

  for (const t of rows) {
    const siteService = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const siteName = siteService?.sites?.name || t.direct_site?.name || 'site'
    const serviceName = siteService?.service_type?.name || 'attendance'
    const reference =
      (Array.isArray(t.task_result)
        ? t.task_result[0]?.reference_number
        : t.task_result?.reference_number) || ''

    // When PO/site differ across the invoice's calls, surface each call's own
    // PO (and site is already in the suffix) on its line descriptions.
    const meta = rowMeta.get(t.id)
    const poPrefix = mixedPo && meta?.po ? `PO ${meta.po} — ` : ''
    const siteLabel = mixedSite ? meta?.siteName || siteName : siteName
    const suffix = `${siteLabel}${reference ? ` (${reference})` : ''}`

    if (rateCard) {
      // Derive the band from the attendance moment: prefer the actual start /
      // finish timestamp; fall back to the scheduled date (time unknown).
      let when: Date
      let timeKnown = true
      if (t.started_at) when = new Date(t.started_at)
      else if (t.completed_at) when = new Date(t.completed_at)
      else if (t.scheduled_date) {
        const [y, m, d] = String(t.scheduled_date).split('-').map(Number)
        when = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)
        timeKnown = false
      } else {
        when = new Date()
        timeKnown = false
      }

      const band = deriveRateBand(when, {
        bankHolidays,
        isEmergency: !!t.is_emergency,
        timeKnown,
      })
      const onSiteHours = computeOnSiteHours(t.started_at, t.completed_at, {
        minHours: rateCard.min_labour_hours,
        incrementHours: rateCard.round_increment_hours,
      })
      const priced = priceCall({ card: rateCard, band, onSiteHours, travelHours: 0 })
      const bandLabel = RATE_BAND_LABELS[band]

      // Attendance / call-out line (always present, even at £0).
      lines.push({
        invoice_id: invoiceId,
        task_id: t.id,
        part_id: null,
        kind: 'labour',
        description: `${poPrefix}Call-out (${bandLabel}) — ${serviceName} — ${suffix}`,
        quantity: 1,
        unit_price_pence: priced.attendancePence,
        amount_pence: priced.attendancePence,
        sort_order: order++,
      })

      // Labour line only when there are chargeable hours beyond the fee.
      if (priced.chargeHours > 0) {
        lines.push({
          invoice_id: invoiceId,
          task_id: t.id,
          part_id: null,
          kind: 'labour',
          description: `${poPrefix}Labour (${bandLabel}) — ${priced.chargeHours}h @ rate — ${suffix}`,
          quantity: priced.chargeHours,
          unit_price_pence: priced.hourlyRatePence,
          amount_pence: lineAmountPence(priced.chargeHours, priced.hourlyRatePence),
          sort_order: order++,
        })
      }
    } else {
      // No rate card configured: keep the legacy single £0 labour line for the
      // office to price up by hand.
      lines.push({
        invoice_id: invoiceId,
        task_id: t.id,
        part_id: null,
        kind: 'labour',
        description: `${poPrefix}${serviceName} — ${suffix}`,
        quantity: 1,
        unit_price_pence: 0,
        amount_pence: 0,
        sort_order: order++,
      })
    }

    for (const p of (t.call_parts ?? []) as any[]) {
      if (p.chargeable === false || (p.quantity ?? 0) <= 0) continue
      const part = Array.isArray(p.part) ? p.part[0] : p.part
      const unit = p.sale_unit_price_pence ?? p.unit_cost_pence ?? 0
      const qty = p.quantity ?? 0
      lines.push({
        invoice_id: invoiceId,
        task_id: t.id,
        part_id: p.part_id ?? null,
        kind: 'part',
        description: `${poPrefix}${part?.name || part?.sku || 'Part'}`,
        quantity: qty,
        unit_price_pence: unit,
        amount_pence: lineAmountPence(qty, unit),
        sort_order: order++,
      })
    }
  }

  if (lines.length > 0) {
    const { error: liError } = await supabase.from('invoice_line_items').insert(lines)
    if (liError) {
      // Roll back the empty invoice so we don't leave an orphan.
      await supabase.from('invoices').delete().eq('id', invoiceId)
      return { error: liError.message }
    }
  }

  await recomputeTotals(supabase, invoiceId)

  // Link the calls to this invoice and take them out of the chargeable queue.
  const linkedIds = rows.map((r) => r.id)
  await supabase
    .from('tasks')
    .update({
      invoice_id: invoiceId,
      charge_invoiced_at: now.toISOString(),
      charge_invoiced_by: userId,
    })
    .in('id', linkedIds)

  revalidatePath('/dashboard/invoices')
  revalidatePath('/dashboard/chargeable')
  return { error: null, invoiceId }
}

// ---- Totals --------------------------------------------------------------

// Recompute and persist subtotal/tax/total from the invoice's line items.
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

// Guard: only draft invoices may be edited.
async function assertDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single()
  const status = (data as { status: string } | null)?.status
  if (!status) return 'Invoice not found'
  if (status !== 'draft') return 'Only draft invoices can be edited'
  return null
}

// ---- Line item editing ---------------------------------------------------

export async function addInvoiceLine(
  invoiceId: string,
  input: { kind: InvoiceLineKind; description: string; quantity: number; unitPricePence: number },
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertDraft(supabase, invoiceId)
  if (guard) return { error: guard }
  if (!input.description?.trim()) return { error: 'Description is required' }

  // Segregation: a recurring-origin invoice may only take manual "other"
  // adjustment lines — never call/part/job lines (those belong on ad-hoc
  // invoices). Recurring-charge lines are added at creation time.
  const { data: originRow } = await supabase
    .from('invoices')
    .select('origin')
    .eq('id', invoiceId)
    .single()
  const origin = (originRow as { origin: string } | null)?.origin
  if (origin === 'recurring' && input.kind !== 'other') {
    return {
      error: 'Recurring invoices can only take manual adjustment lines, not call or job lines.',
    }
  }

  const { data: last } = await supabase
    .from('invoice_line_items')
    .select('sort_order')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const qty = Number(input.quantity) || 0
  const unit = Math.round(Number(input.unitPricePence) || 0)
  const { error } = await supabase.from('invoice_line_items').insert({
    invoice_id: invoiceId,
    kind: input.kind,
    description: input.description.trim(),
    quantity: qty,
    unit_price_pence: unit,
    amount_pence: lineAmountPence(qty, unit),
    sort_order: nextOrder,
  })
  if (error) return { error: error.message }

  await recomputeTotals(supabase, invoiceId)
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

export async function updateInvoiceLine(
  lineId: string,
  invoiceId: string,
  input: { description: string; quantity: number; unitPricePence: number },
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertDraft(supabase, invoiceId)
  if (guard) return { error: guard }
  if (!input.description?.trim()) return { error: 'Description is required' }

  const qty = Number(input.quantity) || 0
  const unit = Math.round(Number(input.unitPricePence) || 0)
  const { error } = await supabase
    .from('invoice_line_items')
    .update({
      description: input.description.trim(),
      quantity: qty,
      unit_price_pence: unit,
      amount_pence: lineAmountPence(qty, unit),
    })
    .eq('id', lineId)
    .eq('invoice_id', invoiceId)
  if (error) return { error: error.message }

  await recomputeTotals(supabase, invoiceId)
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

export async function deleteInvoiceLine(
  lineId: string,
  invoiceId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertDraft(supabase, invoiceId)
  if (guard) return { error: guard }

  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', lineId)
    .eq('invoice_id', invoiceId)
  if (error) return { error: error.message }

  await recomputeTotals(supabase, invoiceId)
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

export async function updateInvoiceMeta(
  invoiceId: string,
  input: {
    notes: string | null
    taxRate: number
    poNumber?: string | null
    siteAddress?: string | null
  },
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertDraft(supabase, invoiceId)
  if (guard) return { error: guard }

  const taxRate = Math.max(0, Math.min(100, Number(input.taxRate) || 0))
  const patch: Record<string, unknown> = {
    notes: input.notes?.trim() || null,
    tax_rate: taxRate,
  }
  // PO and site address are only meaningful in draft; only patch when provided
  // so callers that just tweak notes/tax don't wipe them.
  if (input.poNumber !== undefined) patch.po_number = input.poNumber?.trim() || null
  if (input.siteAddress !== undefined) patch.site_address = input.siteAddress?.trim() || null

  const { error } = await supabase.from('invoices').update(patch).eq('id', invoiceId)
  if (error) return { error: error.message }

  await recomputeTotals(supabase, invoiceId)
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

// ---- Status transitions --------------------------------------------------

export async function issueInvoice(invoiceId: string): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const guard = await assertDraft(supabase, invoiceId)
  if (guard) return { error: guard }

  const { data: inv } = await supabase
    .from('invoices')
    .select('payment_terms_days, total_pence, on_hold')
    .eq('id', invoiceId)
    .single()
  if ((inv as { on_hold: boolean } | null)?.on_hold) {
    return { error: 'This invoice is on hold. Release it before issuing.' }
  }
  const terms = (inv as { payment_terms_days: number } | null)?.payment_terms_days ?? 30

  const issue = new Date()
  const due = new Date(issue)
  due.setDate(due.getDate() + terms)

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'issued',
      issue_date: issue.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      issued_at: issue.toISOString(),
      issued_by: userId,
    })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

export async function markInvoicePaid(invoiceId: string): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { data } = await supabase
    .from('invoices')
    .select('status, document_type')
    .eq('id', invoiceId)
    .single()
  if ((data as { document_type: string } | null)?.document_type === 'credit_note') {
    return { error: 'Credit notes cannot be marked paid' }
  }
  if ((data as { status: string } | null)?.status !== 'issued') {
    return { error: 'Only issued invoices can be marked paid' }
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: userId })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

/**
 * Void an invoice. This releases its calls so they return to the chargeable
 * queue and can be re-invoiced. Draft or issued invoices can be voided.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { data } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single()
  const status = (data as { status: string } | null)?.status
  if (status !== 'draft' && status !== 'issued') {
    return { error: 'Only draft or issued invoices can be voided' }
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'void',
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: reason?.trim() || null,
    })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  // Release the calls back to the chargeable queue.
  await supabase
    .from('tasks')
    .update({ invoice_id: null, charge_invoiced_at: null, charge_invoiced_by: null })
    .eq('invoice_id', invoiceId)

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  revalidatePath('/dashboard/chargeable')
  return { error: null }
}

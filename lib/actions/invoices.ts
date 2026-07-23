'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  BillingAccount,
  BillingFrequency,
  CompanyInfo,
  Invoice,
  InvoiceLineItem,
  InvoiceLineKind,
  Profile,
} from '@/lib/types/database'
import { resolveBillingAccount } from '@/lib/billing/resolve-billing-account'
import { renderInvoicePdfBuffer } from '@/lib/pdf/invoice-pdf'
import { resolveInvoiceLineSites } from '@/lib/billing/invoice-line-sites'
import { buildSageCsv, type SageExportInvoice } from '@/lib/billing/sage-export'
import { sendEmail } from '@/lib/email/send-email'
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
  resolveRateCardFromChain,
  RATE_BAND_LABELS,
  toLocalISODate,
  type RateCard,
} from '@/lib/billing/rate-cards'
import { getCompanyTaxConfig } from '@/lib/billing/company-tax'

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

/**
 * Stricter guard for the controlled edit/send functions: the caller must be a
 * billing manager AND hold the invoice-edit permission (admins implicit; office
 * needs `can_edit_invoices`). Mirrors `profileCanEditInvoices` but re-checked
 * server-side so the UI gate can never be the only line of defence.
 */
async function requireInvoiceEditor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, can_edit_invoices')
    .eq('id', user.id)
    .single()

  const p = profile as Pick<Profile, 'id' | 'role' | 'can_edit_invoices'> | null
  const allowed = p?.role === 'admin' || (p?.role === 'office' && p?.can_edit_invoices === true)
  if (!allowed) {
    return { error: 'You do not have permission to edit or send invoices' as const }
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
  attendance_nominal_code_id: string | null
  labour_nominal_code_id: string | null
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
    attendance_nominal_code_id: row.attendance_nominal_code_id ?? null,
    labour_nominal_code_id: row.labour_nominal_code_id ?? null,
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
        call_parts(id, quantity, unit_cost_pence, sale_unit_price_pence, chargeable, part:parts(name, sku, unit_cost))
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

    // Build chargeable part lines (sale price where set, else the snapshotted
    // cost, else the live catalogue cost from parts.unit_cost as a last resort).
    const parts: ReadyPart[] = (t.call_parts ?? [])
      .filter((p: any) => p.chargeable !== false && (p.quantity ?? 0) > 0)
      .map((p: any) => {
        const part = Array.isArray(p.part) ? p.part[0] : p.part
        const catalogueCostPence =
          part?.unit_cost != null && !Number.isNaN(Number(part.unit_cost))
            ? Math.round(Number(part.unit_cost) * 100)
            : null
        const unit = p.sale_unit_price_pence ?? p.unit_cost_pence ?? catalogueCostPence ?? 0
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

// A built line item, minus its `invoice_id` (added when actually inserting) so
// the same builder can serve both the live create and the pre-create preview.
type PreparedInvoiceLine = {
  task_id: string | null
  part_id: string | null
  kind: InvoiceLineKind
  description: string
  quantity: number
  unit_price_pence: number
  amount_pence: number
  sort_order: number
  nominal_code_id: string | null
  nominal_code: string | null
}

/**
 * Shared builder: re-fetch the selected calls server-side (trusted data, guarding
 * against double-invoicing), resolve the rate card + nominal codes, and produce
 * the priced line items (attendance/labour + parts) exactly as they will appear
 * on the invoice. Returned lines omit `invoice_id` so `createInvoiceFromTasks`
 * and `previewInvoiceFromTasks` share identical logic and never drift. Also
 * returns the invoice-level PO/site values common across the selected calls.
 */
async function buildInvoiceLineData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  account: BillingAccount,
  taskIds: string[],
): Promise<
  | { error: string }
  | {
      rows: any[]
      lines: PreparedInvoiceLine[]
      commonPo: string | null
      commonSiteId: string | null
      commonSiteAddress: string | null
    }
> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      `
      id, started_at, completed_at, scheduled_date, is_emergency, client_ref,
      site_service_id, charge_reason, reference_number,
      task_result:task_results(reference_number),
      direct_site:sites!tasks_site_id_fkey(id, name, address, postcode, rate_card_id),
      site_service:site_services(rate_card_id, service_type:service_types(name, nominal_code_id), sites(id, name, address, postcode, rate_card_id)),
      call_parts(id, part_id, quantity, unit_cost_pence, sale_unit_price_pence, chargeable, part:parts(name, sku, unit_cost, nominal_code_id))
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

  // Load all rate cards + bank holidays so each call's labour can be auto-priced.
  // The card is resolved PER CALL from the scoped override chain (service -> site
  // -> customer -> company default) so a client can pay different rates for
  // different sites and services. Falls back to null (zero-priced lines) when no
  // card resolves.
  const [{ cardsById, defaultCard }, bankHolidays] = await Promise.all([
    loadRateCards(supabase),
    loadBankHolidays(supabase),
  ])
  const customerCardId = account.rate_card_id

  // Map nominal-code id → code text so each line can carry a stable snapshot.
  // Resolution for task lines: part's own code → its service type's code.
  const { data: ncRows } = await supabase.from('nominal_codes').select('id, code')
  const nominalText = new Map<string, string>((ncRows ?? []).map((n: any) => [n.id, n.code]))
  const nominalFor = (id: string | null) => ({
    nominal_code_id: id,
    nominal_code: id ? nominalText.get(id) ?? null : null,
  })

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

  // Build line items: priced attendance (+ labour) lines per call, then a line
  // per chargeable part.
  const lines: PreparedInvoiceLine[] = []
  let order = 0

  for (const t of rows) {
    const siteService = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const siteName = siteService?.sites?.name || t.direct_site?.name || 'site'
    const svcType = Array.isArray(siteService?.service_type)
      ? siteService.service_type[0]
      : siteService?.service_type
    const serviceName = svcType?.name || 'attendance'
    const svcNominalId: string | null = svcType?.nominal_code_id ?? null

    // Resolve THIS call's rate card from the scoped chain: service override →
    // site override → customer (billing account) → company default.
    const siteCardId: string | null =
      siteService?.sites?.rate_card_id ?? t.direct_site?.rate_card_id ?? null
    const rateCard = resolveRateCardFromChain(
      {
        serviceCardId: siteService?.rate_card_id ?? null,
        siteCardId,
        customerCardId,
      },
      cardsById,
      defaultCard,
    )
    // Rate card nominal codes win over the service type (per user decision);
    // attendance vs labour lines can post to different codes.
    const attendanceNominalId: string | null =
      rateCard?.attendance_nominal_code_id ?? svcNominalId
    const labourNominalId: string | null = rateCard?.labour_nominal_code_id ?? svcNominalId
    const reference =
      t.reference_number ||
      (Array.isArray(t.task_result)
        ? t.task_result[0]?.reference_number
        : t.task_result?.reference_number) ||
      ''

    // When PO/site differ across the invoice's calls, surface each call's own
    // PO (and site is already in the suffix) on its line descriptions.
    const meta = rowMeta.get(t.id)
    const poPrefix = mixedPo && meta?.po ? `PO ${meta.po} — ` : ''
    const siteLabel = mixedSite ? meta?.siteName || siteName : siteName
    const suffix = `${siteLabel}${reference ? ` (${reference})` : ''}`

    // Parts replaced during a RECURRING service visit: the visit itself is
    // already billed under the recurring contract, so there is no attendance
    // (call-out) fee and no automatic labour line — only the parts are charged.
    // Labour remains OPTIONAL: the reviewer can add a labour line by hand on the
    // draft if the extra work warrants it. Reactive/one-off calls are unaffected
    // (they keep their call-out fee).
    const isRecurringPartsOnly = !!t.site_service_id && t.charge_reason === 'parts_added'

    if (isRecurringPartsOnly) {
      // Skip attendance + labour; parts lines are appended below.
    } else if (rateCard) {
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
        task_id: t.id,
        part_id: null,
        kind: 'labour',
        description: `${poPrefix}Call-out (${bandLabel}) — ${serviceName} — ${suffix}`,
        quantity: 1,
        unit_price_pence: priced.attendancePence,
        amount_pence: priced.attendancePence,
        sort_order: order++,
        ...nominalFor(attendanceNominalId),
      })

      // Labour line only when there are chargeable hours beyond the fee.
      if (priced.chargeHours > 0) {
        lines.push({
          task_id: t.id,
          part_id: null,
          kind: 'labour',
          description: `${poPrefix}Labour (${bandLabel}) — ${priced.chargeHours}h @ rate — ${suffix}`,
          quantity: priced.chargeHours,
          unit_price_pence: priced.hourlyRatePence,
          amount_pence: lineAmountPence(priced.chargeHours, priced.hourlyRatePence),
          sort_order: order++,
          ...nominalFor(labourNominalId),
        })
      }
    } else {
      // No rate card configured: keep the legacy single £0 labour line for the
      // office to price up by hand.
      lines.push({
        task_id: t.id,
        part_id: null,
        kind: 'labour',
        description: `${poPrefix}${serviceName} — ${suffix}`,
        quantity: 1,
        unit_price_pence: 0,
        amount_pence: 0,
        sort_order: order++,
        ...nominalFor(labourNominalId),
      })
    }

    for (const p of (t.call_parts ?? []) as any[]) {
      if (p.chargeable === false || (p.quantity ?? 0) <= 0) continue
      const part = Array.isArray(p.part) ? p.part[0] : p.part
      const catalogueCostPence =
        part?.unit_cost != null && !Number.isNaN(Number(part.unit_cost))
          ? Math.round(Number(part.unit_cost) * 100)
          : null
      const unit = p.sale_unit_price_pence ?? p.unit_cost_pence ?? catalogueCostPence ?? 0
      const qty = p.quantity ?? 0
      // Part's own nominal wins; else fall back to the call's service type.
      const partNominalId: string | null = part?.nominal_code_id ?? svcNominalId
      lines.push({
        task_id: t.id,
        part_id: p.part_id ?? null,
        kind: 'part',
        description: `${poPrefix}${part?.name || part?.sku || 'Part'}`,
        quantity: qty,
        unit_price_pence: unit,
        amount_pence: lineAmountPence(qty, unit),
        sort_order: order++,
        ...nominalFor(partNominalId),
      })
    }
  }

  return { rows, lines, commonPo, commonSiteId, commonSiteAddress }
}

// A single line as shown in the pre-create preview.
export interface InvoicePreviewLine {
  kind: InvoiceLineKind
  description: string
  quantity: number
  unitPricePence: number
  amountPence: number
}

export interface InvoicePreview {
  billToName: string
  billToEmail: string | null
  billToAddress: string | null
  poNumber: string | null
  taxRate: number
  lines: InvoicePreviewLine[]
  subtotalPence: number
  taxPence: number
  totalPence: number
  callCount: number
}

/**
 * Compute (but do NOT persist) what a draft invoice would contain for the given
 * calls, so the office can review the exact auto-priced lines and totals before
 * committing. Read-only: reserves no invoice number and links no calls.
 */
export async function previewInvoiceFromTasks(
  billingAccountId: string,
  taskIds: string[],
): Promise<{ error: string | null; preview?: InvoicePreview }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  if (!billingAccountId) return { error: 'A billing account is required' }
  if (taskIds.length === 0) return { error: 'Select at least one call' }

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', billingAccountId)
    .single<BillingAccount>()
  if (!account) return { error: 'Billing account not found' }

  const built = await buildInvoiceLineData(supabase, account, taskIds)
  if ('error' in built) return { error: built.error }

  const { rate: taxRate } = await getCompanyTaxConfig()
  const { subtotalPence, taxPence, totalPence } = computeInvoiceTotals(
    built.lines.map((l) => ({ amount_pence: l.amount_pence })),
    taxRate,
  )
  const billToAddress =
    [account.invoice_address, account.invoice_postcode].filter(Boolean).join('\n') || null

  return {
    error: null,
    preview: {
      billToName: account.invoice_contact_name || account.name,
      billToEmail: account.invoice_email,
      billToAddress,
      poNumber: built.commonPo,
      taxRate,
      lines: built.lines.map((l) => ({
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unit_price_pence,
        amountPence: l.amount_pence,
      })),
      subtotalPence,
      taxPence,
      totalPence,
      callCount: built.rows.length,
    },
  }
}

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

  // Build the priced line data (fetch + rate-card + parts) via the shared helper
  // so what we persist matches the pre-create preview exactly.
  const built = await buildInvoiceLineData(supabase, account, taskIds)
  if ('error' in built) return { error: built.error }
  const { rows, lines: preparedLines, commonPo, commonSiteId, commonSiteAddress } = built

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

  const { rate: taxRate } = await getCompanyTaxConfig()

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
      tax_rate: taxRate,
      created_by: userId,
    })
    .select('id')
    .single()

  if (invError || !invoice) {
    return { error: invError?.message || 'Could not create the invoice' }
  }
  const invoiceId = invoice.id as string

  // Attach the new invoice id to the pre-built lines before inserting them.
  const lines = preparedLines.map((l) => ({ ...l, invoice_id: invoiceId }))

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

// Guard: an invoice may be edited until it has been sent to the client. Sending
// (not issuing) is now the lock, so draft AND issued invoices are editable while
// `sent_at` is null. Void/credit-note invoices can never be edited.
async function assertEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('invoices')
    .select('status, sent_at')
    .eq('id', invoiceId)
    .single()
  const row = data as { status: string; sent_at: string | null } | null
  if (!row?.status) return 'Invoice not found'
  if (row.status === 'void') return 'Void invoices cannot be edited'
  if (row.status === 'paid') return 'Paid invoices cannot be edited'
  if (row.sent_at) return 'This invoice has been sent to the client and can no longer be edited'
  return null
}

// ---- Line item editing ---------------------------------------------------

export async function addInvoiceLine(
  invoiceId: string,
  input: { kind: InvoiceLineKind; description: string; quantity: number; unitPricePence: number },
): Promise<{ error: string | null }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertEditable(supabase, invoiceId)
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
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertEditable(supabase, invoiceId)
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

/**
 * Set (or clear) the internal nominal code on a single draft line. Also writes
 * the text snapshot so it survives future master-list edits. INTERNAL only —
 * the code never renders on the client-facing invoice.
 */
export async function setInvoiceLineNominal(
  lineId: string,
  invoiceId: string,
  nominalCodeId: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertEditable(supabase, invoiceId)
  if (guard) return { error: guard }

  let codeText: string | null = null
  if (nominalCodeId) {
    const { data: nc } = await supabase
      .from('nominal_codes')
      .select('code')
      .eq('id', nominalCodeId)
      .single()
    codeText = (nc as { code: string } | null)?.code ?? null
  }

  const { error } = await supabase
    .from('invoice_line_items')
    .update({ nominal_code_id: nominalCodeId, nominal_code: codeText })
    .eq('id', lineId)
    .eq('invoice_id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

export async function deleteInvoiceLine(
  lineId: string,
  invoiceId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertEditable(supabase, invoiceId)
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
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const guard = await assertEditable(supabase, invoiceId)
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

// ---- Bulk status transitions ---------------------------------------------

export interface BulkInvoiceResult {
  ok: number
  failures: { invoiceId: string; error: string }[]
}

/**
 * Issue several draft invoices in one pass. Each is run through the same guarded
 * `issueInvoice` (nominal-code + on-hold + draft-only checks), collecting
 * per-invoice failures so the caller can report partial success.
 */
export async function bulkIssueInvoices(invoiceIds: string[]): Promise<BulkInvoiceResult> {
  const failures: { invoiceId: string; error: string }[] = []
  let ok = 0
  for (const id of invoiceIds) {
    const res = await issueInvoice(id)
    if (res.error) failures.push({ invoiceId: id, error: res.error })
    else ok++
  }
  return { ok, failures }
}

/**
 * Email several invoices to their clients in one pass (auto-issuing any drafts
 * first), reusing the guarded `sendInvoiceToClient`. Skips/records any that are
 * already sent or missing an invoice email. Returns per-invoice failures.
 */
export async function bulkSendInvoices(invoiceIds: string[]): Promise<BulkInvoiceResult> {
  const failures: { invoiceId: string; error: string }[] = []
  let ok = 0
  for (const id of invoiceIds) {
    const res = await sendInvoiceToClient(id)
    if (res.error) failures.push({ invoiceId: id, error: res.error })
    else ok++
  }
  return { ok, failures }
}

// ---- Sage 50 CSV export ---------------------------------------------------

export interface SageExportResult {
  error: string | null
  /** CSV text (only present on success with >0 invoices). */
  csv?: string
  filename?: string
  /** Number of invoices written into the CSV. */
  count?: number
}

/**
 * Push issued invoices to Sage by generating a Sage 50 audit-trail CSV and
 * stamping the exported invoices as "Sent to Sage". First-pass integration: no
 * live Sage connection, just a spreadsheet the Sage import wizard can read.
 *
 * With no ids, exports every eligible (issued/paid, non-void) invoice that has
 * not yet been exported. With ids, exports exactly those (allowing re-export).
 */
export async function exportInvoicesToSage(invoiceIds?: string[]): Promise<SageExportResult> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  let query = supabase
    .from('invoices')
    .select(
      'id, invoice_number, document_type, sage_account_ref, issue_date, tax_rate, status, sage_exported_at, billing_account:billing_accounts(sage_account_ref), line_items:invoice_line_items(description, amount_pence, nominal_code, sort_order)',
    )
    .in('status', ['issued', 'paid'])
    .order('issue_date', { ascending: true })

  if (invoiceIds && invoiceIds.length > 0) {
    query = query.in('id', invoiceIds)
  } else {
    // Batch mode: only invoices not yet pushed to Sage.
    query = query.is('sage_exported_at', null)
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  type Row = Pick<
    Invoice,
    'id' | 'invoice_number' | 'document_type' | 'sage_account_ref' | 'issue_date' | 'tax_rate'
  > & {
    // Supabase returns an embedded one-to-one as an object (or null).
    billing_account: { sage_account_ref: string | null } | null
    line_items: Pick<InvoiceLineItem, 'description' | 'amount_pence' | 'nominal_code' | 'sort_order'>[]
  }
  const rows = (data ?? []) as unknown as Row[]

  const exportable = rows.filter((r) => (r.line_items ?? []).length > 0)
  if (exportable.length === 0) {
    return { error: 'No issued invoices are waiting to be sent to Sage.' }
  }

  // Company-level Sage tax code (e.g. T1) applied to every exported line.
  const { taxCode: companyTaxCode } = await getCompanyTaxConfig()

  const payload: SageExportInvoice[] = exportable.map((r) => ({
    invoiceNumber: r.invoice_number,
    documentType: r.document_type === 'credit_note' ? 'credit_note' : 'invoice',
    // Sage customer account number: the billing account's Sage ref is the
    // authoritative source; fall back to any ref stamped on the invoice.
    sageAccountRef: r.billing_account?.sage_account_ref ?? r.sage_account_ref ?? null,
    issueDate: r.issue_date,
    taxRate: r.tax_rate ?? DEFAULT_TAX_RATE,
    // Zero-rated invoices still use the zero code regardless of the company code.
    taxCode: (r.tax_rate ?? DEFAULT_TAX_RATE) > 0 ? companyTaxCode : 'T0',
    lines: [...r.line_items]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => ({
        description: l.description,
        amountPence: l.amount_pence,
        nominalCode: l.nominal_code,
      })),
  }))

  const csv = buildSageCsv(payload)

  // Stamp the exported invoices so they show as "Sent to Sage".
  const { error: stampError } = await supabase
    .from('invoices')
    .update({ sage_exported_at: new Date().toISOString(), sage_exported_by: userId })
    .in(
      'id',
      exportable.map((r) => r.id),
    )
  if (stampError) return { error: stampError.message }

  revalidatePath('/dashboard/invoices')

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    error: null,
    csv,
    filename: `sage-export-${stamp}.csv`,
    count: exportable.length,
  }
}

// ---- Status transitions --------------------------------------------------

export async function issueInvoice(invoiceId: string): Promise<{ error: string | null }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  // Issuing still only happens from draft (it assigns issue/due dates).
  const { data: statusRow } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single()
  const currentStatus = (statusRow as { status: string } | null)?.status
  if (!currentStatus) return { error: 'Invoice not found' }
  if (currentStatus !== 'draft') return { error: 'Only draft invoices can be issued' }

  // Every line must carry a nominal (accounting) code before the invoice can be
  // issued — this is what a future Sage 50 export keys off. Drafts may be
  // incomplete; the office fixes flagged lines inline in the detail view.
  const { data: unresolved } = await supabase
    .from('invoice_line_items')
    .select('id')
    .eq('invoice_id', invoiceId)
    .is('nominal_code_id', null)
    .limit(1)
  if (unresolved && unresolved.length > 0) {
    return {
      error:
        'Every line needs a nominal code before this invoice can be issued. Set the missing codes and try again.',
    }
  }

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

/**
 * Fetch the minimal invoice fields the shared quick-actions menu needs (used by
 * the raise-invoice page right after creating a draft, so it can offer inline
 * Preview / Edit / Send without a full page redirect). Manager-gated.
 */
export async function getInvoiceForActions(
  invoiceId: string,
): Promise<{ error: string | null; invoice: Invoice | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised', invoice: null }
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, status, document_type, sent_at, bill_to_name, bill_to_email, total_pence, due_date',
    )
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) return { error: error.message, invoice: null }
  return { error: null, invoice: (data ?? null) as unknown as Invoice | null }
}

/**
 * Fetch an invoice's line items for the inline quick-edit dialog. Kept out of the
 * heavy list query so the invoices page stays light — lines load only when a user
 * opens the editor. Requires the invoice-edit permission.
 */
export async function getInvoiceLinesForEdit(
  invoiceId: string,
): Promise<{ error: string | null; lines: InvoiceLineItem[] }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised', lines: [] }
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })
  if (error) return { error: error.message, lines: [] }
  return { error: null, lines: (data ?? []) as InvoiceLineItem[] }
}

/**
 * Send an invoice to the client: emails the PDF to the billing-account invoice
 * email (bill_to_email) and locks the invoice against further line edits by
 * stamping sent_at/by/to. If the invoice is still a draft it is issued first
 * (so it gets a proper issue/due date) using the same nominal-code + hold gates.
 * Controlled: requires the invoice-edit permission. Send address is the invoice
 * email only — no CC to the client contact.
 */
export async function sendInvoiceToClient(
  invoiceId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireInvoiceEditor()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { data: invRow } = await supabase
    .from('invoices')
    .select('*, billing_account:billing_accounts(name)')
    .eq('id', invoiceId)
    .maybeSingle()
  const invoice = invRow as (Invoice & { billing_account: { name: string } | null }) | null
  if (!invoice) return { error: 'Invoice not found' }
  if (invoice.document_type === 'credit_note') {
    return { error: 'Credit notes cannot be sent from here' }
  }
  if (invoice.sent_at) return { error: 'This invoice has already been sent' }

  const toEmail = invoice.bill_to_email?.trim()
  if (!toEmail) {
    return {
      error:
        'No invoice email set for this billing account. Add an invoice email before sending.',
    }
  }

  // Auto-issue a draft first (assigns number stays, sets issue/due dates and
  // enforces the nominal-code + hold guards) so we never email an unissued doc.
  if (invoice.status === 'draft') {
    const issued = await issueInvoice(invoiceId)
    if (issued.error) return { error: issued.error }
  } else if (invoice.status !== 'issued') {
    return { error: `A ${invoice.status} invoice cannot be sent` }
  }

  // Re-fetch after a possible issue so the PDF carries the issue/due dates.
  const { data: freshRow } = await supabase
    .from('invoices')
    .select('*, billing_account:billing_accounts(name)')
    .eq('id', invoiceId)
    .maybeSingle()
  const fresh = freshRow as (Invoice & { billing_account: { name: string } | null }) | null
  if (!fresh) return { error: 'Invoice not found' }

  const [{ data: lines }, { data: company }] = await Promise.all([
    supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const emailLines = (lines ?? []) as InvoiceLineItem[]
  const emailSiteByLineId = await resolveInvoiceLineSites(supabase, emailLines)

  let pdf: Buffer
  try {
    pdf = await renderInvoicePdfBuffer({
      invoice: fresh,
      lines: emailLines,
      company: (company ?? null) as CompanyInfo | null,
      siteByLineId: emailSiteByLineId,
    })
  } catch (err) {
    console.error('[v0] Invoice PDF render failed:', err)
    return { error: 'Could not generate the invoice PDF' }
  }

  const safeNumber = String(fresh.invoice_number).replace(/[^a-zA-Z0-9-_]/g, '')
  // Escape DB-sourced strings before interpolating into the outbound email body
  // so a customer/company name or invoice number containing HTML can't break or
  // inject markup.
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  const companyName = escapeHtml((company as CompanyInfo | null)?.name ?? 'Pyrocel')
  const billToName = escapeHtml(fresh.bill_to_name ?? 'Customer')
  const invoiceNumberHtml = escapeHtml(String(fresh.invoice_number))
  const html = `
    <p>Dear ${billToName},</p>
    <p>Please find attached invoice <strong>${invoiceNumberHtml}</strong> from ${companyName}.</p>
    <p>The invoice total is <strong>&pound;${(fresh.total_pence / 100).toFixed(2)}</strong>${
      fresh.due_date ? `, due by ${fresh.due_date}` : ''
    }.</p>
    <p>If you have any questions about this invoice, please reply to this email.</p>
    <p>Kind regards,<br/>${companyName}</p>
  `

  // Subject is plain text (not HTML), so use the raw, un-escaped values here.
  const rawCompanyName = (company as CompanyInfo | null)?.name ?? 'Pyrocel'
  const sent = await sendEmail(toEmail, `Invoice ${fresh.invoice_number} from ${rawCompanyName}`, html, {
    attachments: [{ filename: `${safeNumber}.pdf`, content: pdf }],
  })
  if (!sent.success) {
    return { error: sent.error || 'Failed to send the invoice email' }
  }

  const { error } = await supabase
    .from('invoices')
    .update({ sent_at: new Date().toISOString(), sent_by: userId, sent_to: toEmail })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { error: null }
}

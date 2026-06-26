'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeQuoteTotals, QUOTE_TYPES, WORK_TYPES, sellFromCost, resolveLineMargin } from '@/lib/sales'
import { sendEmail } from '@/lib/email/send-email'
import { renderQuotePdfBuffer } from '@/lib/pdf/quote-pdf'
import type {
  QuoteStatus,
  QuoteCatalogueItem,
  Quote,
  QuoteSystem,
  QuoteLineItem,
  CompanyInfo,
} from '@/lib/types/database'

const VALID_QUOTE_TYPES = new Set(QUOTE_TYPES.map((t) => t.value))
const VALID_WORK_TYPES = new Set(WORK_TYPES.map((t) => t.code))

// Shape sent from the quote builder. System/line ids are client-side temp
// ids used only to wire line items to their system before persistence.
export interface QuoteLineInput {
  description: string
  detail?: string | null
  service_type_id?: string | null
  is_service?: boolean
  catalogue_item_id?: string | null
  product_code?: string | null
  quantity: number
  unit?: string | null
  // Cost + margin are authoritative; the sell price is recomputed server-side.
  unit_cost_pence: number
  margin_percent: number | null
}

export interface QuotePpmInput {
  num_visits: number
  round_trip_miles: number
  mileage_rate_pence: number
  travel_minutes_per_visit: number
  hourly_cost_pence: number
  download_required: boolean
  download_minutes_per_visit: number
  access_minutes_per_visit: number
  remote_monitored: boolean
  remote_minutes_per_visit: number
  out_of_hours: boolean
  ooh_uplift_percent: number
  margin_percent: number
  computed_cost_pence: number
  computed_price_pence: number
  assets: unknown[]
  visits: unknown[]
  notes: string | null
}

export interface QuoteSystemInput {
  system_type_id?: string | null
  system_name: string
  system_code?: string | null
  work_type: string
  specification?: string | null
  conditional_values?: Record<string, string | number | boolean>
  design_category_id?: string | null
  design_overview?: string | null
  designed_by?: string | null
  designed_by_name?: string | null
  drawing_reference?: string | null
  survey_carried_out?: boolean
  survey_by?: string | null
  survey_date?: string | null
  margin_percent?: number
  lines: QuoteLineInput[]
  ppm?: QuotePpmInput | null
}

export interface QuoteInput {
  id?: string
  title: string
  quote_type: string
  client_id?: string | null
  site_id?: string | null
  prospect_name?: string | null
  prospect_contact?: string | null
  prospect_email?: string | null
  prospect_phone?: string | null
  prospect_address?: string | null
  summary?: string | null
  notes?: string | null
  terms?: string | null
  vat_rate: number
  discount_pence: number
  show_line_items?: boolean
  valid_until?: string | null
  systems: QuoteSystemInput[]
  }

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

// Build the persisted line rows for a system, returning rows + its subtotal.
// The sell price is recomputed authoritatively from unit cost + the effective
// margin (per-line override, else the system margin) so the client can never
// submit a sell price that doesn't match its cost/margin inputs.
function buildLineRows(
  quoteId: string,
  systemId: string,
  lines: QuoteLineInput[],
  systemMargin: number,
) {
  const rows = lines
    .filter((l) => l.description?.trim())
    .map((l, idx) => {
      const unitCost = Math.round(l.unit_cost_pence) || 0
      const margin = resolveLineMargin(l.margin_percent ?? null, systemMargin)
      const unitSell = sellFromCost(unitCost, margin)
      const qty = l.quantity || 0
      return {
        quote_id: quoteId,
        system_id: systemId,
      catalogue_item_id: l.catalogue_item_id || null,
      service_type_id: l.service_type_id || null,
      is_service: l.is_service ?? false,
      product_code: l.product_code?.trim() || null,
      description: l.description.trim(),
        detail: l.detail?.trim() || null,
        quantity: qty,
        unit: l.unit?.trim() || null,
        unit_cost_pence: unitCost,
        margin_percent: l.margin_percent ?? null,
        unit_price_pence: unitSell,
        line_total_pence: Math.round(qty * unitSell),
        position: idx,
      }
    })
  const subtotal = rows.reduce((sum, r) => sum + r.line_total_pence, 0)
  return { rows, subtotal }
}

// Persist a quote's systems + their line items. Assumes any previous systems/
// lines for the quote have already been cleared. Recomputes per-system subtotal.
async function persistSystems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  systems: QuoteSystemInput[],
): Promise<string | null> {
  let pos = 0
  for (const system of systems) {
    const systemMargin = Number.isFinite(system.margin_percent as number)
      ? (system.margin_percent as number)
      : 0
    const { subtotal } = buildLineRows(quoteId, 'preview', system.lines, systemMargin)
    const { data: sys, error: sysErr } = await supabase
      .from('quote_systems')
      .insert({
        quote_id: quoteId,
        system_type_id: system.system_type_id || null,
        system_name: system.system_name?.trim() || 'System',
        system_code: system.system_code?.trim() || null,
        work_type: VALID_WORK_TYPES.has(system.work_type) ? system.work_type : 'OTH',
        specification: system.specification?.trim() || null,
        conditional_values: system.conditional_values ?? {},
        design_category_id: system.design_category_id || null,
        design_overview: system.design_overview?.trim() || null,
        designed_by: system.designed_by || null,
        designed_by_name: system.designed_by_name?.trim() || null,
        drawing_reference: system.drawing_reference?.trim() || null,
        survey_carried_out: !!system.survey_carried_out,
        survey_by: system.survey_by?.trim() || null,
        survey_date: system.survey_date || null,
        margin_percent: systemMargin,
        position: pos++,
        subtotal_pence: subtotal,
      })
      .select('id')
      .single()
    if (sysErr || !sys) return 'Could not save a quote system.'

    const systemId = (sys as { id: string }).id
    const { rows } = buildLineRows(quoteId, systemId, system.lines, systemMargin)
    if (rows.length > 0) {
      const { error: lineErr } = await supabase.from('quote_line_items').insert(rows)
      if (lineErr) return 'Could not save quote line items.'
    }

    // Persist the PPM calculator breakdown for this system, if present.
    if (system.ppm) {
      const p = system.ppm
      const { error: ppmErr } = await supabase.from('quote_system_ppm').insert({
        quote_system_id: systemId,
        num_visits: Math.max(0, Math.round(p.num_visits) || 0),
        round_trip_miles: p.round_trip_miles || 0,
        mileage_rate_pence: Math.round(p.mileage_rate_pence) || 0,
        travel_minutes_per_visit: p.travel_minutes_per_visit || 0,
        hourly_cost_pence: Math.round(p.hourly_cost_pence) || 0,
        download_required: !!p.download_required,
        download_minutes_per_visit: p.download_minutes_per_visit || 0,
        access_minutes_per_visit: p.access_minutes_per_visit || 0,
        remote_monitored: !!p.remote_monitored,
        remote_minutes_per_visit: p.remote_minutes_per_visit || 0,
        out_of_hours: !!p.out_of_hours,
        ooh_uplift_percent: p.ooh_uplift_percent || 0,
        margin_percent: p.margin_percent || 0,
        computed_cost_pence: Math.round(p.computed_cost_pence) || 0,
        computed_price_pence: Math.round(p.computed_price_pence) || 0,
        assets: p.assets ?? [],
        visits: p.visits ?? [],
        notes: p.notes || null,
      })
      if (ppmErr) return 'Could not save the PPM calculation.'
    }
  }
  return null
}

/**
 * Create or update a quote together with its systems and line items.
 * Totals are always recomputed here; values from the client are ignored.
 */
export async function saveQuote(
  input: QuoteInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  if (!input.title?.trim()) return { ok: false, error: 'A quote title is required.' }
  if (!VALID_QUOTE_TYPES.has(input.quote_type)) {
    return { ok: false, error: 'Please choose a valid quote type.' }
  }
  if (!input.client_id && !input.prospect_name?.trim()) {
    return { ok: false, error: 'Select a client or enter a prospect name.' }
  }

  // Flatten lines, deriving each line's authoritative sell price from its unit
  // cost + effective margin (per-line override, else the system margin).
  const allLines = input.systems.flatMap((s) => {
    const systemMargin = Number.isFinite(s.margin_percent as number) ? (s.margin_percent as number) : 0
    return s.lines.map((l) => ({
      quantity: l.quantity || 0,
      unit_price_pence: sellFromCost(
        Math.round(l.unit_cost_pence) || 0,
        resolveLineMargin(l.margin_percent ?? null, systemMargin),
      ),
    }))
  })
  const totals = computeQuoteTotals(allLines, {
    vatRate: input.vat_rate,
    discountPence: input.discount_pence,
  })

  const header = {
    title: input.title.trim(),
    quote_type: input.quote_type,
    client_id: input.client_id || null,
    site_id: input.site_id || null,
    prospect_name: input.prospect_name?.trim() || null,
    prospect_contact: input.prospect_contact?.trim() || null,
    prospect_email: input.prospect_email?.trim() || null,
    prospect_phone: input.prospect_phone?.trim() || null,
    prospect_address: input.prospect_address?.trim() || null,
    summary: input.summary?.trim() || null,
    notes: input.notes?.trim() || null,
    terms: input.terms?.trim() || null,
    vat_rate: input.vat_rate,
    discount_pence: Math.max(0, Math.round(input.discount_pence) || 0),
    subtotal_pence: totals.subtotalPence,
    vat_pence: totals.vatPence,
    total_pence: totals.totalPence,
    show_line_items: input.show_line_items ?? true,
    valid_until: input.valid_until || null,
  }

  let quoteId = input.id

  if (quoteId) {
    const { error: upErr } = await supabase.from('quotes').update(header).eq('id', quoteId)
    if (upErr) return { ok: false, error: 'Could not update the quote.' }
    // Replace existing systems (cascade removes their line items) and any
    // remaining line items.
    await supabase.from('quote_systems').delete().eq('quote_id', quoteId)
    await supabase.from('quote_line_items').delete().eq('quote_id', quoteId)
  } else {
    const { data: created, error: insErr } = await supabase
      .from('quotes')
      .insert({ ...header, status: 'draft', created_by: user.id })
      .select('id')
      .single()
    if (insErr || !created) return { ok: false, error: 'Could not create the quote.' }
    quoteId = (created as { id: string }).id
  }

  const persistErr = await persistSystems(supabase, quoteId, input.systems)
  if (persistErr) return { ok: false, error: persistErr }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${quoteId}`)
  return { ok: true, id: quoteId }
}

// ---------------------------------------------------------------------
// Catalogue CRUD
// ---------------------------------------------------------------------
export interface CatalogueInput {
  id?: string
  name: string
  product_code?: string | null
  description?: string | null
  category?: string | null
  service_type_id?: string | null
  default_unit?: string | null
  unit_cost_pence: number
  margin_percent: number
  active: boolean
  }

export async function saveCatalogueItem(
  input: CatalogueInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!input.name?.trim()) return { ok: false, error: 'A name is required.' }

  const unitCost = Math.max(0, Math.round(input.unit_cost_pence) || 0)
  const margin = Number.isFinite(input.margin_percent) ? input.margin_percent : 0
  const row = {
  name: input.name.trim(),
  product_code: input.product_code?.trim() || null,
  description: input.description?.trim() || null,
  category: input.category?.trim() || null,
  service_type_id: input.service_type_id || null,
  default_unit: input.default_unit?.trim() || null,
  unit_cost_pence: unitCost,
  margin_percent: margin,
  // Derived sell price kept in sync for display + back-compat.
  default_unit_price_pence: sellFromCost(unitCost, margin),
  active: input.active,
  }

  if (input.id) {
    const { error: upErr } = await supabase
      .from('quote_catalogue_items')
      .update(row)
      .eq('id', input.id)
    if (upErr) return { ok: false, error: 'Could not update the catalogue item.' }
  } else {
    const { error: insErr } = await supabase
      .from('quote_catalogue_items')
      .insert({ ...row, created_by: user.id })
    if (insErr) return { ok: false, error: 'Could not create the catalogue item.' }
  }

  revalidatePath('/dashboard/sales/catalogue')
  return { ok: true }
}

export async function deleteCatalogueItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('quote_catalogue_items').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the catalogue item.' }

  revalidatePath('/dashboard/sales/catalogue')
  return { ok: true }
}

// Search the catalogue on demand. The catalogue can hold tens of thousands of
// items, so the quote builder never loads it all up front (that made the New
// Quote page extremely slow). Instead it calls this with the user's query and
// we return a small, capped result set from the database.
export async function searchCatalogueItems(
  query: string,
  options: { limit?: number } = {},
): Promise<QuoteCatalogueItem[]> {
  const { supabase, error } = await requireStaff()
  if (error) return []

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50)
  let q = supabase.from('quote_catalogue_items').select('*').eq('active', true)

  const term = query.trim()
  if (term) {
    // Match against name, product code, or category (case-insensitive).
    const escaped = term.replace(/[%_,]/g, (m) => `\\${m}`)
    q = q.or(
      `name.ilike.%${escaped}%,product_code.ilike.%${escaped}%,category.ilike.%${escaped}%`,
    )
  }

  const { data, error: dbError } = await q.order('name').limit(limit)
  if (dbError || !data) return []
  return data as QuoteCatalogueItem[]
}

// Paginated catalogue listing for the catalogue admin page. The table has
// thousands of rows, so we never load them all into the browser — we fetch one
// page at a time from the database (with an optional search term) and return the
// total count so the UI can render pager controls. Unlike searchCatalogueItems
// this includes inactive items so they can be managed.
export async function fetchCataloguePage(options: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ items: QuoteCatalogueItem[]; total: number }> {
  const { supabase, error } = await requireStaff()
  if (error) return { items: [], total: 0 }

  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100)
  const page = Math.max(options.page ?? 0, 0)
  const from = page * pageSize
  const to = from + pageSize - 1

  let q = supabase.from('quote_catalogue_items').select('*', { count: 'exact' })

  const term = (options.search ?? '').trim()
  if (term) {
    const escaped = term.replace(/[%_,]/g, (m) => `\\${m}`)
    q = q.or(
      `name.ilike.%${escaped}%,product_code.ilike.%${escaped}%,category.ilike.%${escaped}%,description.ilike.%${escaped}%`,
    )
  }

  const { data, count, error: dbError } = await q.order('name').range(from, to)
  if (dbError || !data) return { items: [], total: 0 }
  return { items: data as QuoteCatalogueItem[], total: count ?? 0 }
}

// Resolve a single catalogue item by exact product code (used when a user types
// a code into a line's product-code box). Returns null when there's no match.
export async function getCatalogueItemByCode(
  code: string,
): Promise<QuoteCatalogueItem | null> {
  const trimmed = code.trim()
  if (!trimmed) return null
  const { supabase, error } = await requireStaff()
  if (error) return null

  const { data } = await supabase
    .from('quote_catalogue_items')
    .select('*')
    .eq('active', true)
    .ilike('product_code', trimmed)
    .limit(1)
    .maybeSingle()
  return (data as QuoteCatalogueItem | null) ?? null
}

/** Update only a quote's status (Draft → Sent → Accepted/Rejected/Expired). */
export async function setQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'accepted' || status === 'rejected') {
    patch.decided_at = new Date().toISOString()
  }

  // Return the affected rows so we can detect a silent no-op (e.g. wrong id or
  // a row blocked by RLS), which otherwise reports success without changing anything.
  const { data: updated, error: upErr } = await supabase
    .from('quotes')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (upErr) {
    console.log('[v0] setQuoteStatus update error:', upErr.message)
    return { ok: false, error: 'Could not update the quote status.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'Quote not found or you do not have permission to update it.' }
  }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${id}`)
  return { ok: true }
}

// Resolve the app's public base URL for building portal links inside emails.
// Prefer explicit env, then Vercel's deployment URL, then the request host.
async function resolveBaseUrl(): Promise<string> {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || (vercelUrl ? `https://${vercelUrl}` : '')
  if (envUrl) return envUrl.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || 'https'
  return host ? `${proto}://${host}`.replace(/\/$/, '') : ''
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Wrap the (plain text) draft message in a simple branded HTML email with a
// button linking to the customer portal quote.
function buildQuoteEmailHtml(args: {
  message: string
  companyName: string
  quoteLink?: string
}): string {
  const body = escapeHtml(args.message).replace(/\n/g, '<br>')
  // Render the styled button AND a plain, always-visible URL beneath it. Some
  // email clients strip or dark-invert button styles so they stop looking
  // clickable; the visible link guarantees the recipient can always reach the
  // page to view and approve the quote.
  const button = args.quoteLink
    ? `<p style="margin:24px 0;"><a href="${args.quoteLink}" style="background:#b91c1c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block;">View &amp; approve your quote</a></p>
       <p style="font-size:13px;color:#334155;margin:0 0 8px;">Or open this link in your browser:</p>
       <p style="font-size:13px;margin:0 0 8px;word-break:break-all;"><a href="${args.quoteLink}" style="color:#b91c1c;text-decoration:underline;">${escapeHtml(args.quoteLink)}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#0f172a;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(
        args.companyName,
      )}</div>
      <div style="padding:24px;font-size:14px;line-height:1.6;">
        <div>${body}</div>
        ${button}
        <p style="font-size:12px;color:#64748b;margin-top:24px;">A PDF copy of your quotation is attached to this email.</p>
      </div>
    </div>
  </body></html>`
}

/**
 * Email a quote to the client with a PDF attachment + portal link, and mark it
 * as Sent. The caller supplies an (editable) recipient, subject, and message.
 */
export async function sendQuote(args: {
  id: string
  to: string
  cc?: string[]
  subject: string
  message: string
  // When true, the client must draw a signature to approve via the public link.
  requireSignature?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const to = args.to.trim()
  if (!/.+@.+\..+/.test(to)) return { ok: false, error: 'Please enter a valid recipient email address.' }
  if (!args.subject.trim()) return { ok: false, error: 'Please enter a subject.' }

  // Load everything the PDF + email need.
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(*), site:sites(*), preparer:profiles!quotes_created_by_fkey(id, full_name)')
    .eq('id', args.id)
    .single()
  if (!quote) return { ok: false, error: 'Quote not found.' }

  const [{ data: systems }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', args.id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', args.id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const typedQuote = quote as Quote
  const companyName = (company as CompanyInfo | null)?.name || 'Pyrocel Ltd'

  // Generate the PDF attachment.
  let pdf: Buffer
  try {
    pdf = await renderQuotePdfBuffer({
      quote: typedQuote,
      systems: (systems ?? []) as QuoteSystem[],
      lines: (lines ?? []) as QuoteLineItem[],
      company: (company ?? null) as CompanyInfo | null,
    })
  } catch (e) {
    console.error('[v0] Quote PDF generation failed:', e)
    return { ok: false, error: 'Could not generate the quote PDF.' }
  }

  // Ensure the quote has a public secret link token (no client login needed).
  const shareToken = typedQuote.share_token ?? crypto.randomUUID().replace(/-/g, '')

  const baseUrl = await resolveBaseUrl()
  // Public, login-free approval page keyed by the secret token.
  const quoteLink = baseUrl ? `${baseUrl}/quote/${shareToken}` : undefined
  const html = buildQuoteEmailHtml({ message: args.message, companyName, quoteLink })
  const fileName = `Quote-${(typedQuote.reference ?? typedQuote.quote_number ?? typedQuote.id).toString().replace(/[^a-zA-Z0-9-_]/g, '')}.pdf`

  const result = await sendEmail(to, args.subject.trim(), html, {
    cc: args.cc,
    attachments: [{ filename: fileName, content: pdf }],
  })
  if (!result.success) {
    return { ok: false, error: result.error || 'The email could not be sent.' }
  }

  // Mark as sent. Don't downgrade a quote that was already accepted/rejected.
  const patch: Record<string, unknown> = {
    sent_at: new Date().toISOString(),
    share_token: shareToken,
    require_signature: !!args.requireSignature,
  }
  if (typedQuote.status === 'draft' || typedQuote.status === 'sent') {
    patch.status = 'sent'
  }
  await supabase.from('quotes').update(patch).eq('id', args.id)

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${args.id}`)
  return { ok: true }
}

/** Delete a quote (systems and line items cascade). */
export async function deleteQuote(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('quotes').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the quote.' }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  return { ok: true }
}

// Copy all systems + line items from one quote to another (preserving values).
async function copySystems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromQuoteId: string,
  toQuoteId: string,
): Promise<void> {
  const { data: systems } = await supabase
    .from('quote_systems')
    .select('*')
    .eq('quote_id', fromQuoteId)
    .order('position')
  const { data: lines } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', fromQuoteId)

  for (const s of (systems ?? []) as Array<Record<string, unknown>>) {
    const { data: newSys } = await supabase
      .from('quote_systems')
      .insert({
        quote_id: toQuoteId,
        system_type_id: s.system_type_id,
        system_name: s.system_name,
        system_code: s.system_code,
        work_type: s.work_type,
        specification: s.specification,
        conditional_values: s.conditional_values ?? {},
        design_category_id: s.design_category_id,
        design_overview: s.design_overview,
        designed_by: s.designed_by,
        designed_by_name: s.designed_by_name,
        drawing_reference: s.drawing_reference,
        survey_carried_out: s.survey_carried_out,
        survey_by: s.survey_by,
        survey_date: s.survey_date,
        margin_percent: s.margin_percent ?? 0,
        position: s.position,
        subtotal_pence: s.subtotal_pence,
      })
      .select('id')
      .single()
    if (!newSys) continue
    const newSysId = (newSys as { id: string }).id
    const systemLines = ((lines ?? []) as Array<Record<string, unknown>>)
      .filter((l) => l.system_id === s.id)
      .map((l) => ({
        quote_id: toQuoteId,
        system_id: newSysId,
        catalogue_item_id: l.catalogue_item_id,
        service_type_id: l.service_type_id,
        is_service: l.is_service ?? false,
        description: l.description,
        detail: l.detail,
        quantity: l.quantity,
        unit: l.unit,
        unit_cost_pence: l.unit_cost_pence ?? 0,
        margin_percent: l.margin_percent ?? null,
        unit_price_pence: l.unit_price_pence,
        line_total_pence: l.line_total_pence,
        position: l.position,
      }))
    if (systemLines.length > 0) {
      await supabase.from('quote_line_items').insert(systemLines)
    }
  }
}

// Resolve the master id + reference for a quote (a quote is its own master
// unless it points at one).
async function resolveMaster(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quote: Record<string, unknown>,
): Promise<{ masterId: string; reference: string | null }> {
  const masterId = (quote.master_quote_id as string | null) ?? (quote.id as string)
  let reference = (quote.reference as string | null) ?? null
  if (quote.master_quote_id) {
    const { data: master } = await supabase
      .from('quotes')
      .select('reference')
      .eq('id', quote.master_quote_id)
      .single()
    reference = (master as { reference?: string | null } | null)?.reference ?? reference
  }
  return { masterId, reference }
}

/**
 * Clone a quote for an alternate contractor/client. The clone shares the
 * master quote's reference but is its own draft record, labelled by variant.
 */
export async function cloneQuoteForContractor(
  id: string,
  variantLabel: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!variantLabel?.trim()) return { ok: false, error: 'A contractor/variant label is required.' }

  const { data: q } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (!q) return { ok: false, error: 'Quote not found.' }
  const quote = q as Record<string, unknown>
  const { masterId, reference } = await resolveMaster(supabase, quote)

  const { data: created, error: insErr } = await supabase
    .from('quotes')
    .insert({
      title: quote.title,
      quote_type: quote.quote_type,
      status: 'draft',
      reference, // inherit master reference (skips the auto-assign trigger)
      master_quote_id: masterId,
      is_master: false,
      revision: 0,
      variant_label: variantLabel.trim(),
      client_id: quote.client_id,
      site_id: quote.site_id,
      prospect_name: quote.prospect_name,
      prospect_contact: quote.prospect_contact,
      prospect_email: quote.prospect_email,
      prospect_phone: quote.prospect_phone,
      prospect_address: quote.prospect_address,
      summary: quote.summary,
      notes: quote.notes,
      terms: quote.terms,
      vat_rate: quote.vat_rate,
      discount_pence: quote.discount_pence,
      subtotal_pence: quote.subtotal_pence,
      vat_pence: quote.vat_pence,
      total_pence: quote.total_pence,
      show_line_items: quote.show_line_items,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: 'Could not clone the quote.' }
  const newId = (created as { id: string }).id

  await copySystems(supabase, id, newId)

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${masterId}`)
  return { ok: true, id: newId }
}

/**
 * Create a new revision of a quote. The revision shares the master reference,
 * increments the highest revision number in the group, and copies content.
 */
export async function createRevision(
  id: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: q } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (!q) return { ok: false, error: 'Quote not found.' }
  const quote = q as Record<string, unknown>
  const { masterId, reference } = await resolveMaster(supabase, quote)

  // Find the current highest revision across the whole group (master + members).
  const { data: members } = await supabase
    .from('quotes')
    .select('revision')
    .or(`id.eq.${masterId},master_quote_id.eq.${masterId}`)
  const maxRev = ((members ?? []) as Array<{ revision?: number }>).reduce(
    (m, r) => Math.max(m, r.revision ?? 0),
    0,
  )

  const { data: created, error: insErr } = await supabase
    .from('quotes')
    .insert({
      title: quote.title,
      quote_type: quote.quote_type,
      status: 'draft',
      reference,
      master_quote_id: masterId,
      is_master: false,
      revision: maxRev + 1,
      variant_label: quote.variant_label,
      client_id: quote.client_id,
      site_id: quote.site_id,
      prospect_name: quote.prospect_name,
      prospect_contact: quote.prospect_contact,
      prospect_email: quote.prospect_email,
      prospect_phone: quote.prospect_phone,
      prospect_address: quote.prospect_address,
      summary: quote.summary,
      notes: quote.notes,
      terms: quote.terms,
      vat_rate: quote.vat_rate,
      discount_pence: quote.discount_pence,
      subtotal_pence: quote.subtotal_pence,
      vat_pence: quote.vat_pence,
      total_pence: quote.total_pence,
      show_line_items: quote.show_line_items,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: 'Could not create a revision.' }
  const newId = (created as { id: string }).id

  await copySystems(supabase, id, newId)

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${masterId}`)
  return { ok: true, id: newId }
}

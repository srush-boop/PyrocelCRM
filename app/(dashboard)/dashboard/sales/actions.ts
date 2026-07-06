'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeQuoteTotals, QUOTE_TYPES, WORK_TYPES, sellFromCost, resolveLineMargin } from '@/lib/sales'
import { sendEmail } from '@/lib/email/send-email'
import { renderQuotePdfBuffer } from '@/lib/pdf/quote-pdf'
import { loadQuoteCatalogue } from '@/lib/sales/equipment-spec'
import { createRemedialCallsForQuote } from '@/lib/remedial'
import type {
  QuoteStatus,
  QuoteCatalogueItem,
  Quote,
  QuoteSystem,
  QuoteLineItem,
  CompanyInfo,
  QuoteMessage,
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

// A single client requirement + our response, shown in the compliance matrix.
export interface QuoteRequirementInput {
  category?: string | null
  requirement: string
  our_response?: string | null
  status: string
}

// The originating client request (pasted email text or an uploaded spec).
export interface QuoteRequirementSourceInput {
  source_type: 'paste' | 'file'
  file_name?: string | null
  file_url?: string | null
  mime_type?: string | null
  raw_text?: string | null
  summary?: string | null
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
  show_equipment_spec?: boolean
  show_design_overview?: boolean
  valid_until?: string | null
  systems: QuoteSystemInput[]
  // Client-request import: the compliance matrix and its source document.
  show_requirements_matrix?: boolean
  requirements?: QuoteRequirementInput[]
  requirementSource?: QuoteRequirementSourceInput | null
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

const VALID_REQ_STATUSES = new Set(['included', 'partial', 'excluded', 'query'])

// Persist the client-request source document + extracted requirements for a
// quote. Assumes any previous rows for the quote have already been cleared.
async function persistRequirements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  userId: string,
  source: QuoteRequirementSourceInput | null | undefined,
  requirements: QuoteRequirementInput[] | undefined,
): Promise<string | null> {
  let sourceId: string | null = null

  if (source && (source.raw_text?.trim() || source.file_url || source.summary?.trim())) {
    const { data: srcRow, error: srcErr } = await supabase
      .from('quote_requirement_sources')
      .insert({
        quote_id: quoteId,
        source_type: source.source_type === 'file' ? 'file' : 'paste',
        file_name: source.file_name?.trim() || null,
        file_url: source.file_url?.trim() || null,
        mime_type: source.mime_type?.trim() || null,
        raw_text: source.raw_text?.trim() || null,
        summary: source.summary?.trim() || null,
        created_by: userId,
      })
      .select('id')
      .single()
    if (srcErr) return 'Could not save the client request source.'
    sourceId = (srcRow as { id: string } | null)?.id ?? null
  }

  const rows = (requirements ?? [])
    .filter((r) => r.requirement?.trim())
    .map((r, idx) => ({
      quote_id: quoteId,
      source_id: sourceId,
      position: idx,
      category: r.category?.trim() || null,
      requirement: r.requirement.trim(),
      our_response: r.our_response?.trim() || null,
      status: VALID_REQ_STATUSES.has(r.status) ? r.status : 'included',
    }))

  if (rows.length > 0) {
    const { error: reqErr } = await supabase.from('quote_requirements').insert(rows)
    if (reqErr) return 'Could not save the quote requirements.'
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
    show_equipment_spec: input.show_equipment_spec ?? false,
    show_design_overview: input.show_design_overview ?? true,
    valid_until: input.valid_until || null,
    show_requirements_matrix: input.show_requirements_matrix ?? false,
  }

  let quoteId = input.id

  if (quoteId) {
    const { error: upErr } = await supabase.from('quotes').update(header).eq('id', quoteId)
    if (upErr) return { ok: false, error: 'Could not update the quote.' }
    // Replace existing systems (cascade removes their line items) and any
    // remaining line items.
    await supabase.from('quote_systems').delete().eq('quote_id', quoteId)
    await supabase.from('quote_line_items').delete().eq('quote_id', quoteId)
    // Replace requirements + source (cascade from source not relied upon).
    await supabase.from('quote_requirements').delete().eq('quote_id', quoteId)
    await supabase.from('quote_requirement_sources').delete().eq('quote_id', quoteId)
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

  const reqErr = await persistRequirements(
    supabase,
    quoteId,
    user.id,
    input.requirementSource,
    input.requirements,
  )
  if (reqErr) return { ok: false, error: reqErr }

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
  // Parts/catalogue items are classified by system type (e.g. Fire Alarm),
  // not by the narrower service type.
  system_type_id?: string | null
  default_unit?: string | null
  unit_cost_pence: number
  margin_percent: number
  service_sale_price_pence?: number
  ecommerce_price_pence?: number
  supplier_id?: string | null
  image_pathname?: string | null
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
  system_type_id: input.system_type_id || null,
  // Legacy classification; parts are now scoped by system type.
  service_type_id: null,
  default_unit: input.default_unit?.trim() || null,
  unit_cost_pence: unitCost,
  margin_percent: margin,
  // Derived sell price kept in sync for display + back-compat.
  default_unit_price_pence: sellFromCost(unitCost, margin),
  service_sale_price_pence: Math.max(0, Math.round(input.service_sale_price_pence ?? 0)),
  ecommerce_price_pence: Math.max(0, Math.round(input.ecommerce_price_pence ?? 0)),
  supplier_id: input.supplier_id || null,
  image_pathname: input.image_pathname ?? null,
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

  revalidatePath('/dashboard/stock/catalogue')
  return { ok: true }
}

export async function deleteCatalogueItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('quote_catalogue_items').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the catalogue item.' }

  revalidatePath('/dashboard/stock/catalogue')
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
    // Match against name, product code, description, or category (case-insensitive).
    const escaped = term.replace(/[%_,]/g, (m) => `\\${m}`)
    q = q.or(
      `name.ilike.%${escaped}%,product_code.ilike.%${escaped}%,description.ilike.%${escaped}%,category.ilike.%${escaped}%`,
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
}): Promise<{ items: QuoteCatalogueItem[]; total: number; stockedItemIds: string[] }> {
  const { supabase, error } = await requireStaff()
  if (error) return { items: [], total: 0, stockedItemIds: [] }

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
  if (dbError || !data) return { items: [], total: 0, stockedItemIds: [] }

  // Flag which of these catalogue items already exist as stock parts so the UI
  // can show an "In stock" badge and avoid adding them twice.
  const items = data as QuoteCatalogueItem[]
  let stockedItemIds: string[] = []
  if (items.length > 0) {
    const { data: parts } = await supabase
      .from('parts')
      .select('catalogue_item_id')
      .in(
        'catalogue_item_id',
        items.map((i) => i.id),
      )
    stockedItemIds = (parts || [])
      .map((p) => (p as { catalogue_item_id: string | null }).catalogue_item_id)
      .filter((id): id is string => Boolean(id))
  }

  return { items, total: count ?? 0, stockedItemIds }
}

// Returns the entire catalogue (all pages) for exporting to CSV. Honours the
// same search filter as the paged view so users can export a filtered subset.
// Batched to stay within Supabase's default 1000-row response cap.
export async function fetchAllCatalogueItems(
  search?: string,
): Promise<QuoteCatalogueItem[]> {
  const { supabase, error } = await requireStaff()
  if (error) return []

  const term = (search ?? '').trim()
  const batchSize = 1000
  const all: QuoteCatalogueItem[] = []

  for (let from = 0; ; from += batchSize) {
    let q = supabase.from('quote_catalogue_items').select('*')
    if (term) {
      const escaped = term.replace(/[%_,]/g, (m) => `\\${m}`)
      q = q.or(
        `name.ilike.%${escaped}%,product_code.ilike.%${escaped}%,category.ilike.%${escaped}%,description.ilike.%${escaped}%`,
      )
    }
    const { data, error: dbError } = await q.order('name').range(from, from + batchSize - 1)
    if (dbError || !data || data.length === 0) break
    all.push(...(data as QuoteCatalogueItem[]))
    if (data.length < batchSize) break
  }

  return all
}

export interface CatalogueImportResult {
  ok: boolean
  created: number
  updated: number
  errors: string[]
}

// Bulk import catalogue items from parsed CSV rows (objects keyed by lower-cased
// header). Matches the columns produced by the Download export so a downloaded
// file can be edited and re-uploaded. Existing items are matched by product code
// (case-insensitive), falling back to an exact name match; anything else is
// inserted. System type and supplier are resolved by name.
export async function importCatalogueItems(
  rows: Record<string, string>[],
): Promise<CatalogueImportResult> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, created: 0, updated: 0, errors: ['Not authorised.'] }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, created: 0, updated: 0, errors: ['The file had no rows.'] }
  }

  // Lookup maps for resolving names → ids, and existing items for upsert.
  const [{ data: systemTypes }, { data: suppliers }, { data: existing }] = await Promise.all([
    supabase.from('system_types').select('id, name'),
    supabase.from('suppliers').select('id, name'),
    supabase.from('quote_catalogue_items').select('id, name, product_code'),
  ])
  const systemByName = new Map(
    (systemTypes ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]),
  )
  const supplierByName = new Map(
    (suppliers ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]),
  )
  const idByCode = new Map<string, string>()
  const idByName = new Map<string, string>()
  for (const it of existing ?? []) {
    if (it.product_code) idByCode.set(it.product_code.trim().toLowerCase(), it.id)
    if (it.name) idByName.set(it.name.trim().toLowerCase(), it.id)
  }

  // Accept a few header spellings for each field.
  const pick = (row: Record<string, string>, keys: string[]) => {
    for (const k of keys) {
      const v = row[k]
      if (v != null && v.trim() !== '') return v.trim()
    }
    return ''
  }
  const toPence = (v: string) => {
    const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }

  const errors: string[] = []
  let created = 0
  let updated = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const lineNo = i + 2 // account for the header row
    const name = pick(row, ['name', 'item', 'item name'])
    if (!name) {
      errors.push(`Row ${lineNo}: missing name — skipped.`)
      continue
    }

    const code = pick(row, ['product code', 'code', 'sku'])
    const systemName = pick(row, ['system type', 'system']).toLowerCase()
    const supplierName = pick(row, ['supplier']).toLowerCase()
    const activeRaw = pick(row, ['active']).toLowerCase()
    const unitCost = toPence(pick(row, ['unit cost (£)', 'unit cost', 'cost']))
    const marginStr = pick(row, ['margin (%)', 'margin'])
    const margin = Number.isFinite(Number.parseFloat(marginStr))
      ? Number.parseFloat(marginStr)
      : 0

    const record = {
      name,
      product_code: code || null,
      description: pick(row, ['description', 'notes']) || null,
      category: pick(row, ['category']) || null,
      system_type_id: systemName ? (systemByName.get(systemName) ?? null) : null,
      service_type_id: null,
      default_unit: pick(row, ['unit', 'default unit']) || null,
      unit_cost_pence: Math.max(0, unitCost),
      margin_percent: margin,
      default_unit_price_pence: sellFromCost(Math.max(0, unitCost), margin),
      service_sale_price_pence: toPence(pick(row, ['service sale price (£)', 'service sale price'])),
      ecommerce_price_pence: toPence(pick(row, ['ecommerce price (£)', 'ecommerce price'])),
      supplier_id: supplierName ? (supplierByName.get(supplierName) ?? null) : null,
      active: activeRaw ? !['no', 'false', '0', 'n'].includes(activeRaw) : true,
    }

    if (systemName && !systemByName.has(systemName)) {
      errors.push(`Row ${lineNo}: unknown system type "${systemName}" — left blank.`)
    }
    if (supplierName && !supplierByName.has(supplierName)) {
      errors.push(`Row ${lineNo}: unknown supplier "${supplierName}" — left blank.`)
    }

    const matchId =
      (code && idByCode.get(code.toLowerCase())) || idByName.get(name.toLowerCase()) || null

    if (matchId) {
      const { error: upErr } = await supabase
        .from('quote_catalogue_items')
        .update(record)
        .eq('id', matchId)
      if (upErr) errors.push(`Row ${lineNo}: could not update "${name}".`)
      else updated++
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('quote_catalogue_items')
        .insert({ ...record, created_by: user.id })
        .select('id')
        .single()
      if (insErr) {
        errors.push(`Row ${lineNo}: could not create "${name}".`)
      } else {
        created++
        // Track new rows so later duplicates in the same file update, not dupe.
        if (code) idByCode.set(code.toLowerCase(), ins.id)
        idByName.set(name.toLowerCase(), ins.id)
      }
    }
  }

  revalidatePath('/dashboard/stock/catalogue')
  return { ok: true, created, updated, errors }
}

// Create stock parts from selected sales-catalogue items so they can be issued
// to locations. Each part links back to its catalogue item; items already
// stocked are skipped so nothing is added twice.
export async function addCatalogueItemsToStock(
  itemIds: string[],
): Promise<{ ok: boolean; added: number; skipped: number; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, added: 0, skipped: 0, error: error ?? 'Not authorised.' }

  const ids = Array.from(new Set(itemIds.filter(Boolean)))
  if (ids.length === 0) return { ok: false, added: 0, skipped: 0, error: 'No items selected.' }

  // Load the chosen catalogue items.
  const { data: catItems, error: catErr } = await supabase
    .from('quote_catalogue_items')
    .select('id, name, product_code, description, default_unit, unit_cost_pence, supplier_id')
    .in('id', ids)
  if (catErr || !catItems) {
    return { ok: false, added: 0, skipped: 0, error: 'Could not load catalogue items.' }
  }

  // Skip any already linked to a stock part.
  const { data: existing } = await supabase
    .from('parts')
    .select('catalogue_item_id')
    .in('catalogue_item_id', ids)
  const alreadyStocked = new Set(
    (existing || [])
      .map((p) => (p as { catalogue_item_id: string | null }).catalogue_item_id)
      .filter(Boolean),
  )

  const rows = (
    catItems as {
      id: string
      name: string
      product_code: string | null
      description: string | null
      default_unit: string | null
      unit_cost_pence: number
      supplier_id: string | null
    }[]
  )
    .filter((c) => !alreadyStocked.has(c.id))
    .map((c) => ({
      name: c.name,
      sku: c.product_code?.trim() || null,
      unit: c.default_unit?.trim() || 'each',
      // parts.unit_cost is stored in pounds; catalogue cost is in pence.
      unit_cost: Math.round(c.unit_cost_pence) / 100,
      default_min_level: 0,
      description: c.description?.trim() || null,
      catalogue_item_id: c.id,
      // Inherit the product supplier from the catalogue item.
      supplier_id: c.supplier_id ?? null,
      is_active: true,
    }))

  const skipped = ids.length - rows.length
  if (rows.length === 0) return { ok: true, added: 0, skipped }

  const { error: insErr } = await supabase.from('parts').insert(rows)
  if (insErr) {
    return { ok: false, added: 0, skipped, error: 'Could not add the selected items to stock.' }
  }

  revalidatePath('/dashboard/stock/parts')
  revalidatePath('/dashboard/stock/catalogue')
  return { ok: true, added: rows.length, skipped }
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

  // When a remedial quote is accepted, raise the remedial call(s) automatically
  // so the works are scheduled and the site/service pre-attendance alert fires.
  if (status === 'accepted') {
    await createRemedialCallsForQuote(supabase, id)
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/defects')
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
  try {
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
  const typedLines = (lines ?? []) as QuoteLineItem[]

  // Only pay the catalogue lookup when the quote opts into the equipment spec.
  const catalogue = typedQuote.show_equipment_spec
    ? await loadQuoteCatalogue(supabase, typedLines)
    : []

  // Generate the PDF attachment.
  let pdf: Buffer
  try {
    pdf = await renderQuotePdfBuffer({
      quote: typedQuote,
      systems: (systems ?? []) as QuoteSystem[],
      lines: typedLines,
      company: (company ?? null) as CompanyInfo | null,
      catalogue,
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
    // In the preview / any environment without RESEND_API_KEY, email sending is
    // disabled. Surface a clear, actionable message rather than a generic error.
    if (result.error === 'Email service not configured') {
      return {
        ok: false,
        error:
          'Email isn’t configured in this environment, so the quote couldn’t be sent. Add a RESEND_API_KEY to enable sending. You can still use "View / PDF" to download and share the quote manually.',
      }
    }
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
  } catch (e) {
    // Never let an unexpected error bubble up as an opaque Server Action digest
    // (e.g. "ERROR 3791787566"). Log the real cause server-side and return a
    // readable message the dialog can show.
    console.error('[v0] sendQuote unexpected failure:', e)
    return {
      ok: false,
      error:
        e instanceof Error
          ? `The quote could not be sent: ${e.message}`
          : 'The quote could not be sent due to an unexpected error.',
    }
  }
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
      show_equipment_spec: quote.show_equipment_spec,
      show_design_overview: quote.show_design_overview,
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
      show_equipment_spec: quote.show_equipment_spec,
      show_design_overview: quote.show_design_overview,
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

// --- Client query thread (staff side) -------------------------------------

// Mark all outstanding client queries on a quote as read. Called when staff
// open the quote so the unread badge clears.
export async function markQuoteQueriesRead(
  quoteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (!user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: updateError } = await supabase
    .from('quote_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('quote_id', quoteId)
    .eq('author_type', 'client')
    .is('read_at', null)

  if (updateError) {
    console.log('[v0] markQuoteQueriesRead error:', updateError.message)
    return { ok: false, error: 'Could not update messages.' }
  }

  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${quoteId}`)
  return { ok: true }
}

// Post a staff reply to a quote's client query thread and mark any outstanding
// client queries as read. Returns the refreshed thread.
export async function replyToQuoteMessage(args: {
  quoteId: string
  body: string
}): Promise<{ ok: boolean; error?: string; messages?: QuoteMessage[] }> {
  const { supabase, user, error } = await requireStaff()
  if (!user) return { ok: false, error: error ?? 'Not authorised.' }

  const body = args.body?.trim()
  if (!body) return { ok: false, error: 'Please enter a reply.' }
  if (body.length > 4000) return { ok: false, error: 'Your reply is too long.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const authorName = (profile as { full_name?: string | null } | null)?.full_name || null

  const { error: insertError } = await supabase.from('quote_messages').insert({
    quote_id: args.quoteId,
    author_type: 'staff',
    author_name: authorName,
    body,
    created_by: user.id,
  })

  if (insertError) {
    console.log('[v0] replyToQuoteMessage insert error:', insertError.message)
    return { ok: false, error: 'Could not send your reply. Please try again.' }
  }

  // Clear the unread badge now that staff have engaged with the thread.
  await supabase
    .from('quote_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('quote_id', args.quoteId)
    .eq('author_type', 'client')
    .is('read_at', null)

  const { data: messages } = await supabase
    .from('quote_messages')
    .select('*')
    .eq('quote_id', args.quoteId)
    .order('created_at', { ascending: true })

  revalidatePath('/dashboard/sales/quotes')
  revalidatePath(`/dashboard/sales/${args.quoteId}`)
  return { ok: true, messages: (messages ?? []) as QuoteMessage[] }
}

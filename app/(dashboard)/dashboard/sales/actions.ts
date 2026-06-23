'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeQuoteTotals, lineTotalPence, QUOTE_TYPES, WORK_TYPES } from '@/lib/sales'
import type { QuoteStatus } from '@/lib/types/database'

const VALID_QUOTE_TYPES = new Set(QUOTE_TYPES.map((t) => t.value))
const VALID_WORK_TYPES = new Set(WORK_TYPES.map((t) => t.code))

// Shape sent from the quote builder. System/line ids are client-side temp
// ids used only to wire line items to their system before persistence.
export interface QuoteLineInput {
  description: string
  detail?: string | null
  service_type_id?: string | null
  catalogue_item_id?: string | null
  quantity: number
  unit?: string | null
  unit_price_pence: number
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
  lines: QuoteLineInput[]
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
function buildLineRows(
  quoteId: string,
  systemId: string,
  lines: QuoteLineInput[],
) {
  const rows = lines
    .filter((l) => l.description?.trim())
    .map((l, idx) => ({
      quote_id: quoteId,
      system_id: systemId,
      catalogue_item_id: l.catalogue_item_id || null,
      service_type_id: l.service_type_id || null,
      description: l.description.trim(),
      detail: l.detail?.trim() || null,
      quantity: l.quantity || 0,
      unit: l.unit?.trim() || null,
      unit_price_pence: Math.round(l.unit_price_pence) || 0,
      line_total_pence: lineTotalPence(l),
      position: idx,
    }))
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
    const { rows: previewRows, subtotal } = buildLineRows(quoteId, 'preview', system.lines)
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
        position: pos++,
        subtotal_pence: subtotal,
      })
      .select('id')
      .single()
    if (sysErr || !sys) return 'Could not save a quote system.'

    const systemId = (sys as { id: string }).id
    const { rows } = buildLineRows(quoteId, systemId, system.lines)
    void previewRows
    if (rows.length > 0) {
      const { error: lineErr } = await supabase.from('quote_line_items').insert(rows)
      if (lineErr) return 'Could not save quote line items.'
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

  // Flatten lines to compute authoritative totals.
  const allLines = input.systems.flatMap((s) => s.lines)
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
  revalidatePath(`/dashboard/sales/${quoteId}`)
  return { ok: true, id: quoteId }
}

// ---------------------------------------------------------------------
// Catalogue CRUD
// ---------------------------------------------------------------------
export interface CatalogueInput {
  id?: string
  name: string
  description?: string | null
  category?: string | null
  service_type_id?: string | null
  default_unit?: string | null
  default_unit_price_pence: number
  active: boolean
}

export async function saveCatalogueItem(
  input: CatalogueInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  if (!input.name?.trim()) return { ok: false, error: 'A name is required.' }

  const row = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    service_type_id: input.service_type_id || null,
    default_unit: input.default_unit?.trim() || null,
    default_unit_price_pence: Math.max(0, Math.round(input.default_unit_price_pence) || 0),
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

  const { error: upErr } = await supabase.from('quotes').update(patch).eq('id', id)
  if (upErr) return { ok: false, error: 'Could not update the quote status.' }

  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${id}`)
  return { ok: true }
}

/** Delete a quote (systems and line items cascade). */
export async function deleteQuote(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('quotes').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the quote.' }

  revalidatePath('/dashboard/sales')
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
        description: l.description,
        detail: l.detail,
        quantity: l.quantity,
        unit: l.unit,
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
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: 'Could not clone the quote.' }
  const newId = (created as { id: string }).id

  await copySystems(supabase, id, newId)

  revalidatePath('/dashboard/sales')
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
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: 'Could not create a revision.' }
  const newId = (created as { id: string }).id

  await copySystems(supabase, id, newId)

  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${masterId}`)
  return { ok: true, id: newId }
}

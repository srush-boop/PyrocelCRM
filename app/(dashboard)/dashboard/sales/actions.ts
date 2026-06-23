'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeQuoteTotals, lineTotalPence, QUOTE_TYPES } from '@/lib/sales'
import type { QuoteStatus } from '@/lib/types/database'

const VALID_QUOTE_TYPES = new Set(QUOTE_TYPES.map((t) => t.value))

// Shape sent from the quote builder. Section/line ids are client-side temp
// ids used only to wire line items to their section before persistence.
export interface QuoteLineInput {
  description: string
  detail?: string | null
  service_type_id?: string | null
  catalogue_item_id?: string | null
  quantity: number
  unit?: string | null
  unit_price_pence: number
}

export interface QuoteSectionInput {
  title: string
  description?: string | null
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
  sections: QuoteSectionInput[]
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

/**
 * Create or update a quote together with its sections and line items.
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
  const allLines = input.sections.flatMap((s) => s.lines)
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
    // Replace existing sections (cascade removes their line items) and any
    // section-less line items.
    await supabase.from('quote_sections').delete().eq('quote_id', quoteId)
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

  // Insert sections and their line items.
  let sectionPos = 0
  for (const section of input.sections) {
    const { data: sec, error: secErr } = await supabase
      .from('quote_sections')
      .insert({
        quote_id: quoteId,
        title: section.title?.trim() || 'Section',
        description: section.description?.trim() || null,
        position: sectionPos++,
      })
      .select('id')
      .single()
    if (secErr || !sec) return { ok: false, error: 'Could not save a quote section.' }

    const sectionId = (sec as { id: string }).id
    const rows = section.lines
      .filter((l) => l.description?.trim())
      .map((l, idx) => ({
        quote_id: quoteId,
        section_id: sectionId,
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

    if (rows.length > 0) {
      const { error: lineErr } = await supabase.from('quote_line_items').insert(rows)
      if (lineErr) return { ok: false, error: 'Could not save quote line items.' }
    }
  }

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

/** Delete a quote (sections and line items cascade). */
export async function deleteQuote(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: delErr } = await supabase.from('quotes').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the quote.' }

  revalidatePath('/dashboard/sales')
  return { ok: true }
}

/** Duplicate a quote (header + sections + lines) as a new draft. */
export async function duplicateQuote(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: q } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (!q) return { ok: false, error: 'Quote not found.' }
  const quote = q as Record<string, unknown>

  const { data: created, error: insErr } = await supabase
    .from('quotes')
    .insert({
      title: `${quote.title as string} (copy)`,
      quote_type: quote.quote_type,
      status: 'draft',
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
  if (insErr || !created) return { ok: false, error: 'Could not duplicate the quote.' }
  const newId = (created as { id: string }).id

  const { data: sections } = await supabase
    .from('quote_sections')
    .select('*')
    .eq('quote_id', id)
    .order('position')
  const { data: lines } = await supabase.from('quote_line_items').select('*').eq('quote_id', id)

  for (const s of (sections ?? []) as Array<Record<string, unknown>>) {
    const { data: newSec } = await supabase
      .from('quote_sections')
      .insert({
        quote_id: newId,
        title: s.title,
        description: s.description,
        position: s.position,
      })
      .select('id')
      .single()
    if (!newSec) continue
    const newSecId = (newSec as { id: string }).id
    const sectionLines = ((lines ?? []) as Array<Record<string, unknown>>)
      .filter((l) => l.section_id === s.id)
      .map((l) => ({
        quote_id: newId,
        section_id: newSecId,
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
    if (sectionLines.length > 0) {
      await supabase.from('quote_line_items').insert(sectionLines)
    }
  }

  revalidatePath('/dashboard/sales')
  return { ok: true, id: newId }
}

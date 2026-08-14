'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { put } from '@vercel/blob'
import { parseDocumentFile } from '@/lib/ai/parse-document'
import type {
  QuoteSection,
  QuoteSectionElement,
  QuoteElementType,
  QuoteTableColumn,
} from '@/lib/types/database'

type Result = { ok: boolean; error?: string }

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'Not authenticated' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase: null, error: 'Not authorised' as const }
  }
  return { supabase, error: null }
}

// ---------- System types ----------
export async function saveSystemType(input: {
  id?: string
  name: string
  code: string
  description: string
  color: string
  requiresRecurringVisits?: boolean
  logbookCategory?: 'fire' | 'security' | 'other'
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    name: input.name,
    code: input.code.trim().toUpperCase() || null,
    description: input.description || null,
    color: input.color || null,
    requires_recurring_visits: input.requiresRecurringVisits ?? true,
    logbook_category: input.logbookCategory ?? 'fire',
  }

  const query = input.id
    ? supabase.from('system_types').update(payload).eq('id', input.id)
    : supabase.from('system_types').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/system-types')
  revalidatePath('/dashboard/service-types')
  // Log book grouping keys off logbook_category, so refresh site log books too.
  revalidatePath('/dashboard/sites', 'layout')
  return { ok: true }
}

export async function deleteSystemType(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('system_types').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/system-types')
  revalidatePath('/dashboard/service-types')
  return { ok: true }
}

// ---------- Asset types (PPM calculator library) ----------
export async function saveAssetType(input: {
  id?: string
  system_type_id: string | null
  name: string
  description: string
  default_minutes: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    system_type_id: input.system_type_id || null,
    name: input.name.trim(),
    description: input.description || null,
    default_minutes: Number.isFinite(input.default_minutes) ? input.default_minutes : 0,
  }

  const query = input.id
    ? supabase.from('asset_types').update(payload).eq('id', input.id)
    : supabase.from('asset_types').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/asset-types')
  return { ok: true }
}

export async function deleteAssetType(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('asset_types').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/asset-types')
  return { ok: true }
}

// ---------- Quote services (global non-product services) ----------
export async function saveQuoteService(input: {
  id?: string
  name: string
  description: string
  default_price_pence: number | null
  active: boolean
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.name.trim()) return { ok: false, error: 'A service name is required' }

  const payload = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    default_price_pence:
      input.default_price_pence !== null && Number.isFinite(input.default_price_pence)
        ? input.default_price_pence
        : null,
    active: input.active,
    updated_at: new Date().toISOString(),
  }

  const query = input.id
    ? supabase.from('quote_services').update(payload).eq('id', input.id)
    : supabase.from('quote_services').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/quote-services')
  return { ok: true }
}

export async function deleteQuoteService(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('quote_services').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/quote-services')
  return { ok: true }
}

// ---------- Spec templates ----------
export async function saveSpecTemplate(input: {
  id?: string
  system_type_id: string
  work_type: string
  specification: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    system_type_id: input.system_type_id,
    work_type: input.work_type,
    specification: input.specification || null,
  }

  // Upsert on (system_type_id, work_type) so there is one template per combo.
  const { error: dbError } = await supabase
    .from('system_spec_templates')
    .upsert(payload, { onConflict: 'system_type_id,work_type' })

  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true }
}

export async function deleteSpecTemplate(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('system_spec_templates').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true }
}

// Upload a sample specification document (e.g. a BAFE SP203 spec) for a system
// type x work type. The parsed plain text becomes the AI spec builder's
// knowledge base for that discipline. Accepts .docx/.txt/.md (parsed to text);
// PDFs are rejected here because we need plain text to ground the model.
export async function uploadSpecTemplateDoc(
  formData: FormData,
): Promise<Result & { fileName?: string; charCount?: number }> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const systemTypeId = String(formData.get('system_type_id') ?? '')
  const workType = String(formData.get('work_type') ?? '')
  const file = formData.get('file')

  if (!systemTypeId || !workType) {
    return { ok: false, error: 'Select a system type and type of work first.' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file was provided.' }
  }

  const parsed = await parseDocumentFile(file)
  if (!parsed.ok || !parsed.doc) {
    return { ok: false, error: parsed.error ?? 'Could not read that file.' }
  }
  if (parsed.doc.kind !== 'text') {
    return {
      ok: false,
      error: 'PDF spec documents are not supported here. Please upload a Word (.docx) or text file.',
    }
  }

  // Store the original document privately for provenance/re-download. Private
  // blobs are served through the authenticated /api/file route.
  let fileUrl: string | null = null
  try {
    const blob = await put(`spec-templates/${systemTypeId}/${file.name}`, file, {
      access: 'private',
      addRandomSuffix: true,
    })
    fileUrl = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`
  } catch (e) {
    console.error('[v0] spec-template blob upload failed (continuing with text only):', e)
  }

  const { error: dbError } = await supabase.from('system_spec_templates').upsert(
    {
      system_type_id: systemTypeId,
      work_type: workType,
      source_file_url: fileUrl,
      source_file_name: file.name,
      source_mime_type: file.type || null,
      source_text: parsed.doc.text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'system_type_id,work_type' },
  )
  if (dbError) return { ok: false, error: dbError.message }

  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true, fileName: file.name, charCount: parsed.doc.text.length }
}

// Remove the uploaded sample document from a template (keeps the master spec text).
export async function removeSpecTemplateDoc(input: {
  system_type_id: string
  work_type: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase
    .from('system_spec_templates')
    .update({
      source_file_url: null,
      source_file_name: null,
      source_mime_type: null,
      source_text: null,
      updated_at: new Date().toISOString(),
    })
    .eq('system_type_id', input.system_type_id)
    .eq('work_type', input.work_type)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true }
}

// ---------- Work-type fields ----------
export async function saveWorkTypeField(input: {
  id?: string
  work_type: string
  system_type_id: string
  label: string
  field_key: string
  field_type: 'text' | 'number' | 'select' | 'boolean'
  options: string[]
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  if (!input.system_type_id) return { ok: false, error: 'A system type is required' }

  const payload = {
    work_type: input.work_type,
    system_type_id: input.system_type_id,
    label: input.label,
    field_key: input.field_key,
    field_type: input.field_type,
    options: input.options,
    position: input.position,
  }

  const query = input.id
    ? supabase.from('work_type_fields').update(payload).eq('id', input.id)
    : supabase.from('work_type_fields').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/work-type-fields')
  return { ok: true }
}

export async function deleteWorkTypeField(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('work_type_fields').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/work-type-fields')
  return { ok: true }
}

// Persist the order of work-type fields within a system type x work type group
// in one call (after an up/down reorder). Positions are written 0..n-1 in the
// supplied order.
export async function reorderWorkTypeFields(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('work_type_fields')
      .update({ position: i })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath('/dashboard/sales/work-type-fields')
  return { ok: true }
}

// ---------- Design categories ----------
export async function saveDesignCategory(input: {
  id?: string
  name: string
  overview: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = { name: input.name, overview: input.overview || null }

  const query = input.id
    ? supabase.from('quote_design_categories').update(payload).eq('id', input.id)
    : supabase.from('quote_design_categories').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/design-categories')
  return { ok: true }
}

export async function deleteDesignCategory(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('quote_design_categories').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/design-categories')
  return { ok: true }
}

// ---------- System x work-type set margins ----------
export async function saveSystemWorkTypeMargin(input: {
  system_type_id: string
  work_type: string
  margin_percent: number | null
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id || !input.work_type) {
    return { ok: false, error: 'System type and work type are required' }
  }

  // A null/blank margin clears the entry so it falls back to the default.
  if (input.margin_percent === null || !Number.isFinite(input.margin_percent)) {
    const { error: delError } = await supabase
      .from('system_work_type_margins')
      .delete()
      .eq('system_type_id', input.system_type_id)
      .eq('work_type', input.work_type)
    if (delError) return { ok: false, error: delError.message }
    revalidatePath('/dashboard/sales/margins')
    return { ok: true }
  }

  const { error: dbError } = await supabase.from('system_work_type_margins').upsert(
    {
      system_type_id: input.system_type_id,
      work_type: input.work_type,
      margin_percent: input.margin_percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'system_type_id,work_type' },
  )
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/margins')
  return { ok: true }
}

// ---------- Work-type settings (configurable quote sections) ----------
export async function saveWorkTypeSetting(input: {
  work_type: string
  requires_design?: boolean
  requires_ppm?: boolean
  requires_questions?: boolean
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.work_type) return { ok: false, error: 'Work type is required' }

  // Only write the flags that were provided so a single toggle can be saved
  // without clobbering the others.
  const payload: Record<string, unknown> = {
    work_type: input.work_type,
    updated_at: new Date().toISOString(),
  }
  if (input.requires_design !== undefined) payload.requires_design = input.requires_design
  if (input.requires_ppm !== undefined) payload.requires_ppm = input.requires_ppm
  if (input.requires_questions !== undefined) payload.requires_questions = input.requires_questions

  const { error: dbError } = await supabase
    .from('work_type_settings')
    .upsert(payload, { onConflict: 'work_type' })
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/margins')
  return { ok: true }
}

// ---------- Configurable quote sections (JotForm-style builder) ----------
const SECTIONS_PATH = '/dashboard/sales/quote-sections'

// Fetch all sections (with their elements) for a system type x work type combo,
// ordered by position. Used by both the configurator and the quote builder.
export async function fetchQuoteSections(
  systemTypeId: string,
  workType: string,
): Promise<QuoteSection[]> {
  const { supabase } = await requireStaff()
  if (!supabase) return []

  const { data: sections, error } = await supabase
    .from('quote_sections')
    .select('*')
    .eq('system_type_id', systemTypeId)
    .eq('work_type', workType)
    .eq('active', true)
    .order('position')
  if (error || !sections) return []

  const ids = (sections as QuoteSection[]).map((s) => s.id)
  if (ids.length === 0) return sections as QuoteSection[]

  const { data: elements } = await supabase
    .from('quote_section_elements')
    .select('*')
    .in('section_id', ids)
    .eq('active', true)
    .order('position')

  const bySection = new Map<string, QuoteSectionElement[]>()
  for (const el of (elements ?? []) as QuoteSectionElement[]) {
    const list = bySection.get(el.section_id) ?? []
    list.push(el)
    bySection.set(el.section_id, list)
  }

  return (sections as QuoteSection[]).map((s) => ({
    ...s,
    elements: bySection.get(s.id) ?? [],
  }))
}

export async function saveQuoteSection(input: {
  id?: string
  system_type_id: string
  work_type: string
  title: string
  position: number
  default_collapsed: boolean
  condition_element_key: string | null
  condition_value: string | null
}): Promise<Result & { id?: string }> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id || !input.work_type) {
    return { ok: false, error: 'System type and work type are required' }
  }
  if (!input.title.trim()) return { ok: false, error: 'A section title is required' }

  const payload = {
    system_type_id: input.system_type_id,
    work_type: input.work_type,
    title: input.title.trim(),
    position: input.position,
    default_collapsed: input.default_collapsed,
    condition_element_key: input.condition_element_key || null,
    condition_value: input.condition_value || null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { error: dbError } = await supabase
      .from('quote_sections')
      .update(payload)
      .eq('id', input.id)
    if (dbError) return { ok: false, error: dbError.message }
    revalidatePath(SECTIONS_PATH)
    return { ok: true, id: input.id }
  }

  const { data, error: dbError } = await supabase
    .from('quote_sections')
    .insert(payload)
    .select('id')
    .single()
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SECTIONS_PATH)
  return { ok: true, id: (data as { id: string }).id }
}

export async function deleteQuoteSection(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('quote_sections').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SECTIONS_PATH)
  return { ok: true }
}

// Persist the order of sections in one call (after drag/reorder).
export async function reorderQuoteSections(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('quote_sections')
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath(SECTIONS_PATH)
  return { ok: true }
}

export async function saveQuoteSectionElement(input: {
  id?: string
  section_id: string
  label: string
  element_key: string
  element_type: QuoteElementType
  options: string[] | QuoteTableColumn[]
  required: boolean
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.section_id) return { ok: false, error: 'A section is required' }
  if (!input.label.trim()) return { ok: false, error: 'An element label is required' }
  if (!input.element_key.trim()) return { ok: false, error: 'An element key is required' }

  const payload = {
    section_id: input.section_id,
    label: input.label.trim(),
    element_key: input.element_key.trim(),
    element_type: input.element_type,
    options: input.options,
    required: input.required,
    position: input.position,
    updated_at: new Date().toISOString(),
  }

  const query = input.id
    ? supabase.from('quote_section_elements').update(payload).eq('id', input.id)
    : supabase.from('quote_section_elements').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SECTIONS_PATH)
  return { ok: true }
}

export async function deleteQuoteSectionElement(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('quote_section_elements').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SECTIONS_PATH)
  return { ok: true }
}

// Persist the order of elements within a section in one call (after reorder).
export async function reorderQuoteSectionElements(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('quote_section_elements')
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath(SECTIONS_PATH)
  return { ok: true }
}

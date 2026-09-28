'use server'

import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import type { RamsHazard, RamsMasterTemplate, RamsSystemHazard } from './types'

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

export interface MatrixEntry {
  id: string
  system_type_id: string
  activity_type_id: string
  text: string
}

export interface LibraryData {
  hazards: RamsHazard[]
  systemHazards: RamsSystemHazard[]
  types: RamsMasterTemplate[]
  methodStatements: MatrixEntry[]
  scopes: MatrixEntry[]
}

const LIBRARY_PATH = '/dashboard/rams/admin/library'

async function requireApprover() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) throw new Error('Not authenticated')
  if (profile.role !== 'admin' && profile.role !== 'office') {
    throw new Error('Not authorised')
  }
}

async function guarded<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireApprover()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  try {
    return await fn()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

function clampScore(n: unknown, fallback = 3): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return fallback
  return Math.min(5, Math.max(1, v))
}

function cleanList(list: unknown): string[] {
  if (Array.isArray(list)) return list.map((s) => String(s).trim()).filter(Boolean)
  if (typeof list === 'string') return list.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean)
  return []
}

const MATRIX_TABLE = {
  method: { table: 'rams_method_statement_templates', column: 'method_statement' },
  scope: { table: 'rams_scope_of_works_templates', column: 'scope_of_works' },
} as const

export type MatrixKind = keyof typeof MATRIX_TABLE

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadLibraryData(): Promise<LibraryData> {
  const supabase = await createClient()
  const [hz, shz, types, ms, sow] = await Promise.all([
    supabase.from('rams_hazards').select('*').order('category').order('description'),
    supabase.from('rams_system_hazards').select('*').order('display_order').order('hazard_name'),
    supabase.from('rams_master_templates').select('*').order('template_type').order('name'),
    supabase.from('rams_method_statement_templates').select('id, system_type_id, activity_type_id, method_statement'),
    supabase.from('rams_scope_of_works_templates').select('id, system_type_id, activity_type_id, scope_of_works'),
  ])
  return {
    hazards: (hz.data as RamsHazard[]) ?? [],
    systemHazards: (shz.data as RamsSystemHazard[]) ?? [],
    types: (types.data as RamsMasterTemplate[]) ?? [],
    methodStatements: (ms.data ?? []).map((r) => ({
      id: r.id,
      system_type_id: r.system_type_id,
      activity_type_id: r.activity_type_id,
      text: r.method_statement ?? '',
    })),
    scopes: (sow.data ?? []).map((r) => ({
      id: r.id,
      system_type_id: r.system_type_id,
      activity_type_id: r.activity_type_id,
      text: r.scope_of_works ?? '',
    })),
  }
}

// ---------------------------------------------------------------------------
// Hazards (general library)
// ---------------------------------------------------------------------------

export async function saveHazard(values: {
  id?: string
  category: string
  description: string
  potential_consequences: string
  default_likelihood: number
  default_severity: number
  standard_controls: string[]
  is_active: boolean
}): Promise<ActionResult> {
  return guarded(async () => {
    const category = values.category.trim()
    const description = values.description.trim()
    if (!category || !description) return { success: false, error: 'Category and description are required' }
    const row = {
      category,
      description,
      potential_consequences: values.potential_consequences.trim() || null,
      default_likelihood: clampScore(values.default_likelihood),
      default_severity: clampScore(values.default_severity),
      standard_controls: cleanList(values.standard_controls),
      is_active: values.is_active,
    }
    const supabase = await createClient()
    const { error } = values.id
      ? await supabase.from('rams_hazards').update(row).eq('id', values.id)
      : await supabase.from('rams_hazards').insert(row)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

export async function deleteHazard(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const supabase = await createClient()
    const { error } = await supabase.from('rams_hazards').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

// ---------------------------------------------------------------------------
// System-specific hazards
// ---------------------------------------------------------------------------

export async function saveSystemHazard(values: {
  id?: string
  system_type_id: string
  hazard_name: string
  hazard_description: string
  potential_consequences: string
  category: string
  default_likelihood: number
  default_severity: number
  standard_controls: string[]
  display_order: number
  is_active: boolean
}): Promise<ActionResult> {
  return guarded(async () => {
    const hazard_name = values.hazard_name.trim()
    if (!values.system_type_id || !hazard_name) {
      return { success: false, error: 'System type and hazard name are required' }
    }
    const row = {
      system_type_id: values.system_type_id,
      hazard_name,
      hazard_description: values.hazard_description.trim() || null,
      potential_consequences: values.potential_consequences.trim() || null,
      category: values.category.trim() || 'System Specific',
      default_likelihood: clampScore(values.default_likelihood),
      default_severity: clampScore(values.default_severity),
      standard_controls: cleanList(values.standard_controls),
      display_order: Math.max(0, Math.round(Number(values.display_order) || 0)),
      is_active: values.is_active,
      updated_at: new Date().toISOString(),
    }
    const supabase = await createClient()
    const { error } = values.id
      ? await supabase.from('rams_system_hazards').update(row).eq('id', values.id)
      : await supabase.from('rams_system_hazards').insert(row)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

export async function deleteSystemHazard(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const supabase = await createClient()
    const { error } = await supabase.from('rams_system_hazards').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

// ---------------------------------------------------------------------------
// System & activity types (rams_master_templates)
// ---------------------------------------------------------------------------

export async function saveRamsType(values: {
  id?: string
  code: string
  name: string
  description: string
  category: string
  template_type: 'system' | 'activity'
  default_ppe: string[]
  default_method_steps: string
  is_active: boolean
}): Promise<ActionResult> {
  return guarded(async () => {
    const code = values.code.trim().toUpperCase()
    const name = values.name.trim()
    if (!code || !name) return { success: false, error: 'Code and name are required' }
    const row = {
      code,
      name,
      description: values.description.trim() || null,
      category: values.category.trim() || 'General',
      template_type: values.template_type,
      default_ppe: cleanList(values.default_ppe),
      default_method_steps: values.default_method_steps.trim() || null,
      is_active: values.is_active,
      updated_at: new Date().toISOString(),
    }
    const supabase = await createClient()
    const dupe = await supabase
      .from('rams_master_templates')
      .select('id')
      .eq('code', code)
      .neq('id', values.id ?? '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    if (dupe.data) return { success: false, error: `Code ${code} is already in use` }
    const { error } = values.id
      ? await supabase.from('rams_master_templates').update(row).eq('id', values.id)
      : await supabase.from('rams_master_templates').insert(row)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

// Types are referenced by existing RAMS documents, so we hide rather than delete.
export async function setRamsTypeActive(id: string, isActive: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const supabase = await createClient()
    const { error } = await supabase
      .from('rams_master_templates')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

// ---------------------------------------------------------------------------
// Method statements & scope of works (system × activity matrix)
// ---------------------------------------------------------------------------

export async function saveMatrixText(values: {
  kind: MatrixKind
  system_type_id: string
  activity_type_id: string
  text: string
}): Promise<ActionResult> {
  return guarded(async () => {
    const { table, column } = MATRIX_TABLE[values.kind]
    if (!values.system_type_id || !values.activity_type_id) {
      return { success: false, error: 'Pick a system type and an activity' }
    }
    const supabase = await createClient()
    const text = values.text.trim()
    const existing = await supabase
      .from(table)
      .select('id')
      .eq('system_type_id', values.system_type_id)
      .eq('activity_type_id', values.activity_type_id)
      .maybeSingle()

    let error
    if (!text) {
      if (existing.data) ({ error } = await supabase.from(table).delete().eq('id', existing.data.id))
    } else if (existing.data) {
      ;({ error } = await supabase
        .from(table)
        .update({ [column]: text, updated_at: new Date().toISOString() })
        .eq('id', existing.data.id))
    } else {
      ;({ error } = await supabase.from(table).insert({
        system_type_id: values.system_type_id,
        activity_type_id: values.activity_type_id,
        [column]: text,
      }))
    }
    if (error) return { success: false, error: error.message }
    revalidatePath(LIBRARY_PATH)
    return { success: true }
  })
}

// ---------------------------------------------------------------------------
// Excel export / import
// ---------------------------------------------------------------------------

const SHEETS = {
  types: 'Types',
  hazards: 'Hazards',
  systemHazards: 'System Hazards',
  method: 'Method Statements',
  scope: 'Scope of Works',
} as const

const joinList = (l: string[] | null | undefined) => (l ?? []).join('\n')
const yesNo = (b: boolean) => (b ? 'Yes' : 'No')
const truthy = (v: unknown) => {
  if (v === undefined || v === null || v === '') return true
  return !['no', 'n', 'false', '0', 'hidden', 'inactive'].includes(String(v).trim().toLowerCase())
}
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

export async function exportLibraryWorkbook(): Promise<ActionResult<string>> {
  return guarded(async () => {
    const data = await loadLibraryData()
    const codeById = new Map(data.types.map((t) => [t.id, t.code]))
    const wb = XLSX.utils.book_new()

    const add = (name: string, rows: Record<string, unknown>[], headers: string[]) => {
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
      ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(60, h.length + 10)) }))
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    add(
      SHEETS.types,
      data.types.map((t) => ({
        Code: t.code,
        Name: t.name,
        Type: t.template_type,
        Category: t.category,
        Description: t.description ?? '',
        'Default PPE': joinList(t.default_ppe),
        'Default Method Steps': t.default_method_steps ?? '',
        Active: yesNo(t.is_active),
      })),
      ['Code', 'Name', 'Type', 'Category', 'Description', 'Default PPE', 'Default Method Steps', 'Active'],
    )
    add(
      SHEETS.hazards,
      data.hazards.map((h) => ({
        Category: h.category,
        Description: h.description,
        Consequences: h.potential_consequences ?? '',
        Likelihood: h.default_likelihood ?? 3,
        Severity: h.default_severity ?? 3,
        Controls: joinList(h.standard_controls),
        Active: yesNo(h.is_active),
      })),
      ['Category', 'Description', 'Consequences', 'Likelihood', 'Severity', 'Controls', 'Active'],
    )
    add(
      SHEETS.systemHazards,
      data.systemHazards.map((h) => ({
        'System Code': codeById.get(h.system_type_id) ?? '',
        'Hazard Name': h.hazard_name,
        Description: h.hazard_description ?? '',
        Consequences: h.potential_consequences ?? '',
        Category: h.category,
        Likelihood: h.default_likelihood,
        Severity: h.default_severity,
        Controls: joinList(h.standard_controls),
        Order: h.display_order,
        Active: yesNo(h.is_active),
      })),
      ['System Code', 'Hazard Name', 'Description', 'Consequences', 'Category', 'Likelihood', 'Severity', 'Controls', 'Order', 'Active'],
    )
    for (const [kind, rows] of [
      ['method', data.methodStatements],
      ['scope', data.scopes],
    ] as const) {
      add(
        SHEETS[kind],
        rows.map((r) => ({
          'System Code': codeById.get(r.system_type_id) ?? '',
          'Activity Code': codeById.get(r.activity_type_id) ?? '',
          Text: r.text,
        })),
        ['System Code', 'Activity Code', 'Text'],
      )
    }

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
    return { success: true, data: base64 }
  })
}

export interface ImportSummary {
  created: number
  updated: number
  skipped: string[]
}

// Upserts by natural key (type code; hazard category+description; system code +
// hazard name; system+activity code pair). Never deletes anything.
export async function importLibraryWorkbook(base64: string): Promise<ActionResult<ImportSummary>> {
  return guarded(async () => {
    let wb: XLSX.WorkBook
    try {
      wb = XLSX.read(base64, { type: 'base64' })
    } catch {
      return { success: false, error: 'Could not read that file — is it an .xlsx workbook?' }
    }
    const rowsOf = (name: string) =>
      wb.Sheets[name] ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' }) : []

    const supabase = await createClient()
    const summary: ImportSummary = { created: 0, updated: 0, skipped: [] }
    const now = new Date().toISOString()

    // 1. Types first — everything else references them by code.
    const typeRes = await supabase.from('rams_master_templates').select('id, code')
    const idByCode = new Map((typeRes.data ?? []).map((t) => [t.code.toUpperCase(), t.id]))

    for (const [i, r] of rowsOf(SHEETS.types).entries()) {
      const code = str(r.Code).toUpperCase()
      const name = str(r.Name)
      if (!code || !name) {
        summary.skipped.push(`${SHEETS.types} row ${i + 2}: code and name required`)
        continue
      }
      const type = str(r.Type).toLowerCase() === 'system' ? 'system' : 'activity'
      const row = {
        code,
        name,
        template_type: type,
        category: str(r.Category) || 'General',
        description: str(r.Description) || null,
        default_ppe: cleanList(str(r['Default PPE'])),
        default_method_steps: str(r['Default Method Steps']) || null,
        is_active: truthy(r.Active),
        updated_at: now,
      }
      const existingId = idByCode.get(code)
      if (existingId) {
        const { error } = await supabase.from('rams_master_templates').update(row).eq('id', existingId)
        if (error) summary.skipped.push(`${SHEETS.types} ${code}: ${error.message}`)
        else summary.updated++
      } else {
        const { data, error } = await supabase.from('rams_master_templates').insert(row).select('id').single()
        if (error || !data) summary.skipped.push(`${SHEETS.types} ${code}: ${error?.message}`)
        else {
          idByCode.set(code, data.id)
          summary.created++
        }
      }
    }

    // 2. General hazards.
    const hzRes = await supabase.from('rams_hazards').select('id, category, description')
    const hzKey = (c: string, d: string) => `${c.toLowerCase()}|${d.toLowerCase()}`
    const hzIds = new Map((hzRes.data ?? []).map((h) => [hzKey(h.category, h.description), h.id]))
    for (const [i, r] of rowsOf(SHEETS.hazards).entries()) {
      const category = str(r.Category)
      const description = str(r.Description)
      if (!category || !description) {
        summary.skipped.push(`${SHEETS.hazards} row ${i + 2}: category and description required`)
        continue
      }
      const row = {
        category,
        description,
        potential_consequences: str(r.Consequences) || null,
        default_likelihood: clampScore(r.Likelihood),
        default_severity: clampScore(r.Severity),
        standard_controls: cleanList(str(r.Controls)),
        is_active: truthy(r.Active),
      }
      const id = hzIds.get(hzKey(category, description))
      const { error } = id
        ? await supabase.from('rams_hazards').update(row).eq('id', id)
        : await supabase.from('rams_hazards').insert(row)
      if (error) summary.skipped.push(`${SHEETS.hazards} row ${i + 2}: ${error.message}`)
      else if (id) summary.updated++
      else summary.created++
    }

    // 3. System hazards.
    const shRes = await supabase.from('rams_system_hazards').select('id, system_type_id, hazard_name')
    const shKey = (s: string, n: string) => `${s}|${n.toLowerCase()}`
    const shIds = new Map((shRes.data ?? []).map((h) => [shKey(h.system_type_id, h.hazard_name), h.id]))
    for (const [i, r] of rowsOf(SHEETS.systemHazards).entries()) {
      const sysId = idByCode.get(str(r['System Code']).toUpperCase())
      const hazard_name = str(r['Hazard Name'])
      if (!sysId || !hazard_name) {
        summary.skipped.push(`${SHEETS.systemHazards} row ${i + 2}: unknown system code or missing hazard name`)
        continue
      }
      const row = {
        system_type_id: sysId,
        hazard_name,
        hazard_description: str(r.Description) || null,
        potential_consequences: str(r.Consequences) || null,
        category: str(r.Category) || 'System Specific',
        default_likelihood: clampScore(r.Likelihood),
        default_severity: clampScore(r.Severity),
        standard_controls: cleanList(str(r.Controls)),
        display_order: Math.max(0, Math.round(Number(r.Order) || 0)),
        is_active: truthy(r.Active),
        updated_at: now,
      }
      const id = shIds.get(shKey(sysId, hazard_name))
      const { error } = id
        ? await supabase.from('rams_system_hazards').update(row).eq('id', id)
        : await supabase.from('rams_system_hazards').insert(row)
      if (error) summary.skipped.push(`${SHEETS.systemHazards} row ${i + 2}: ${error.message}`)
      else if (id) summary.updated++
      else summary.created++
    }

    // 4. Method statements + scope of works.
    for (const kind of ['method', 'scope'] as const) {
      const { table, column } = MATRIX_TABLE[kind]
      const existing = await supabase.from(table).select('id, system_type_id, activity_type_id')
      const ids = new Map(
        (existing.data ?? []).map((m) => [`${m.system_type_id}|${m.activity_type_id}`, m.id]),
      )
      for (const [i, r] of rowsOf(SHEETS[kind]).entries()) {
        const sysId = idByCode.get(str(r['System Code']).toUpperCase())
        const actId = idByCode.get(str(r['Activity Code']).toUpperCase())
        const text = str(r.Text)
        if (!sysId || !actId || !text) {
          summary.skipped.push(`${SHEETS[kind]} row ${i + 2}: unknown code or empty text`)
          continue
        }
        const id = ids.get(`${sysId}|${actId}`)
        const { error } = id
          ? await supabase.from(table).update({ [column]: text, updated_at: now }).eq('id', id)
          : await supabase.from(table).insert({ system_type_id: sysId, activity_type_id: actId, [column]: text })
        if (error) summary.skipped.push(`${SHEETS[kind]} row ${i + 2}: ${error.message}`)
        else if (id) summary.updated++
        else summary.created++
      }
    }

    revalidatePath(LIBRARY_PATH)
    return { success: true, data: summary }
  })
}

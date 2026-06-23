'use server'

import { revalidatePath } from 'next/cache'
import { get } from '@vercel/blob'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

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

// Normalise a header cell to a lookup key: lowercase, strip non-alphanumerics.
function key(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Candidate header names for each catalogue field (checked against the
// normalised key above). Keeps the importer tolerant of varied spreadsheets.
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'product', 'productname', 'item', 'itemname', 'description', 'title'],
  description: ['description', 'desc', 'details', 'spec', 'specification', 'notes'],
  category: ['category', 'group', 'type', 'producttype', 'systemtype'],
  unit: ['unit', 'uom', 'unitofmeasure', 'measure'],
  price: ['price', 'unitprice', 'cost', 'unitcost', 'sellprice', 'rate', 'listprice'],
}

function pickColumn(headerKeys: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headerKeys.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

function parsePrice(value: unknown): number {
  if (value == null) return 0
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(num) || num < 0) return 0
  return Math.round(num * 100) // pounds -> pence
}

export interface ImportResult {
  ok: boolean
  error?: string
  imported?: number
  updated?: number
  skipped?: number
}

/**
 * Import the current (or a specific) product spreadsheet into the quote
 * catalogue. Matches existing catalogue items by name (case-insensitive):
 * updates their price/unit/category, inserts the rest.
 */
export async function importProductSheet(sheetId?: string): Promise<ImportResult> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  // Resolve which sheet to import.
  let query = supabase.from('product_sheets').select('*')
  query = sheetId ? query.eq('id', sheetId) : query.eq('is_current', true)
  const { data: sheetRow } = await query.order('uploaded_at', { ascending: false }).limit(1).single()
  const sheet = sheetRow as { id: string; blob_pathname: string } | null
  if (!sheet) return { ok: false, error: 'No product spreadsheet found. Upload one first.' }

  // Read the private blob.
  let buffer: ArrayBuffer
  try {
    const result = await get(sheet.blob_pathname, { access: 'private' })
    if (!result) return { ok: false, error: 'The spreadsheet file could not be found.' }
    buffer = await new Response(result.stream).arrayBuffer()
  } catch (e) {
    console.error('[v0] Product sheet read error:', e)
    return { ok: false, error: 'Could not read the spreadsheet file.' }
  }

  // Parse the first worksheet as a matrix of rows.
  let rows: unknown[][]
  try {
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
  } catch (e) {
    console.error('[v0] Product sheet parse error:', e)
    return { ok: false, error: 'Could not parse the spreadsheet. Is it a valid .xlsx file?' }
  }

  if (rows.length < 2) {
    return { ok: false, error: 'The spreadsheet has no data rows.' }
  }

  const headerKeys = (rows[0] as unknown[]).map(key)
  const nameCol = pickColumn(headerKeys, FIELD_ALIASES.name)
  if (nameCol === -1) {
    return {
      ok: false,
      error: 'Could not find a product name column (e.g. "Name", "Product" or "Description").',
    }
  }
  const descCol = pickColumn(headerKeys, FIELD_ALIASES.description)
  const catCol = pickColumn(headerKeys, FIELD_ALIASES.category)
  const unitCol = pickColumn(headerKeys, FIELD_ALIASES.unit)
  const priceCol = pickColumn(headerKeys, FIELD_ALIASES.price)

  // Build catalogue rows from the spreadsheet body.
  const cell = (row: unknown[], idx: number) => (idx === -1 ? '' : String(row[idx] ?? '').trim())
  const parsed = rows
    .slice(1)
    .map((row) => {
      const name = cell(row, nameCol)
      if (!name) return null
      return {
        name,
        description: descCol !== -1 && descCol !== nameCol ? cell(row, descCol) || null : null,
        category: catCol !== -1 ? cell(row, catCol) || null : null,
        default_unit: unitCol !== -1 ? cell(row, unitCol) || null : null,
        default_unit_price_pence: priceCol !== -1 ? parsePrice(row[priceCol]) : 0,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (parsed.length === 0) {
    return { ok: false, error: 'No valid product rows were found in the spreadsheet.' }
  }

  // Match against existing catalogue items by lowercased name.
  const { data: existingData } = await supabase
    .from('quote_catalogue_items')
    .select('id, name')
  const existing = new Map<string, string>()
  for (const item of (existingData ?? []) as Array<{ id: string; name: string }>) {
    existing.set(item.name.toLowerCase(), item.id)
  }

  let imported = 0
  let updated = 0
  const toInsert: Array<Record<string, unknown>> = []

  for (const p of parsed) {
    const matchId = existing.get(p.name.toLowerCase())
    if (matchId) {
      const { error: upErr } = await supabase
        .from('quote_catalogue_items')
        .update({
          description: p.description,
          category: p.category,
          default_unit: p.default_unit,
          default_unit_price_pence: p.default_unit_price_pence,
          active: true,
        })
        .eq('id', matchId)
      if (!upErr) updated++
    } else {
      toInsert.push({ ...p, active: true, created_by: user.id })
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr, count } = await supabase
      .from('quote_catalogue_items')
      .insert(toInsert, { count: 'exact' })
    if (insErr) {
      console.error('[v0] Catalogue insert error:', insErr)
      return { ok: false, error: 'Could not import all products into the catalogue.' }
    }
    imported = count ?? toInsert.length
  }

  // Record import stats on the sheet.
  await supabase
    .from('product_sheets')
    .update({
      imported_at: new Date().toISOString(),
      imported_count: imported + updated,
      row_count: parsed.length,
    })
    .eq('id', sheet.id)

  revalidatePath('/dashboard/sales/catalogue')
  return { ok: true, imported, updated, skipped: parsed.length - imported - updated }
}

/** Remove a product sheet record (does not delete imported catalogue items). */
export async function deleteProductSheet(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  const { error: delErr } = await supabase.from('product_sheets').delete().eq('id', id)
  if (delErr) return { ok: false, error: 'Could not delete the product sheet.' }
  revalidatePath('/dashboard/sales/catalogue')
  return { ok: true }
}

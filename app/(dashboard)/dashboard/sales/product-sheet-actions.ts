'use server'

import { revalidatePath } from 'next/cache'
import { get } from '@vercel/blob'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { sellFromCost } from '@/lib/sales'

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
// normalised key above). Order matters: more specific aliases come first so
// they win the exact-match pass. Keeps the importer tolerant of varied
// spreadsheets while correctly handling headers like "Standard Cost Price"
// and "Specification Text".
const FIELD_ALIASES: Record<string, string[]> = {
  // Human-readable label used as the catalogue item name.
  name: ['name', 'productname', 'itemname', 'item', 'title', 'description'],
  // Supplier/product code stored on its own and used for matching.
  productCode: ['productcode', 'code', 'sku', 'partnumber', 'partno', 'itemcode', 'stockcode'],
  // Longer descriptive text. Specification Text is preferred over a plain
  // Description (which is normally used as the name).
  description: [
    'specificationtext',
    'spectext',
    'specification',
    'longdescription',
    'details',
    'notes',
    'desc',
    'description',
  ],
  category: ['category', 'group', 'producttype', 'systemtype'],
  unit: ['unit', 'uom', 'unitofmeasure', 'measure'],
  price: [
    'standardcostprice',
    'costprice',
    'unitcost',
    'cost',
    'buyprice',
    'unitprice',
    'sellprice',
    'listprice',
    'price',
    'rate',
  ],
}

// Resolve a column index for a field: exact normalised-header match first,
// then a "header contains alias" fallback for headers with extra words.
function pickColumn(headerKeys: string[], aliases: string[], taken: number[] = []): number {
  // Exact normalised-header match first.
  for (const alias of aliases) {
    for (let i = 0; i < headerKeys.length; i++) {
      if (!taken.includes(i) && headerKeys[i] === alias) return i
    }
  }
  // Fallback: a header that contains the alias (e.g. "standardcostprice"
  // contains "cost"). Skips empty headers and already-claimed columns.
  for (const alias of aliases) {
    for (let i = 0; i < headerKeys.length; i++) {
      if (!taken.includes(i) && headerKeys[i] && headerKeys[i].includes(alias)) return i
    }
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
    return {
      ok: false,
      error: 'Could not parse the spreadsheet. Is it a valid .xlsx, .xls or .csv file?',
    }
  }

  if (rows.length < 2) {
    return { ok: false, error: 'The spreadsheet has no data rows.' }
  }

  const headerKeys = (rows[0] as unknown[]).map(key)
  // Resolve columns, tracking which are already claimed so a single header
  // (e.g. "Description") is never used for two different fields.
  const nameCol = pickColumn(headerKeys, FIELD_ALIASES.name)
  if (nameCol === -1) {
    return {
      ok: false,
      error: 'Could not find a product name column (e.g. "Name", "Product" or "Description").',
    }
  }
  const codeCol = pickColumn(headerKeys, FIELD_ALIASES.productCode, [nameCol])
  const descCol = pickColumn(headerKeys, FIELD_ALIASES.description, [nameCol, codeCol])
  const catCol = pickColumn(headerKeys, FIELD_ALIASES.category, [nameCol, codeCol, descCol])
  const unitCol = pickColumn(headerKeys, FIELD_ALIASES.unit, [nameCol, codeCol, descCol, catCol])
  const priceCol = pickColumn(headerKeys, FIELD_ALIASES.price, [
    nameCol,
    codeCol,
    descCol,
    catCol,
    unitCol,
  ])

  // Build catalogue rows from the spreadsheet body.
  const cell = (row: unknown[], idx: number) => (idx === -1 ? '' : String(row[idx] ?? '').trim())
  const parsed = rows
    .slice(1)
    .map((row) => {
      const name = cell(row, nameCol)
      if (!name) return null
      // The spreadsheet price column is the supplier unit cost. Import it as the
      // cost at 0% margin so the derived sell price equals the cost until staff
      // set a margin in the catalogue.
      const cost = priceCol !== -1 ? parsePrice(row[priceCol]) : 0
      return {
        name,
        product_code: codeCol !== -1 ? cell(row, codeCol) || null : null,
        description: descCol !== -1 ? cell(row, descCol) || null : null,
        category: catCol !== -1 ? cell(row, catCol) || null : null,
        default_unit: unitCol !== -1 ? cell(row, unitCol) || null : null,
        unit_cost_pence: cost,
        margin_percent: 0,
        default_unit_price_pence: cost,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (parsed.length === 0) {
    return { ok: false, error: 'No valid product rows were found in the spreadsheet.' }
  }

  // Match against existing catalogue items, keeping their current margin so
  // re-importing supplier costs doesn't wipe set margins. The match key mirrors
  // the unique index on the table: lower(name) + lower(product_code). Matching
  // on this exact key guarantees an existing row is always updated rather than
  // re-inserted, so a repeated import can never trip the unique constraint.
  const dedupeKey = (name: string, code: string | null) =>
    `${name.trim().toLowerCase()}|${(code ?? '').trim().toLowerCase()}`

  const { data: existingData } = await supabase
    .from('quote_catalogue_items')
    .select('id, name, product_code, margin_percent')
  type ExistingItem = { id: string; margin_percent: number }
  const byKey = new Map<string, ExistingItem>()
  for (const item of (existingData ?? []) as Array<{
    id: string
    name: string
    product_code: string | null
    margin_percent: number
  }>) {
    byKey.set(dedupeKey(item.name, item.product_code), {
      id: item.id,
      margin_percent: item.margin_percent ?? 0,
    })
  }

  let imported = 0
  let updated = 0
  // Collapse rows that repeat within the spreadsheet itself (last one wins) so
  // a single import never tries to insert two rows with the same natural key.
  const toInsert = new Map<string, Record<string, unknown>>()

  for (const p of parsed) {
    const key = dedupeKey(p.name, p.product_code)
    const match = byKey.get(key)
    if (match) {
      const margin = match.margin_percent ?? 0
      const { error: upErr } = await supabase
        .from('quote_catalogue_items')
        .update({
          name: p.name,
          product_code: p.product_code,
          description: p.description,
          category: p.category,
          default_unit: p.default_unit,
          unit_cost_pence: p.unit_cost_pence,
          margin_percent: margin,
          default_unit_price_pence: sellFromCost(p.unit_cost_pence, margin),
          active: true,
        })
        .eq('id', match.id)
      if (!upErr) updated++
    } else {
      toInsert.set(key, { ...p, active: true, created_by: user.id })
    }
  }

  if (toInsert.size > 0) {
    const { error: insErr, count } = await supabase
      .from('quote_catalogue_items')
      .insert(Array.from(toInsert.values()), { count: 'exact' })
    if (insErr) {
      console.error('[v0] Catalogue insert error:', insErr)
      return { ok: false, error: 'Could not import all products into the catalogue.' }
    }
    imported = count ?? toInsert.size
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

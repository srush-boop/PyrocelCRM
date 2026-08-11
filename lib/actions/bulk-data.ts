'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DATASETS, getDataset, ID_HEADER, type DatasetDef } from '@/lib/bulk-data/datasets'
import { parseScalarCell, formatScalarForExport, normaliseHeader } from '@/lib/bulk-data/transform'

type Supa = Awaited<ReturnType<typeof createClient>>

async function requireAdmin(): Promise<{ supabase?: Supa; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin') return { error: 'Only administrators can use bulk data tools.' }
  return { supabase }
}

export type SheetRow = Record<string, unknown>

export interface DatasetExport {
  ok: boolean
  error?: string
  headers?: string[]
  rows?: SheetRow[]
}

/** Row-level classification produced by analysing an uploaded sheet. */
export interface RowPlan {
  rowNumber: number
  action: 'insert' | 'update' | 'skip'
  label: string
  issues: string[]
  warnings: string[]
}

export interface MergeAnalysis {
  ok: boolean
  error?: string
  insertCount: number
  updateCount: number
  skipCount: number
  columnsIgnored: string[]
  rows: RowPlan[]
}

export interface MergeResult {
  ok: boolean
  error?: string
  inserted: number
  updated: number
  skipped: number
}

/**
 * Normalise a foreign-key match value for tolerant comparison: trim, lowercase,
 * and collapse any internal runs of whitespace to a single space. This means a
 * sheet value like "Friday  01" (double space) or " friday 01 " still matches
 * the stored "Friday 01", instead of silently failing to resolve.
 */
function normaliseFkValue(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Build a lookup of normalised matchValue -> id for a foreign-key table. */
async function buildFkMap(
  supabase: Supa,
  table: string,
  matchColumn: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data } = await supabase.from(table).select(`id, ${matchColumn}`)
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    const key = row[matchColumn]
    if (key != null && String(key).trim() !== '') {
      map.set(normaliseFkValue(key), String(row.id))
    }
  }
  return map
}

/** Build reverse map id -> displayName for exporting fk columns as names. */
async function buildFkReverseMap(
  supabase: Supa,
  table: string,
  matchColumn: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data } = await supabase.from(table).select(`id, ${matchColumn}`)
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    map.set(String(row.id), row[matchColumn] == null ? '' : String(row[matchColumn]))
  }
  return map
}

/**
 * Fetch all rows of a dataset shaped as spreadsheet rows (human headers, £ money,
 * fk ids resolved back to names) for export.
 */
export async function fetchDatasetRows(key: string): Promise<DatasetExport> {
  const { supabase, error } = await requireAdmin()
  if (error || !supabase) return { ok: false, error: error ?? 'Not authorised.' }

  const ds = getDataset(key)
  if (!ds) return { ok: false, error: 'Unknown dataset.' }

  const dbFields = [ds.idField, ...ds.columns.map((c) => c.field)]
  const { data, error: qErr } = await supabase.from(ds.table).select(dbFields.join(', '))
  if (qErr) {
    console.log('[v0] bulk-data export query failed:', qErr.message)
    return { ok: false, error: 'Could not read that data.' }
  }

  // Resolve fk id -> name maps up front.
  const fkReverse = new Map<string, Map<string, string>>()
  for (const col of ds.columns) {
    if (col.kind === 'fk_name' && col.fk) {
      fkReverse.set(col.field, await buildFkReverseMap(supabase, col.fk.table, col.fk.matchColumn))
    }
  }

  const headers = [ID_HEADER, ...ds.columns.map((c) => c.header)]
  const dataRows = (data as unknown as Record<string, unknown>[] | null) ?? []
  const rows: SheetRow[] = dataRows.map((rec) => {
    const out: SheetRow = { [ID_HEADER]: rec[ds.idField] ?? '' }
    for (const col of ds.columns) {
      if (col.kind === 'fk_name') {
        const id = rec[col.field]
        out[col.header] = id == null ? '' : (fkReverse.get(col.field)?.get(String(id)) ?? '')
      } else {
        out[col.header] = formatScalarForExport(rec[col.field], col.kind)
      }
    }
    return out
  })

  return { ok: true, headers, rows }
}

/** Find the value in a raw sheet row for a given header, tolerant of case/spacing. */
function readCell(row: SheetRow, header: string): unknown {
  const target = normaliseHeader(header)
  for (const k of Object.keys(row)) {
    if (normaliseHeader(k) === target) return row[k]
  }
  return undefined
}

interface BuiltRow {
  dbValues: Record<string, unknown>
  issues: string[]
  warnings: string[]
  naturalKeyValue: string | null
  providedId: string | null
  label: string
}

/** Convert one raw sheet row into db values + collect issues/warnings. */
function buildRow(
  ds: DatasetDef,
  row: SheetRow,
  fkMaps: Map<string, Map<string, string>>,
): BuiltRow {
  const dbValues: Record<string, unknown> = {}
  const issues: string[] = []
  const warnings: string[] = []

  const rawId = readCell(row, ID_HEADER)
  const providedId = rawId != null && String(rawId).trim() !== '' ? String(rawId).trim() : null

  for (const col of ds.columns) {
    const raw = readCell(row, col.header)
    const blank = raw == null || String(raw).trim() === ''

    if (col.kind === 'fk_name' && col.fk) {
      if (blank) {
        if (col.required) issues.push(`Missing ${col.header}`)
        continue
      }
      const resolved = fkMaps.get(col.field)?.get(normaliseFkValue(raw))
      if (!resolved) {
        const msg = `${col.fk.label} "${String(raw).trim()}" not found`
        // Only a REQUIRED foreign key is fatal to the whole row. An optional one
        // (e.g. branch / route / property type on a site) must NOT cause the
        // entire row to be skipped — that would silently drop every other field
        // update for that record. Instead warn and leave just this column
        // unchanged, so the rest of the row still merges.
        if (col.required) {
          issues.push(msg)
        } else {
          warnings.push(`${msg} — left unchanged`)
        }
        continue
      }
      dbValues[col.field] = resolved
      continue
    }

    if (blank) {
      if (col.required) issues.push(`Missing ${col.header}`)
      continue
    }

    const parsed = parseScalarCell(
      raw,
      col.kind,
      col.kind === 'enum' ? { values: col.enumValues ?? [], aliases: col.enumAliases } : undefined,
    )
    if (parsed.error) {
      issues.push(`${col.header}: ${parsed.error}`)
      continue
    }
    dbValues[col.field] = parsed.value
  }

  // Natural key value for fallback matching.
  let naturalKeyValue: string | null = null
  if (ds.naturalKeyFields) {
    const parts = ds.naturalKeyFields.map((f) => (dbValues[f] == null ? '' : String(dbValues[f])))
    naturalKeyValue = parts.every((p) => p !== '') ? parts.join('::') : null
  } else if (ds.naturalKey) {
    const v = dbValues[ds.naturalKey]
    naturalKeyValue = v == null || String(v).trim() === '' ? null : String(v).trim().toLowerCase()
  }

  // A human-friendly label for the preview.
  const nameField = ds.columns.find((c) => c.field === 'name')?.header ?? ds.columns[0].header
  const label = String(readCell(row, nameField) ?? providedId ?? '(row)').trim() || '(row)'

  return { dbValues, issues, warnings, naturalKeyValue, providedId, label }
}

/** Shared analysis used by both preview and commit. */
async function analyse(
  supabase: Supa,
  ds: DatasetDef,
  rows: SheetRow[],
): Promise<{
  plans: RowPlan[]
  inserts: Record<string, unknown>[]
  updates: { id: string; values: Record<string, unknown> }[]
  columnsIgnored: string[]
}> {
  // FK resolution maps.
  const fkMaps = new Map<string, Map<string, string>>()
  for (const col of ds.columns) {
    if (col.kind === 'fk_name' && col.fk) {
      fkMaps.set(col.field, await buildFkMap(supabase, col.fk.table, col.fk.matchColumn))
    }
  }

  // Existing records: id set + natural-key -> id map.
  const nkFields = ds.naturalKeyFields ?? (ds.naturalKey ? [ds.naturalKey] : [])
  const selectCols = [ds.idField, ...nkFields].join(', ')
  const { data: existingData } = await supabase.from(ds.table).select(selectCols)
  const existingIds = new Set<string>()
  const existingByNk = new Map<string, string>()
  for (const rec of (existingData as unknown as Record<string, unknown>[] | null) ?? []) {
    const id = String(rec[ds.idField])
    existingIds.add(id)
    if (ds.naturalKeyFields) {
      const parts = ds.naturalKeyFields.map((f) => (rec[f] == null ? '' : String(rec[f])))
      if (parts.every((p) => p !== '')) existingByNk.set(parts.join('::'), id)
    } else if (ds.naturalKey) {
      const v = rec[ds.naturalKey]
      if (v != null && String(v).trim() !== '') existingByNk.set(String(v).trim().toLowerCase(), id)
    }
  }

  // Columns present in the file that we don't recognise.
  const knownHeaders = new Set([normaliseHeader(ID_HEADER), ...ds.columns.map((c) => normaliseHeader(c.header))])
  const ignored = new Set<string>()
  if (rows.length > 0) {
    for (const k of Object.keys(rows[0])) {
      if (!knownHeaders.has(normaliseHeader(k))) ignored.add(k)
    }
  }

  const plans: RowPlan[] = []
  const inserts: Record<string, unknown>[] = []
  const updates: { id: string; values: Record<string, unknown> }[] = []
  const seenNk = new Map<string, number>() // in-file duplicate detection

  rows.forEach((row, i) => {
    const rowNumber = i + 2 // 1-based + header row
    const built = buildRow(ds, row, fkMaps)
    const { dbValues, issues, warnings, naturalKeyValue, providedId, label } = built

    // In-file duplicate natural key.
    if (naturalKeyValue) {
      const prev = seenNk.get(naturalKeyValue)
      if (prev != null) {
        warnings.push(`Duplicate of row ${prev} in this file`)
      } else {
        seenNk.set(naturalKeyValue, rowNumber)
      }
    }

    if (issues.length > 0) {
      plans.push({ rowNumber, action: 'skip', label, issues, warnings })
      return
    }

    // Decide insert vs update.
    let targetId: string | null = null
    if (providedId && existingIds.has(providedId)) {
      targetId = providedId
    } else {
      if (providedId && !existingIds.has(providedId)) {
        warnings.push('id not found — matching by name instead')
      }
      if (naturalKeyValue && existingByNk.has(naturalKeyValue)) {
        targetId = existingByNk.get(naturalKeyValue)!
      }
    }

    if (targetId) {
      updates.push({ id: targetId, values: dbValues })
      plans.push({ rowNumber, action: 'update', label, issues: [], warnings })
    } else {
      inserts.push(dbValues)
      plans.push({ rowNumber, action: 'insert', label, issues: [], warnings })
    }
  })

  return { plans, inserts, updates, columnsIgnored: [...ignored] }
}

/** Validate an uploaded sheet and report what a merge would do — no writes. */
export async function previewMerge(key: string, rows: SheetRow[]): Promise<MergeAnalysis> {
  const { supabase, error } = await requireAdmin()
  if (error || !supabase)
    return { ok: false, error: error ?? 'Not authorised.', insertCount: 0, updateCount: 0, skipCount: 0, columnsIgnored: [], rows: [] }

  const ds = getDataset(key)
  if (!ds)
    return { ok: false, error: 'Unknown dataset.', insertCount: 0, updateCount: 0, skipCount: 0, columnsIgnored: [], rows: [] }

  if (!Array.isArray(rows) || rows.length === 0)
    return { ok: false, error: 'The file has no rows.', insertCount: 0, updateCount: 0, skipCount: 0, columnsIgnored: [], rows: [] }

  const { plans, inserts, updates, columnsIgnored } = await analyse(supabase, ds, rows)
  return {
    ok: true,
    insertCount: inserts.length,
    updateCount: updates.length,
    skipCount: plans.filter((p) => p.action === 'skip').length,
    columnsIgnored,
    rows: plans,
  }
}

/** Perform the merge (insert new + update matched). Re-validates server-side. */
export async function commitMerge(key: string, rows: SheetRow[]): Promise<MergeResult> {
  const { supabase, error } = await requireAdmin()
  if (error || !supabase) return { ok: false, error: error ?? 'Not authorised.', inserted: 0, updated: 0, skipped: 0 }

  const ds = getDataset(key)
  if (!ds) return { ok: false, error: 'Unknown dataset.', inserted: 0, updated: 0, skipped: 0 }
  if (!Array.isArray(rows) || rows.length === 0)
    return { ok: false, error: 'The file has no rows.', inserted: 0, updated: 0, skipped: 0 }

  const { plans, inserts, updates } = await analyse(supabase, ds, rows)
  const skipped = plans.filter((p) => p.action === 'skip').length

  // Inserts as a single batch.
  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from(ds.table).insert(inserts)
    if (insErr) {
      console.log('[v0] bulk-data insert failed:', insErr.message)
      return { ok: false, error: `Insert failed: ${insErr.message}`, inserted: 0, updated: 0, skipped }
    }
  }

  // Updates individually (master-data volumes are small).
  let updated = 0
  for (const u of updates) {
    const { error: upErr } = await supabase.from(ds.table).update(u.values).eq('id', u.id)
    if (upErr) {
      console.log('[v0] bulk-data update failed:', upErr.message)
      return { ok: false, error: `Update failed after ${updated} update(s): ${upErr.message}`, inserted: inserts.length, updated, skipped }
    }
    updated += 1
  }

  for (const path of ds.revalidate) revalidatePath(path)
  return { ok: true, inserted: inserts.length, updated, skipped }
}

/** Small helper so the client can render the dataset picker without importing the registry directly. */
export async function listDatasets() {
  return DATASETS.map((d) => ({ key: d.key, label: d.label, description: d.description }))
}

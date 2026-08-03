/**
 * Column spec + row parsing for the "full live site" composite import.
 *
 * Unlike the flat single-table datasets in `datasets.ts`, this template is ONE
 * ROW PER SERVICE LINE: each row carries the client, billing, site, system,
 * service and (optional) recurring charge for a single service. Rows that share
 * the same client/site/system are de-duplicated on import into a nested graph
 * (client → billing account → site → system → service → charge).
 *
 * This module is pure (no DB / server imports) so it can be used both in the
 * browser (template generation) and on the server (parsing + validation). All
 * foreign-key resolution (service type, system type) and existing-record
 * matching happens in the server action, which has database access.
 */

import type { ColumnKind } from './datasets'
import { parseScalarCell, normaliseHeader } from './transform'

export type FullSiteGroup =
  | 'Client'
  | 'Billing'
  | 'Site'
  | 'System'
  | 'Service'
  | 'Charge'

export interface FullSiteColumn {
  /** Spreadsheet header (also the key used in the parsed value object). */
  header: string
  group: FullSiteGroup
  kind: ColumnKind
  required?: boolean
  example?: string | number | boolean
  note?: string
}

/**
 * The full template, grouped for readability. Order here is the column order in
 * the generated spreadsheet.
 */
export const FULL_SITE_COLUMNS: FullSiteColumn[] = [
  // ---- Client (matched or created by name) ----
  { header: 'client_name', group: 'Client', kind: 'text', required: true, example: 'Acme Property Group', note: 'Matched by name; created if new.' },
  { header: 'client_contact_name', group: 'Client', kind: 'text', example: 'Jane Smith' },
  { header: 'client_contact_email', group: 'Client', kind: 'text', example: 'jane@acme.co.uk' },
  { header: 'client_contact_phone', group: 'Client', kind: 'text', example: '020 7946 0000' },
  { header: 'client_address', group: 'Client', kind: 'text', example: '1 High Street, London' },
  { header: 'client_status', group: 'Client', kind: 'text', example: 'live', note: "'live', 'new' or 'dead'. Defaults to live." },

  // ---- Billing account (matched or created per client by name) ----
  { header: 'billing_account_name', group: 'Billing', kind: 'text', note: 'Defaults to the client name if left blank.' },
  { header: 'billing_sage_ref', group: 'Billing', kind: 'text', example: 'ACME001' },
  { header: 'billing_invoice_email', group: 'Billing', kind: 'text' },
  { header: 'billing_invoice_address', group: 'Billing', kind: 'text' },
  { header: 'billing_invoice_postcode', group: 'Billing', kind: 'text' },
  { header: 'billing_payment_terms_days', group: 'Billing', kind: 'integer', example: 30, note: 'Defaults to 30.' },

  // ---- Site (matched or created per client by name) ----
  { header: 'site_name', group: 'Site', kind: 'text', required: true, example: 'Acme HQ' },
  { header: 'site_address', group: 'Site', kind: 'text', required: true, example: '1 High Street, London' },
  { header: 'site_postcode', group: 'Site', kind: 'text', example: 'EC1A 1BB' },
  { header: 'site_contact_name', group: 'Site', kind: 'text' },
  { header: 'site_contact_email', group: 'Site', kind: 'text' },
  { header: 'site_contact_phone', group: 'Site', kind: 'text' },
  { header: 'site_status', group: 'Site', kind: 'text', example: 'live', note: "'live', 'new' or 'dead'. Only live sites seed calls." },

  // ---- System (matched or created per site by name) ----
  { header: 'system_name', group: 'System', kind: 'text', required: true, example: 'Fire Alarm System' },
  { header: 'system_type', group: 'System', kind: 'text', example: 'Fire Alarm', note: 'Optional. Must match an existing system type name.' },
  { header: 'system_location', group: 'System', kind: 'text', example: 'Main panel, reception' },

  // ---- Service (created under the system) ----
  { header: 'service_type', group: 'Service', kind: 'text', required: true, example: 'Fire Alarm Maintenance', note: 'Must match an existing service type name.' },
  { header: 'service_frequency_value', group: 'Service', kind: 'integer', example: 6, note: 'Defaults to the service type default.' },
  { header: 'service_frequency_unit', group: 'Service', kind: 'text', example: 'months', note: "'weeks' or 'months'. Defaults to the service type default." },
  { header: 'service_worker_type', group: 'Service', kind: 'text', example: 'cdo', note: "'cdo' or 'engineer'. Defaults to the service type default." },

  // ---- Recurring charge (optional; created for the service) ----
  { header: 'charge_description', group: 'Charge', kind: 'text', example: 'Fire alarm maintenance contract', note: 'Leave blank for no charge.' },
  { header: 'charge_amount_gbp', group: 'Charge', kind: 'money_gbp', example: 250, note: 'Amount per period in £.' },
  { header: 'charge_frequency', group: 'Charge', kind: 'text', example: 'annual', note: 'weekly, monthly, quarterly, biannual or annual. Defaults to annual.' },
  { header: 'charge_timing', group: 'Charge', kind: 'text', example: 'arrears', note: 'advance, arrears, on_completion or per_visit. Defaults to arrears.' },
  { header: 'charge_quantity', group: 'Charge', kind: 'number', example: 1, note: 'Defaults to 1.' },
]

/** Parsed representation of a single spreadsheet row. */
export interface ParsedFullSiteRow {
  rowNumber: number
  values: Record<string, unknown>
  issues: string[]
}

export type SheetRow = Record<string, unknown>

/** Read a cell tolerant of header case/spacing/underscores. */
function readCell(row: SheetRow, header: string): unknown {
  const target = normaliseHeader(header)
  for (const k of Object.keys(row)) {
    if (normaliseHeader(k) === target) return row[k]
  }
  return undefined
}

/** Parse one raw row into typed scalar values, collecting per-cell issues. */
export function parseFullSiteRow(row: SheetRow, rowNumber: number): ParsedFullSiteRow {
  const values: Record<string, unknown> = {}
  const issues: string[] = []

  for (const col of FULL_SITE_COLUMNS) {
    const raw = readCell(row, col.header)
    const blank = raw == null || String(raw).trim() === ''
    if (blank) {
      if (col.required) issues.push(`Missing ${col.header}`)
      continue
    }
    const parsed = parseScalarCell(raw, col.kind)
    if (parsed.error) {
      issues.push(`${col.header}: ${parsed.error}`)
      continue
    }
    values[col.header] = parsed.value
  }

  return { rowNumber, values, issues }
}

/** Normalise a lifecycle status cell to live/new/dead (defaulting to live). */
export function normaliseStatus(raw: unknown, fallback: 'live' | 'new' | 'dead' = 'live'): 'live' | 'new' | 'dead' {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'dead' || v === 'inactive' || v === 'dormant') return 'dead'
  if (v === 'new' || v === 'engaged' || v === 'pending') return 'new'
  if (v === 'live' || v === 'active') return 'live'
  return fallback
}

/** Key helpers for de-duplicating rows into the nested graph. */
export function lc(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

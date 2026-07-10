/**
 * Shared value transforms + validation for the bulk data feature.
 * Handles scalar (non-foreign-key) conversions between spreadsheet cells and
 * database values. Foreign-key resolution needs DB lookups and lives in the
 * server action instead.
 */

import type { ColumnKind } from './datasets'

export interface CellParseResult {
  /** The converted DB value (only meaningful when there's no error and not empty). */
  value: unknown
  /** Human-readable problem with the cell, if any. */
  error?: string
  /** True when the source cell was blank. */
  empty: boolean
}

function isBlank(raw: unknown): boolean {
  return raw == null || (typeof raw === 'string' && raw.trim() === '')
}

const TRUE_SET = new Set(['true', 'yes', 'y', '1', 'active', 'x'])
const FALSE_SET = new Set(['false', 'no', 'n', '0', 'inactive'])

/**
 * Convert a raw spreadsheet cell into a database-ready scalar value.
 * Returns `empty: true` for blank cells (caller decides insert-default vs skip).
 * Does NOT handle fk_name (needs a lookup) — callers must branch on that first.
 */
export function parseScalarCell(raw: unknown, kind: ColumnKind): CellParseResult {
  if (isBlank(raw)) return { value: null, empty: true }

  switch (kind) {
    case 'text':
      return { value: String(raw).trim(), empty: false }

    case 'integer': {
      const n = Number(String(raw).trim())
      if (!Number.isFinite(n)) return { value: null, empty: false, error: `"${raw}" is not a number` }
      return { value: Math.round(n), empty: false }
    }

    case 'number': {
      const n = Number(String(raw).trim().replace(/[£,]/g, ''))
      if (!Number.isFinite(n)) return { value: null, empty: false, error: `"${raw}" is not a number` }
      return { value: n, empty: false }
    }

    case 'money_gbp': {
      const n = Number(String(raw).trim().replace(/[£,]/g, ''))
      if (!Number.isFinite(n)) return { value: null, empty: false, error: `"${raw}" is not a valid amount` }
      // Stored as integer pence.
      return { value: Math.round(n * 100), empty: false }
    }

    case 'boolean': {
      const key = String(raw).trim().toLowerCase()
      if (TRUE_SET.has(key)) return { value: true, empty: false }
      if (FALSE_SET.has(key)) return { value: false, empty: false }
      return { value: null, empty: false, error: `"${raw}" is not true/false` }
    }

    default:
      return { value: String(raw).trim(), empty: false }
  }
}

/** Format a database value for display in an exported spreadsheet cell. */
export function formatScalarForExport(dbValue: unknown, kind: ColumnKind): string | number | boolean {
  if (dbValue == null) return ''
  switch (kind) {
    case 'money_gbp': {
      const pence = Number(dbValue)
      if (!Number.isFinite(pence)) return ''
      return Math.round(pence) / 100
    }
    case 'number': {
      const n = Number(dbValue)
      return Number.isFinite(n) ? n : ''
    }
    case 'integer': {
      const n = Number(dbValue)
      return Number.isFinite(n) ? Math.round(n) : ''
    }
    case 'boolean':
      return dbValue ? 'TRUE' : 'FALSE'
    default:
      return String(dbValue)
  }
}

/** Normalise a header string for tolerant matching (case/space/underscore-insensitive). */
export function normaliseHeader(header: string): string {
  return String(header).trim().toLowerCase().replace(/[\s_-]+/g, '')
}

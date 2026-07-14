'use server'

import { requireQueryToolsUser } from '@/lib/auth/query-tools'
import {
  classifyStatement,
  runReadQuery,
  previewWrite,
  executeWrite,
  listSchema,
  type RunResult,
  type StatementKind,
  type TableInfo,
} from '@/lib/db/query-runner'

export interface QueryActionResult {
  ok: boolean
  error?: string
  kind?: StatementKind
  /** For writes in preview mode: rows were rolled back, not committed. */
  previewed?: boolean
  /** For writes in execute mode: rows were committed. */
  committed?: boolean
  result?: RunResult
}

/**
 * Run a SQL statement from the Query Builder.
 *  - Reads run immediately.
 *  - Writes/DDL run inside a rolled-back transaction (preview) unless
 *    `mode === 'execute'`, in which case they are committed.
 * Always gated by the owner-granted query-tools permission.
 */
export async function runQueryAction(
  sql: string,
  mode: 'preview' | 'execute' = 'preview',
): Promise<QueryActionResult> {
  const access = await requireQueryToolsUser()
  if (!access) return { ok: false, error: 'You do not have access to the query tools.' }

  const trimmed = (sql ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Enter a SQL statement to run.' }

  const kind = classifyStatement(trimmed)

  try {
    if (kind === 'read') {
      const result = await runReadQuery(trimmed)
      return { ok: true, kind, result }
    }

    if (mode === 'execute') {
      const result = await executeWrite(trimmed)
      return { ok: true, kind, committed: true, result }
    }

    const result = await previewWrite(trimmed)
    return { ok: true, kind, previewed: true, result }
  } catch (err) {
    return {
      ok: false,
      kind,
      error: err instanceof Error ? err.message : 'Query failed.',
    }
  }
}

export interface SchemaActionResult {
  ok: boolean
  error?: string
  tables?: TableInfo[]
}

/** Load the public schema (tables + columns) for the sidebar reference. */
export async function loadSchemaAction(): Promise<SchemaActionResult> {
  const access = await requireQueryToolsUser()
  if (!access) return { ok: false, error: 'You do not have access to the query tools.' }
  try {
    const tables = await listSchema()
    return { ok: true, tables }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load schema.' }
  }
}

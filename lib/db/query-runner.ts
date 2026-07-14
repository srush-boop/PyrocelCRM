import 'server-only'
import { Pool, type QueryResult } from 'pg'

/**
 * Direct Postgres access for the admin Query Builder. This bypasses PostgREST
 * and RLS entirely, so every caller MUST be gated by `requireQueryToolsUser`
 * before reaching this module.
 *
 * We use the NON-POOLING connection string because the tool relies on explicit
 * transactions (BEGIN/ROLLBACK for write previews); a transaction-pooled
 * connection (pgbouncer) does not support that reliably.
 */

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool
  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error('No Postgres connection string configured.')
  }
  pool = new Pool({
    connectionString,
    // Supabase requires TLS; the managed cert chain isn't always present in the
    // runtime, so we don't force full verification here.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    // Hard cap so a runaway query can't hang the tool indefinitely.
    statement_timeout: 30_000,
  })
  return pool
}

export type StatementKind = 'read' | 'write' | 'other'

/**
 * Best-effort classification of a SQL statement by its leading keyword. Reads
 * are safe to run directly; everything else is treated as a mutation that must
 * go through the preview/confirm flow.
 */
export function classifyStatement(sql: string): StatementKind {
  // Strip leading SQL comments and whitespace before inspecting the keyword.
  const cleaned = sql
    .replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/g, '')
    .trimStart()
  const first = cleaned.match(/^[a-z]+/i)?.[0]?.toLowerCase() ?? ''
  if (['select', 'with', 'explain', 'show', 'table', 'values'].includes(first)) {
    // `WITH ... ` can still contain a writing CTE; catch the common cases.
    if (first === 'with' && /\b(insert|update|delete)\b/i.test(cleaned)) return 'write'
    return 'read'
  }
  if (['insert', 'update', 'delete', 'merge'].includes(first)) return 'write'
  // create/alter/drop/truncate/grant/etc.
  return 'other'
}

export interface RunResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  /** True when the returned rows were capped for display. */
  truncated: boolean
  command: string
}

const MAX_DISPLAY_ROWS = 1000

function shapeResult(result: QueryResult): RunResult {
  const rows = (result.rows ?? []) as Record<string, unknown>[]
  const columns = result.fields?.map((f) => f.name) ?? Object.keys(rows[0] ?? {})
  const truncated = rows.length > MAX_DISPLAY_ROWS
  return {
    columns,
    rows: truncated ? rows.slice(0, MAX_DISPLAY_ROWS) : rows,
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : rows.length,
    truncated,
    command: result.command ?? '',
  }
}

/** When pg runs multiple statements it returns an array; keep the last result. */
function lastResult(result: QueryResult | QueryResult[]): QueryResult {
  return Array.isArray(result) ? result[result.length - 1] : result
}

/** Run a read-only query directly and return the shaped rows. */
export async function runReadQuery(sql: string): Promise<RunResult> {
  const client = await getPool().connect()
  try {
    // Run reads inside a read-only transaction so a mislabelled write can't
    // mutate anything even if classification was fooled.
    await client.query('BEGIN READ ONLY')
    const res = await client.query(sql)
    await client.query('COMMIT')
    return shapeResult(lastResult(res))
  } finally {
    client.release()
  }
}

/**
 * Execute a mutation inside a transaction and ROLL BACK, reporting how many
 * rows it would have affected. Nothing is persisted — this powers the preview.
 */
export async function previewWrite(sql: string): Promise<RunResult> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(sql)
    await client.query('ROLLBACK')
    return shapeResult(lastResult(res))
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback failure */
    }
    throw err
  } finally {
    client.release()
  }
}

/** Execute a mutation for real, committing the transaction. */
export async function executeWrite(sql: string): Promise<RunResult> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const res = await client.query(sql)
    await client.query('COMMIT')
    return shapeResult(lastResult(res))
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback failure */
    }
    throw err
  } finally {
    client.release()
  }
}

export interface TableColumn {
  name: string
  dataType: string
  nullable: boolean
}
export interface TableInfo {
  schema: string
  name: string
  columns: TableColumn[]
}

/** List public (and auth) tables + columns for the schema sidebar. */
export async function listSchema(): Promise<TableInfo[]> {
  const sql = `
    select table_schema, table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema in ('public')
    order by table_schema, table_name, ordinal_position
  `
  const client = await getPool().connect()
  try {
    const { rows } = await client.query(sql)
    const byTable = new Map<string, TableInfo>()
    for (const r of rows as Record<string, string>[]) {
      const key = `${r.table_schema}.${r.table_name}`
      let t = byTable.get(key)
      if (!t) {
        t = { schema: r.table_schema, name: r.table_name, columns: [] }
        byTable.set(key, t)
      }
      t.columns.push({
        name: r.column_name,
        dataType: r.data_type,
        nullable: r.is_nullable === 'YES',
      })
    }
    return Array.from(byTable.values())
  } finally {
    client.release()
  }
}

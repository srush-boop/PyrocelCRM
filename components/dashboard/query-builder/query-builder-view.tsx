'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  Database,
  Loader2,
  Play,
  ShieldAlert,
  Table2,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  runQueryAction,
  loadSchemaAction,
  type QueryActionResult,
} from '@/lib/actions/query-tools'
import type { TableInfo } from '@/lib/db/query-runner'

const CONFIRM_WORD = 'EXECUTE'

export function QueryBuilderView() {
  const [sql, setSql] = useState('')
  const [running, setRunning] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<QueryActionResult | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const [tables, setTables] = useState<TableInfo[]>([])
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    loadSchemaAction().then((res) => {
      if (res.ok && res.tables) setTables(res.tables)
      else setSchemaError(res.error ?? 'Failed to load schema.')
    })
  }, [])

  const filteredTables = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tables
    return tables.filter((t) => t.name.toLowerCase().includes(q))
  }, [tables, filter])

  // A committed write or a fresh edit invalidates any pending confirmation.
  const resetPending = () => {
    setResult(null)
    setConfirmText('')
  }

  const handleRun = async () => {
    if (!sql.trim() || running) return
    setRunning(true)
    setConfirmText('')
    try {
      const res = await runQueryAction(sql, 'preview')
      setResult(res)
    } finally {
      setRunning(false)
    }
  }

  const handleExecute = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD || executing) return
    setExecuting(true)
    try {
      const res = await runQueryAction(sql, 'execute')
      setResult(res)
      setConfirmText('')
    } finally {
      setExecuting(false)
    }
  }

  const isWritePreview = result?.ok && result.previewed
  const isCommitted = result?.ok && result.committed
  const affected = result?.result?.rowCount ?? 0

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Schema reference sidebar */}
      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Tables
          </CardTitle>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tables..."
            className="mt-2 h-8"
          />
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-y-auto px-2">
          {schemaError ? (
            <p className="px-2 text-sm text-destructive">{schemaError}</p>
          ) : tables.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">Loading schema...</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredTables.map((t) => {
                const open = expanded === t.name
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : t.name)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <ChevronRight
                        className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
                      />
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs">{t.name}</span>
                    </button>
                    {open && (
                      <ul className="ml-6 border-l pl-2 py-1">
                        {t.columns.map((c) => (
                          <li
                            key={c.name}
                            className="flex items-baseline justify-between gap-2 py-0.5"
                          >
                            <button
                              type="button"
                              onClick={() => setSql((s) => (s ? `${s} ${c.name}` : c.name))}
                              className="truncate font-mono text-xs hover:underline"
                              title="Insert column name"
                            >
                              {c.name}
                            </button>
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                              {c.dataType}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Editor + results */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Textarea
              value={sql}
              onChange={(e) => {
                setSql(e.target.value)
                if (result) resetPending()
              }}
              placeholder="SELECT * FROM profiles LIMIT 50;"
              spellCheck={false}
              className="min-h-[160px] font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleRun} disabled={running || !sql.trim()}>
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSql('')
                  resetPending()
                }}
                disabled={running || (!sql && !result)}
              >
                Clear
              </Button>
              <p className="ml-auto text-xs text-muted-foreground">
                Reads run instantly. Writes are previewed first.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {result && !result.ok && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Query error</AlertTitle>
            <AlertDescription className="font-mono text-xs">{result.error}</AlertDescription>
          </Alert>
        )}

        {/* Committed success */}
        {isCommitted && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Changes committed</AlertTitle>
            <AlertDescription>
              {result?.result?.command || 'Statement'} affected{' '}
              <strong>{affected}</strong> row{affected === 1 ? '' : 's'}.
            </AlertDescription>
          </Alert>
        )}

        {/* Write preview + confirm */}
        {isWritePreview && (
          <Alert variant="destructive" className="border-amber-500/50 text-foreground">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700 dark:text-amber-500">
              Preview — nothing saved yet
            </AlertTitle>
            <AlertDescription className="space-y-3 text-foreground/80">
              <p>
                This {result?.kind === 'other' ? 'statement' : 'write'} would affect{' '}
                <strong>{affected}</strong> row{affected === 1 ? '' : 's'}. It was run in a
                transaction and rolled back. To apply it for real, type{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">{CONFIRM_WORD}</code> and
                confirm.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type ${CONFIRM_WORD}`}
                  className="h-9 w-48 bg-background font-mono"
                />
                <Button
                  variant="destructive"
                  onClick={handleExecute}
                  disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD || executing}
                >
                  {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Execute &amp; commit
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Result table (reads, or RETURNING rows from previews/commits) */}
        {result?.ok && result.result && result.result.rows.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Results</CardTitle>
              <div className="flex items-center gap-2">
                {result.kind && <Badge variant="secondary">{result.kind}</Badge>}
                <Badge variant="outline">
                  {result.result.rowCount} row{result.result.rowCount === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {result.result.columns.map((c) => (
                        <th
                          key={c}
                          className="whitespace-nowrap px-3 py-2 text-left font-medium font-mono text-xs"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.result.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {result.result!.columns.map((c) => (
                          <td key={c} className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                            {formatCell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.result.truncated && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing the first {result.result.rows.length} rows.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty read result */}
        {result?.ok && result.kind === 'read' && result.result?.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Query ran successfully — no rows returned.</p>
        )}
      </div>
    </div>
  )
}

/** Render an arbitrary cell value as compact display text. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

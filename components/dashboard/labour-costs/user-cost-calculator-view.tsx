'use client'

import { useState, useCallback } from 'react'
import { loadXlsx } from '@/lib/xlsx-client'
import {
  previewUserCosts,
  applyUserCosts,
  type CostPreviewRow,
  type CostUploadRow,
} from '@/lib/actions/user-cost-calc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Upload, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatPence(pence: number | null): string {
  if (pence == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(pence / 100)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// First of the current year, as a sensible default range start.
function yearStartIso(): string {
  return `${new Date().getFullYear()}-01-01`
}

export function UserCostCalculatorView() {
  const [from, setFrom] = useState(yearStartIso())
  const [to, setTo] = useState(todayIso())
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<CostUploadRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const [preview, setPreview] = useState<CostPreviewRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [applied, setApplied] = useState<number | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    setPreview(null)
    setApplied(null)
    setFileName(file.name)
    try {
      const XLSX = await loadXlsx()
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      // Tolerant column detection: accept "name"/"employee"/"user" and
      // "cost"/"total"/"salary"/"amount" in any case.
      const parsed: CostUploadRow[] = []
      for (const r of raw) {
        const keys = Object.keys(r)
        const nameKey = keys.find((k) => /name|employee|user|staff/i.test(k))
        const costKey = keys.find((k) => /cost|total|salary|amount|pay|wage/i.test(k))
        if (!nameKey || !costKey) continue
        const name = String(r[nameKey] ?? '').trim()
        const costRaw = String(r[costKey] ?? '').replace(/[£,\s]/g, '')
        const cost = Number(costRaw)
        if (!name) continue
        parsed.push({ name, cost: Number.isFinite(cost) ? cost : 0 })
      }

      if (parsed.length === 0) {
        setParseError(
          'No usable rows found. The sheet needs a name column and a cost/total column.',
        )
        setRows([])
        return
      }
      setRows(parsed)
    } catch {
      setParseError('Could not read that file. Please upload a valid .xlsx or .csv spreadsheet.')
      setRows([])
    }
  }, [])

  const handlePreview = async () => {
    setActionError(null)
    setApplied(null)
    setLoading(true)
    try {
      const res = await previewUserCosts(rows, from, to)
      if (!res.ok) {
        setActionError(res.error ?? 'Preview failed.')
        setPreview(null)
        return
      }
      setPreview(res.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  const applicable = (preview ?? []).filter(
    (r) => r.matched && r.userId && r.computedPence != null && !r.note,
  )

  const handleApply = async () => {
    setActionError(null)
    setApplying(true)
    try {
      const updates = applicable.map((r) => ({
        userId: r.userId as string,
        computedPence: r.computedPence as number,
      }))
      const res = await applyUserCosts(updates)
      if (!res.ok) {
        setActionError(res.error ?? 'Apply failed.')
        return
      }
      setApplied(res.updated ?? 0)
      // Refresh the preview so "current" reflects the new values.
      await handlePreview()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose the period &amp; upload costs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="from" className="text-sm font-medium">
                From
              </label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to" className="text-sm font-medium">
                To
              </label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Spreadsheet</span>
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Upload className="h-4 w-4" />
                <span>{fileName ?? 'Choose file…'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleFile(f)
                  }}
                />
              </label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Expected columns: a <strong>name</strong> column (Name / Employee / Staff) and a{' '}
            <strong>cost</strong> column (Cost / Total / Salary / Amount). Costs are read in pounds.
          </p>

          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {rows.length > 0 && !parseError && (
            <p className="text-sm text-muted-foreground">
              Loaded <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} from{' '}
              {fileName}.
            </p>
          )}

          <div>
            <Button onClick={handlePreview} disabled={rows.length === 0 || loading}>
              <Calculator className="mr-2 h-4 w-4" />
              {loading ? 'Calculating…' : 'Calculate costs'}
            </Button>
          </div>

          {actionError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">2. Review &amp; apply</CardTitle>
            <div className="flex items-center gap-3">
              {applied != null && (
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Updated {applied} user{applied === 1 ? '' : 's'}
                </span>
              )}
              <Button
                onClick={handleApply}
                disabled={applicable.length === 0 || applying}
                size="sm"
              >
                {applying
                  ? 'Applying…'
                  : `Apply to ${applicable.length} user${applicable.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Matched user</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Working days</TableHead>
                    <TableHead className="text-right">Total hours</TableHead>
                    <TableHead className="text-right">Current £/hr</TableHead>
                    <TableHead className="text-right">New £/hr</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                        No rows to show.
                      </TableCell>
                    </TableRow>
                  ) : (
                    preview.map((r, i) => {
                      const willApply = r.matched && r.computedPence != null && !r.note
                      return (
                        <TableRow key={`${r.name}-${i}`}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.matchedName ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {new Intl.NumberFormat('en-GB', {
                              style: 'currency',
                              currency: 'GBP',
                            }).format(r.cost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.matched ? r.workingDays : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.matched ? r.totalHours.toFixed(1) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatPence(r.currentPence)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatPence(r.computedPence)}
                          </TableCell>
                          <TableCell>
                            {willApply ? (
                              <Badge variant="secondary" className="text-emerald-700">
                                Ready
                              </Badge>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertTriangle className="h-3 w-3" />
                                {r.note ?? 'Skipped'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

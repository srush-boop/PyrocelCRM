'use client'

import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Download,
  FileSpreadsheet,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { DATASETS, getDataset, ID_HEADER } from '@/lib/bulk-data/datasets'
import { formatScalarForExport } from '@/lib/bulk-data/transform'
import {
  fetchDatasetRows,
  previewMerge,
  commitMerge,
  type MergeAnalysis,
  type SheetRow,
} from '@/lib/actions/bulk-data'

export function BulkDataSettings() {
  const [datasetKey, setDatasetKey] = useState<string>(DATASETS[0].key)
  const [downloading, setDownloading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedRows, setParsedRows] = useState<SheetRow[] | null>(null)
  const [analysis, setAnalysis] = useState<MergeAnalysis | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const dataset = useMemo(() => getDataset(datasetKey)!, [datasetKey])

  function resetUpload() {
    setParsedRows(null)
    setAnalysis(null)
    setFileName('')
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function changeDataset(key: string) {
    setDatasetKey(key)
    resetUpload()
  }

  async function handleDownloadData() {
    setDownloading(true)
    try {
      const res = await fetchDatasetRows(datasetKey)
      if (!res.ok || !res.headers || !res.rows) {
        toast.error(res.error ?? 'Could not download that data.')
        return
      }
      const ws = XLSX.utils.json_to_sheet(res.rows, { header: res.headers })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, dataset.label.slice(0, 31))
      XLSX.writeFile(wb, `${dataset.key}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`Downloaded ${res.rows.length} ${dataset.label.toLowerCase()}.`)
    } finally {
      setDownloading(false)
    }
  }

  function handleDownloadTemplate() {
    const headers = [ID_HEADER, ...dataset.columns.map((c) => c.header)]
    const example: SheetRow = { [ID_HEADER]: '' }
    for (const col of dataset.columns) {
      example[col.header] =
        col.example == null
          ? ''
          : col.kind === 'boolean'
            ? formatScalarForExport(col.example, 'boolean')
            : col.example
    }
    const ws = XLSX.utils.json_to_sheet([example], { header: headers })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, dataset.label.slice(0, 31))
    XLSX.writeFile(wb, `${dataset.key}-template.xlsx`)
  }

  async function handleFile(file: File) {
    resetUpload()
    setFileName(file.name)
    let rows: SheetRow[]
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' })
    } catch (err) {
      console.log('[v0] bulk-data parse error:', err)
      setParseError('Could not read that file. Upload a valid .xlsx, .xls or .csv file.')
      return
    }
    if (rows.length === 0) {
      setParseError('That sheet has no data rows.')
      return
    }
    setParsedRows(rows)
    setAnalysing(true)
    try {
      const res = await previewMerge(datasetKey, rows)
      if (!res.ok) {
        setParseError(res.error ?? 'Could not analyse that file.')
        return
      }
      setAnalysis(res)
    } finally {
      setAnalysing(false)
    }
  }

  async function handleCommit() {
    if (!parsedRows) return
    setCommitting(true)
    try {
      const res = await commitMerge(datasetKey, parsedRows)
      if (!res.ok) {
        toast.error(res.error ?? 'Merge failed.')
        return
      }
      toast.success(
        `Merge complete: ${res.inserted} added, ${res.updated} updated${
          res.skipped ? `, ${res.skipped} skipped` : ''
        }.`,
      )
      resetUpload()
    } finally {
      setCommitting(false)
    }
  }

  const rowsWithWarnings = analysis?.rows.filter((r) => r.warnings.length > 0 || r.action === 'skip') ?? []
  const mergeableCount = (analysis?.insertCount ?? 0) + (analysis?.updateCount ?? 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk data</CardTitle>
          <CardDescription>
            Download records as an Excel file, edit them, and upload to merge changes back in.
            Downloads include a hidden <span className="font-mono text-xs">id</span> column — keep it
            so edits update the right record. Rows with a blank id (and no matching name) are added as
            new records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Dataset picker */}
          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="bulk-dataset">Record type</Label>
            <Select value={datasetKey} onValueChange={changeDataset}>
              <SelectTrigger id="bulk-dataset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATASETS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground text-pretty">{dataset.description}</p>
          </div>

          {/* Download actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleDownloadData} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download data
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Download blank template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload & merge */}
      <Card>
        <CardHeader>
          <CardTitle>Upload &amp; merge</CardTitle>
          <CardDescription>
            Upload an edited or new spreadsheet. We&apos;ll check it and show you exactly what will
            change before anything is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            {analysing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {analysis && (
            <div className="space-y-4">
              {/* Summary counts */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {analysis.insertCount} to add
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {analysis.updateCount} to update
                </Badge>
                {analysis.skipCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {analysis.skipCount} skipped
                  </Badge>
                )}
              </div>

              {/* Ignored columns */}
              {analysis.columnsIgnored.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-pretty">
                    Ignored unrecognised column{analysis.columnsIgnored.length === 1 ? '' : 's'}:{' '}
                    <span className="font-medium">{analysis.columnsIgnored.join(', ')}</span>
                  </span>
                </div>
              )}

              {/* Warnings / skipped rows */}
              {rowsWithWarnings.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Please review before merging
                  </div>
                  <ul className="space-y-1">
                    {rowsWithWarnings.slice(0, 30).map((r) => (
                      <li key={r.rowNumber} className="text-pretty">
                        <span className="font-medium">Row {r.rowNumber}</span> ({r.label}):{' '}
                        {r.action === 'skip' ? (
                          <span>will be skipped — {r.issues.join('; ')}</span>
                        ) : (
                          <span>{r.warnings.join('; ')}</span>
                        )}
                      </li>
                    ))}
                    {rowsWithWarnings.length > 30 && (
                      <li className="text-xs opacity-80">
                        …and {rowsWithWarnings.length - 30} more.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              <div className="max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.rows.slice(0, 200).map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.action === 'skip'
                                ? 'destructive'
                                : r.action === 'update'
                                  ? 'default'
                                  : 'secondary'
                            }
                          >
                            {r.action}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {mergeableCount > 0
                    ? `Ready to merge ${mergeableCount} record${mergeableCount === 1 ? '' : 's'}.`
                    : 'No valid rows to merge.'}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={resetUpload} disabled={committing}>
                    Cancel
                  </Button>
                  <Button onClick={handleCommit} disabled={committing || mergeableCount === 0}>
                    {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Merge {mergeableCount} record{mergeableCount === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

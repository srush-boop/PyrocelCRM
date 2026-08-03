'use client'

import { useRef, useState } from 'react'
import { loadXlsx } from '@/lib/xlsx-client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react'
import { FULL_SITE_COLUMNS, type SheetRow } from '@/lib/bulk-data/full-site'
import { formatScalarForExport } from '@/lib/bulk-data/transform'
import {
  previewFullSiteImport,
  commitFullSiteImport,
  type FullSitePreview,
} from '@/lib/actions/full-site-import'

export function FullSiteImport() {
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedRows, setParsedRows] = useState<SheetRow[] | null>(null)
  const [preview, setPreview] = useState<FullSitePreview | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setParsedRows(null)
    setPreview(null)
    setFileName('')
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDownloadTemplate() {
    const headers = FULL_SITE_COLUMNS.map((c) => c.header)
    const example: SheetRow = {}
    for (const col of FULL_SITE_COLUMNS) {
      example[col.header] =
        col.example == null
          ? ''
          : col.kind === 'boolean'
            ? formatScalarForExport(col.example, 'boolean')
            : col.example
    }
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet([example], { header: headers })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Full site')
    XLSX.writeFile(wb, 'full-live-site-template.xlsx')
  }

  async function handleFile(file: File) {
    reset()
    setFileName(file.name)
    let rows: SheetRow[]
    try {
      const XLSX = await loadXlsx()
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' })
    } catch (err) {
      console.log('[v0] full-site parse error:', err)
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
      const res = await previewFullSiteImport(rows)
      if (!res.ok) {
        setParseError(res.error ?? 'Could not analyse that file.')
        return
      }
      setPreview(res)
    } finally {
      setAnalysing(false)
    }
  }

  async function handleCommit() {
    if (!parsedRows) return
    setCommitting(true)
    try {
      const res = await commitFullSiteImport(parsedRows)
      if (!res.ok) {
        toast.error(res.error ?? 'Import failed.')
        return
      }
      toast.success(
        `Imported ${res.sitesCreated} site${res.sitesCreated === 1 ? '' : 's'}: ` +
          `${res.clientsCreated} client(s), ${res.systemsCreated} system(s), ` +
          `${res.servicesCreated} service(s), ${res.chargesCreated} charge(s), ` +
          `${res.callsSeeded} call(s) seeded.`,
      )
      reset()
    } finally {
      setCommitting(false)
    }
  }

  const c = preview?.counts
  const hasWork = !!c && preview!.validRowCount > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Import a full live site
        </CardTitle>
        <CardDescription>
          Upload one spreadsheet to create an entire site in one go — client, billing account,
          site, systems, services and recurring charges. Use{' '}
          <span className="font-medium">one row per service line</span>; the client, billing and
          site columns repeat on each row and are de-duplicated automatically. Live sites also seed
          their first cycle of calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download blank template
          </Button>
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

        {preview && c && (
          <div className="space-y-4">
            {/* Summary counts */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {c.clientsNew} client{c.clientsNew === 1 ? '' : 's'}
              </Badge>
              <Badge variant="secondary">{c.billingNew} billing</Badge>
              <Badge variant="secondary">{c.sitesNew} site{c.sitesNew === 1 ? '' : 's'}</Badge>
              <Badge variant="secondary">{c.systemsNew} system{c.systemsNew === 1 ? '' : 's'}</Badge>
              <Badge variant="secondary">{c.servicesNew} service{c.servicesNew === 1 ? '' : 's'}</Badge>
              <Badge variant="secondary">{c.chargesNew} charge{c.chargesNew === 1 ? '' : 's'}</Badge>
              {c.servicesSeeding > 0 && (
                <Badge className="gap-1">
                  {c.servicesSeeding} service{c.servicesSeeding === 1 ? '' : 's'} seeding calls
                </Badge>
              )}
              {c.duplicateServices > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {c.duplicateServices} duplicate{c.duplicateServices === 1 ? '' : 's'}
                </Badge>
              )}
            </div>

            {/* Row issues */}
            {preview.rowIssues.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.rowIssues.length} row{preview.rowIssues.length === 1 ? '' : 's'} will be
                  skipped
                </div>
                <ul className="space-y-1">
                  {preview.rowIssues.slice(0, 30).map((r) => (
                    <li key={r.rowNumber} className="text-pretty">
                      <span className="font-medium">Row {r.rowNumber}</span>: {r.issues.join('; ')}
                    </li>
                  ))}
                  {preview.rowIssues.length > 30 && (
                    <li className="text-xs opacity-80">…and {preview.rowIssues.length - 30} more.</li>
                  )}
                </ul>
              </div>
            )}

            {/* Duplicate services warning — non-blocking; import still proceeds. */}
            {preview.duplicateWarnings.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.duplicateWarnings.length} service
                  {preview.duplicateWarnings.length === 1 ? '' : 's'} already exist and will be
                  created again
                </div>
                <p className="mb-2 text-pretty text-xs opacity-90">
                  These rows match a service that is already on the site&apos;s existing system.
                  Importing will create a second copy — remove the row(s) if that is not what you
                  want.
                </p>
                <ul className="space-y-1">
                  {preview.duplicateWarnings.slice(0, 30).map((w, i) => (
                    <li key={i} className="text-pretty">
                      {w}
                    </li>
                  ))}
                  {preview.duplicateWarnings.length > 30 && (
                    <li className="text-xs opacity-80">
                      …and {preview.duplicateWarnings.length - 30} more.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Per-site preview */}
            {preview.sites.length > 0 && (
              <div className="max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead className="w-20 text-right">Systems</TableHead>
                      <TableHead className="w-20 text-right">Services</TableHead>
                      <TableHead className="w-20 text-right">Charges</TableHead>
                      <TableHead className="w-20 text-right">Dupes</TableHead>
                      <TableHead className="w-24">Calls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sites.map((s, i) => (
                      <TableRow key={`${s.client}-${s.site}-${i}`}>
                        <TableCell>
                          {s.client}{' '}
                          {s.clientNew ? (
                            <Badge variant="secondary" className="ml-1">new</Badge>
                          ) : (
                            <Badge variant="outline" className="ml-1">existing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.site}{' '}
                          {!s.siteNew && (
                            <Badge variant="outline" className="ml-1">existing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">{s.status}</TableCell>
                        <TableCell className="text-right">{s.systems}</TableCell>
                        <TableCell className="text-right">{s.services}</TableCell>
                        <TableCell className="text-right">{s.charges}</TableCell>
                        <TableCell className="text-right">
                          {s.duplicateServices > 0 ? (
                            <span className="font-medium text-destructive">
                              {s.duplicateServices}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.seedsCalls ? (
                            <Badge className="gap-1">seed</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {hasWork
                  ? `Ready to import ${preview.validRowCount} service line${preview.validRowCount === 1 ? '' : 's'}.`
                  : 'No valid rows to import.'}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={reset} disabled={committing}>
                  Cancel
                </Button>
                <Button onClick={handleCommit} disabled={committing || !hasWork}>
                  {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import site{preview.sites.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

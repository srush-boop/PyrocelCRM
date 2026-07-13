'use client'

import { useState, useRef } from 'react'
import { loadXlsx } from '@/lib/xlsx-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Upload, FileSpreadsheet, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { bulkImportTraining, type TrainingImportRow } from '@/lib/actions/training'

// Reads the first cell that matches any of the accepted header aliases.
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of Object.keys(row)) {
    if (keys.includes(key.trim().toLowerCase())) {
      const val = row[key]
      return val == null ? '' : String(val).trim()
    }
  }
  return ''
}

export function ImportTrainingDialog() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<TrainingImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<{
    inserted: number
    errors: { row: number; employee_number: string; message: string }[]
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const reset = () => {
    setRows([])
    setFileName('')
    setError(null)
    setReport(null)
  }

  const handleFile = async (file: File) => {
    setError(null)
    setReport(null)
    setFileName(file.name)
    try {
      const XLSX = await loadXlsx()
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const parsed: TrainingImportRow[] = json
        .map((row) => ({
          employee_number: pick(row, ['employee number', 'employee_number', 'emp no', 'employee no', 'staff number']),
          training_type: pick(row, ['training type', 'training_type', 'type', 'category']),
          course_name: pick(row, ['course name', 'course_name', 'course', 'qualification']),
          provider: pick(row, ['provider', 'awarding body', 'trainer']),
          completed_date: pick(row, ['completed date', 'completed_date', 'completed', 'date completed']),
          expiry_date: pick(row, ['expiry date', 'expiry_date', 'expiry', 'expires', 'renewal date']),
        }))
        .filter((r) => r.employee_number || r.training_type || r.course_name)

      if (parsed.length === 0) {
        setError('No rows found. Make sure your file has a header row with at least Employee Number, Training Type, and Course Name.')
      }
      setRows(parsed)
    } catch (err) {
      console.log('[v0] Training import parse error:', err)
      setError('Could not read that file. Please upload a valid .xlsx, .xls, or .csv file.')
      setRows([])
    }
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    setError(null)
    const result = await bulkImportTraining(rows)
    setImporting(false)

    if (!result.ok && result.error) {
      setError(result.error)
      return
    }
    setReport({ inserted: result.inserted, errors: result.errors })
    if (result.inserted > 0) {
      setRows([])
      setFileName('')
      router.refresh()
    }
  }

  const downloadTemplate = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Employee Number', 'Training Type', 'Course Name', 'Provider', 'Completed Date', 'Expiry Date'],
      ['EMP-0042', 'Fire Safety', 'Fire Marshal Training', 'BAFE', '2025-01-15', '2028-01-15'],
      ['EMP-0043', 'Working at Height', 'IPAF 3a/3b', 'IPAF', '15/03/2025', '15/03/2030'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Training')
    XLSX.writeFile(wb, 'training-import-template.xlsx')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk upload training records</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet to add many training records at once. Rows are matched to employees by
            Employee Number. Expected columns: Employee Number, Training Type, Course Name, Provider, Completed
            Date, Expiry Date.
          </DialogDescription>
        </DialogHeader>

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
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Choose file
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download template
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="space-y-2">
            {report.inserted > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Imported {report.inserted} record{report.inserted === 1 ? '' : 's'}.</span>
              </div>
            )}
            {report.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40">
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {report.errors.length} row{report.errors.length === 1 ? '' : 's'} skipped
                </div>
                <div className="max-h-[200px] overflow-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Employee No.</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.row}</TableCell>
                          <TableCell>{e.employee_number || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && !report && (
          <div className="max-h-[280px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.employee_number || '-'}</TableCell>
                    <TableCell>{r.training_type || '-'}</TableCell>
                    <TableCell>{r.course_name || '-'}</TableCell>
                    <TableCell>{r.expiry_date || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {report ? 'Close' : 'Cancel'}
          </Button>
          {!report && (
            <Button onClick={handleImport} disabled={rows.length === 0 || importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {rows.length > 0 ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

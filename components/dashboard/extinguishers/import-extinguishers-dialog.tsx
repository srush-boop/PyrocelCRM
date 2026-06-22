'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
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
import { Upload, FileSpreadsheet, Download, Loader2, AlertCircle } from 'lucide-react'
import { generateUrn, EXTINGUISHER_TYPE_LABELS } from '@/lib/extinguishers'
import type { ExtinguisherType } from '@/lib/types/database'

interface ImportExtinguishersDialogProps {
  siteId: string
}

interface ParsedRow {
  reference: string
  floor: string
  location: string
  extinguisher_type: ExtinguisherType
  capacity: string
  serial_number: string
  notes: string
}

const TYPE_MAP: Record<string, ExtinguisherType> = {
  water: 'water',
  'h2o': 'water',
  foam: 'foam',
  afff: 'foam',
  co2: 'co2',
  'co₂': 'co2',
  'carbon dioxide': 'co2',
  powder: 'powder',
  'dry powder': 'powder',
  abc: 'powder',
  'wet chemical': 'wet_chemical',
  wet_chemical: 'wet_chemical',
  'water mist': 'water_mist',
  water_mist: 'water_mist',
  mist: 'water_mist',
}

function normaliseType(value: unknown): ExtinguisherType {
  const key = String(value ?? '').trim().toLowerCase()
  return TYPE_MAP[key] ?? 'water'
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of Object.keys(row)) {
    const normalised = key.trim().toLowerCase()
    if (keys.includes(normalised)) {
      const val = row[key]
      return val == null ? '' : String(val).trim()
    }
  }
  return ''
}

export function ImportExtinguishersDialog({ siteId }: ImportExtinguishersDialogProps) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleFile = async (file: File) => {
    setError(null)
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const parsed: ParsedRow[] = json
        .map((row) => ({
          reference: pick(row, ['reference', 'ref', 'extinguisher ref', 'id']),
          floor: pick(row, ['floor', 'level']),
          location: pick(row, ['location', 'area', 'room']),
          extinguisher_type: normaliseType(pick(row, ['type', 'extinguisher type', 'extinguisher_type'])),
          capacity: pick(row, ['capacity', 'size', 'weight']),
          serial_number: pick(row, ['serial', 'serial number', 'serial_number']),
          notes: pick(row, ['notes', 'comments', 'remarks']),
        }))
        .filter((r) => r.reference || r.location || r.floor)

      if (parsed.length === 0) {
        setError('No rows found. Make sure your file has a header row and at least a Reference or Location column.')
      }
      setRows(parsed)
    } catch (err) {
      console.log('[v0] Excel parse error:', err)
      setError('Could not read that file. Please upload a valid .xlsx, .xls, or .csv file.')
      setRows([])
    }
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    setError(null)

    const insertData = rows.map((r) => ({
      site_id: siteId,
      urn: generateUrn(),
      reference: r.reference || null,
      floor: r.floor || null,
      location: r.location || null,
      extinguisher_type: r.extinguisher_type,
      capacity: r.capacity || null,
      serial_number: r.serial_number || null,
      notes: r.notes || null,
    }))

    const { error: insertError } = await supabase.from('extinguishers').insert(insertData)
    setImporting(false)

    if (insertError) {
      console.log('[v0] Extinguisher import error:', insertError.message)
      setError(`Import failed: ${insertError.message}`)
      return
    }

    setRows([])
    setFileName('')
    setOpen(false)
    router.refresh()
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Reference', 'Floor', 'Location', 'Type', 'Capacity', 'Serial', 'Notes'],
      ['EXT-001', 'Ground', 'Reception by main door', 'Water', '6 litre', 'SN12345', ''],
      ['EXT-002', 'Level 1', 'Kitchen', 'CO2', '2 kg', 'SN12346', 'By the hob'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Extinguishers')
    XLSX.writeFile(wb, 'extinguisher-import-template.xlsx')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Extinguishers from Excel</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet to bulk-add extinguishers. Each row becomes an extinguisher with an
            auto-generated URN. Expected columns: Reference, Floor, Location, Type, Capacity, Serial, Notes.
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

        {rows.length > 0 && (
          <div className="max-h-[320px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.reference || '-'}</TableCell>
                    <TableCell>{r.floor || '-'}</TableCell>
                    <TableCell>{r.location || '-'}</TableCell>
                    <TableCell>{EXTINGUISHER_TYPE_LABELS[r.extinguisher_type]}</TableCell>
                    <TableCell>{r.capacity || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={rows.length === 0 || importing}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {rows.length > 0 ? `${rows.length} extinguisher${rows.length === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

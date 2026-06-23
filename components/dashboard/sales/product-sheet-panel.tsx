'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileSpreadsheet, Upload, Loader2, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { importProductSheet } from '@/app/(dashboard)/dashboard/sales/product-sheet-actions'
import type { ProductSheet } from '@/lib/types/database'

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProductSheetPanel({ current }: { current: ProductSheet | null }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [importing, startImport] = useTransition()

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/product-sheets/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed.')
        return
      }
      toast.success('Spreadsheet uploaded. You can now import it into the catalogue.')
      router.refresh()
    } catch {
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleImport() {
    startImport(async () => {
      const result = await importProductSheet()
      if (!result.ok) {
        toast.error(result.error ?? 'Import failed.')
        return
      }
      toast.success(
        `Imported ${result.imported} new and updated ${result.updated} existing product${
          result.updated === 1 ? '' : 's'
        }.`,
      )
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">Products spreadsheet</h2>
            {current ? (
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                <p className="truncate">
                  <span className="font-medium text-foreground">{current.filename}</span>{' '}
                  {formatBytes(current.size_bytes) && `(${formatBytes(current.size_bytes)})`}
                </p>
                <p>Uploaded {formatDate(current.uploaded_at)}</p>
                {current.imported_at ? (
                  <p className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Imported {current.imported_count ?? 0} items
                    </Badge>
                    <span>on {formatDate(current.imported_at)}</span>
                  </p>
                ) : (
                  <Badge variant="outline">Not yet imported</Badge>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Upload an Excel (.xlsx) file of products and prices, then import it to build the
                quote catalogue used for estimates and specifications.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {current && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/product-sheets/file?pathname=${encodeURIComponent(current.blob_pathname)}`}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {current ? 'Replace' : 'Upload'}
          </Button>
          {current && (
            <Button size="sm" onClick={handleImport} disabled={importing}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Import to catalogue
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground text-pretty">
        Expected columns: a product <span className="font-medium">Name</span> (or Product /
        Description), plus optional <span className="font-medium">Category</span>,{' '}
        <span className="font-medium">Unit</span> and <span className="font-medium">Price</span>{' '}
        columns. Importing matches existing items by name, updates their price, and adds any new
        products.
      </p>
    </Card>
  )
}

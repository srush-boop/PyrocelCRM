'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'

interface PortalDocument {
  id: string
  name: string
  content_type: string | null
  size_bytes: number | null
  description: string | null
  created_at: string
  uploaded_by: string | null
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Per-call quotes/information uploads for the subcontractor portal. */
export function SubcontractorUploads({
  taskId,
  currentUserId,
}: {
  taskId: string
  currentUserId: string
}) {
  const [documents, setDocuments] = useState<PortalDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await fetch(`/api/subcontractor/documents?taskId=${taskId}`)
    if (res.ok) {
      const json = await res.json()
      setDocuments(json.documents ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('task_id', taskId)
    if (description) formData.append('description', description)

    const res = await fetch('/api/subcontractor/documents', { method: 'POST', body: formData })
    setUploading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error || 'Upload failed. Please try again.')
      return
    }
    setDescription('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    void load()
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/subcontractor/documents/${id}`, { method: 'DELETE' })
    if (res.ok) setDocuments((docs) => docs.filter((d) => d.id !== id))
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleUpload} className="space-y-3 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="sc-file">Upload a quote or information</Label>
          <Input id="sc-file" ref={fileInputRef} type="file" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-desc">Description (optional)</Label>
          <Input
            id="sc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Quote for remedial works"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={uploading} className="gap-2">
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading uploads...
        </div>
      ) : documents.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No files uploaded to this call yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/subcontractor/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {doc.name}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.description ? `${doc.description} · ` : ''}
                    {formatBytes(doc.size_bytes)}
                    {doc.size_bytes ? ' · ' : ''}
                    {formatDateUK(doc.created_at)}
                  </p>
                </div>
                {doc.uploaded_by === currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc.id)}
                    aria-label={`Remove ${doc.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

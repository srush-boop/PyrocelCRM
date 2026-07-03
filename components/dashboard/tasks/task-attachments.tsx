'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Paperclip,
  Upload,
  FileText,
  ImageIcon,
  Download,
  Trash2,
  Loader2,
  File as FileIcon,
} from 'lucide-react'
import { formatBytes } from '@/lib/documents/utils'
import { formatDateUK } from '@/lib/utils'
import type { Profile, TaskAttachment } from '@/lib/types/database'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function iconFor(contentType: string | null) {
  if (contentType?.startsWith('image/')) return ImageIcon
  if (contentType === 'application/pdf' || contentType?.startsWith('text/')) return FileText
  return FileIcon
}

interface TaskAttachmentsProps {
  taskId: string
  profile: Profile
  initialAttachments?: TaskAttachment[]
}

export function TaskAttachments({ taskId, profile, initialAttachments = [] }: TaskAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, mutate } = useSWR<{ attachments: TaskAttachment[] }>(
    `/api/tasks/attachments?task_id=${taskId}`,
    fetcher,
    { fallbackData: { attachments: initialAttachments } }
  )

  const attachments = data?.attachments ?? []
  const canManage = profile.role === 'admin' || profile.role === 'office'

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('task_id', taskId)
        const res = await fetch('/api/tasks/attachments/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Upload failed')
        }
      }
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/attachments?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Delete failed')
      }
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({attachments.length})
            </span>
          )}
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? 'Uploading...' : 'Add file'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No files attached yet. Add photos, PDFs, or other documents for this call.
          </p>
        ) : (
          <ul className="divide-y">
            {attachments.map((att) => {
              const Icon = iconFor(att.content_type)
              const canDelete = canManage || att.uploaded_by === profile.id
              return (
                <li key={att.id} className="flex items-center gap-3 py-2">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/tasks/attachments/file?id=${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {att.name}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(att.size_bytes)} · {formatDateUK(att.created_at)}
                      {att.uploader?.full_name ? ` · ${att.uploader.full_name}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" asChild className="shrink-0">
                    <a
                      href={`/api/tasks/attachments/file?id=${att.id}&download=1`}
                      aria-label={`Download ${att.name}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(att.id)}
                      disabled={deletingId === att.id}
                      aria-label={`Delete ${att.name}`}
                    >
                      {deletingId === att.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

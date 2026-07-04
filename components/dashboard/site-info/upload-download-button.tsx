'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DocumentFolder } from '@/lib/types/database'

const DOWNLOADS_FOLDER_NAME = 'Downloads'

interface UploadDownloadButtonProps {
  siteId: string
  /** Existing engineer (site_engineer) folders for this site, used to locate the Downloads folder. */
  engineerFolders: DocumentFolder[]
  className?: string
}

/**
 * Fire-alarm-specific action: uploads a panel configuration "download" file to
 * the site's shared engineer Downloads folder so future engineers can retrieve
 * previous configurations. Creates the Downloads folder on first use.
 */
export function UploadDownloadButton({
  siteId,
  engineerFolders,
  className,
}: UploadDownloadButtonProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ensureDownloadsFolder(): Promise<string> {
    // Reuse an existing top-level "Downloads" folder if present.
    const existing = engineerFolders.find(
      (f) => f.parent_id === null && f.name.toLowerCase() === DOWNLOADS_FOLDER_NAME.toLowerCase(),
    )
    if (existing) return existing.id

    const res = await fetch('/api/documents/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_type: 'site_engineer',
        owner_id: siteId,
        parent_id: null,
        name: DOWNLOADS_FOLDER_NAME,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Could not create Downloads folder')
    }
    const data = await res.json()
    return data.folder?.id ?? data.id
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const folderId = await ensureDownloadsFolder()
      for (const file of Array.from(fileList)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('owner_type', 'site_engineer')
        fd.append('owner_id', siteId)
        fd.append('folder_id', folderId)
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Upload failed')
        }
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Upload Download
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Download className="h-3 w-3" />
        Saves the panel configuration to this site&apos;s Downloads folder.
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

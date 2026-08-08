'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { DocumentBrowser } from '@/components/documents/document-browser'
import type { Client, DocumentFile, DocumentFolder, DocumentTag } from '@/lib/types/database'

interface ClientDocumentsDialogProps {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Shape returned by the file<->tag embed (nested object or array depending on
// relationship inference).
type FileTagRow = {
  document_id: string
  document_tags: DocumentTag | DocumentTag[] | null
}

export function ClientDocumentsDialog({ client, open, onOpenChange }: ClientDocumentsDialogProps) {
  const supabase = createClient()
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [files, setFiles] = useState<DocumentFile[]>([])
  const [allTags, setAllTags] = useState<DocumentTag[]>([])
  const [usedTags, setUsedTags] = useState<DocumentTag[]>([])
  const [loading, setLoading] = useState(false)

  // Load folders, files (+ their tags) and the shared tag vocabulary for this
  // client. Mirrors the server-side getOwnerDocuments()/getAllDocumentTags()
  // helpers but runs client-side so the dialog can lazy-load on open.
  const load = useCallback(async () => {
    setLoading(true)
    const [foldersRes, filesRes, tagsRes] = await Promise.all([
      supabase
        .from('document_folders')
        .select('*')
        .eq('owner_type', 'client')
        .eq('owner_id', client.id)
        .order('name'),
      supabase
        .from('documents')
        .select('*')
        .eq('owner_type', 'client')
        .eq('owner_id', client.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('document_tags')
        .select('id, name, created_by, created_at')
        .order('name'),
    ])

    const fileList = (filesRes.data ?? []) as DocumentFile[]
    const tagsByFile = new Map<string, DocumentTag[]>()
    const usedById = new Map<string, DocumentTag>()
    if (fileList.length > 0) {
      const { data: fileTags } = await supabase
        .from('document_file_tags')
        .select('document_id, document_tags(id, name, created_by, created_at)')
        .in(
          'document_id',
          fileList.map((f) => f.id),
        )
      for (const row of (fileTags ?? []) as FileTagRow[]) {
        const tag = Array.isArray(row.document_tags) ? row.document_tags[0] : row.document_tags
        if (!tag) continue
        const list = tagsByFile.get(row.document_id) ?? []
        list.push(tag)
        tagsByFile.set(row.document_id, list)
        usedById.set(tag.id, tag)
      }
    }

    setFolders((foldersRes.data ?? []) as DocumentFolder[])
    setFiles(
      fileList.map((f) => ({
        ...f,
        tags: (tagsByFile.get(f.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    )
    setAllTags((tagsRes.data ?? []) as DocumentTag[])
    setUsedTags([...usedById.values()].sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }, [supabase, client.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Documents — {client.name}</DialogTitle>
          <DialogDescription>
            Files, folders and generated letters stored against this client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <DocumentBrowser
              ownerType="client"
              ownerId={client.id}
              folders={folders}
              files={files}
              canManage
              allTags={allTags}
              usedTags={usedTags}
              onMutate={load}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

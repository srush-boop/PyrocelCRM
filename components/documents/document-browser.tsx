'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Folder,
  FolderPlus,
  Upload,
  FileText,
  FileImage,
  File as FileIcon,
  Download,
  Trash2,
  Pencil,
  ChevronRight,
  Loader2,
  MoreVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import type {
  DocumentFile,
  DocumentFolder,
  DocumentOwnerType,
} from '@/lib/types/database'
import { formatBytes } from '@/lib/documents/utils'

interface DocumentBrowserProps {
  ownerType: DocumentOwnerType
  ownerId: string
  folders: DocumentFolder[]
  files: DocumentFile[]
  canManage: boolean
}

function fileIcon(contentType: string | null) {
  if (contentType?.startsWith('image/')) return FileImage
  if (contentType === 'application/pdf' || contentType?.includes('word') || contentType?.startsWith('text/'))
    return FileText
  return FileIcon
}

export function DocumentBrowser({
  ownerType,
  ownerId,
  folders,
  files,
  canManage,
}: DocumentBrowserProps) {
  const router = useRouter()
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameTarget, setRenameTarget] = useState<
    { kind: 'folder' | 'file'; id: string; name: string } | null
  >(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'folder' | 'file'; id: string; name: string } | null
  >(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentFolderId = currentFolder

  const visibleFolders = useMemo(
    () => folders.filter((f) => f.parent_id === currentFolderId),
    [folders, currentFolderId],
  )
  const visibleFiles = useMemo(
    () => files.filter((f) => f.folder_id === currentFolderId),
    [files, currentFolderId],
  )

  // Build breadcrumb trail from the current folder up to root.
  const trail = useMemo(() => {
    const path: DocumentFolder[] = []
    let cursor = currentFolderId
    const byId = new Map(folders.map((f) => [f.id, f]))
    while (cursor) {
      const folder = byId.get(cursor)
      if (!folder) break
      path.unshift(folder)
      cursor = folder.parent_id
    }
    return path
  }, [folders, currentFolderId])

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('owner_type', ownerType)
        fd.append('owner_id', ownerId)
        fd.append('folder_id', currentFolderId ?? 'null')
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
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: ownerId,
          parent_id: currentFolderId,
          name,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not create folder')
      }
      setNewFolderOpen(false)
      setNewFolderName('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder')
    } finally {
      setBusy(false)
    }
  }

  async function submitRename() {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const url =
        renameTarget.kind === 'folder'
          ? `/api/documents/folders/${renameTarget.id}`
          : `/api/documents/${renameTarget.id}`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Rename failed')
      setRenameTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    setError(null)
    try {
      const url =
        deleteTarget.kind === 'folder'
          ? `/api/documents/folders/${deleteTarget.id}`
          : `/api/documents/${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const isEmpty = visibleFolders.length === 0 && visibleFiles.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setCurrentFolder(null)}
            className="rounded px-2 py-1 font-medium text-foreground hover:bg-muted"
          >
            All documents
          </button>
          {trail.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setCurrentFolder(folder.id)}
                className="rounded px-2 py-1 text-foreground hover:bg-muted"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null)
                setNewFolderName('')
                setNewFolderOpen(true)
              }}
              disabled={busy}
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isEmpty ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <Folder className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">This folder is empty</p>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Upload a file or create a folder to get started.'
              : 'No documents have been added here yet.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Folders */}
          {visibleFolders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleFolders.map((folder) => (
                <Card
                  key={folder.id}
                  className="group flex items-center justify-between gap-2 p-3 transition-colors hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => setCurrentFolder(folder.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Folder className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate text-sm font-medium">{folder.name}</span>
                  </button>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Folder actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget({ kind: 'folder', id: folder.id, name: folder.name })
                            setRenameValue(folder.name)
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            setDeleteTarget({ kind: 'folder', id: folder.id, name: folder.name })
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Files */}
          {visibleFiles.length > 0 && (
            <Card className="divide-y">
              {visibleFiles.map((file) => {
                const Icon = fileIcon(file.content_type)
                return (
                  <div key={file.id} className="flex items-center gap-3 p-3">
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size_bytes)} ·{' '}
                        {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {(file.content_type?.split('/')[1] || 'file').toUpperCase()}
                    </Badge>
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <a
                        href={`/api/documents/file?id=${file.id}&download=1`}
                        aria-label={`Download ${file.name}`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">File actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <a href={`/api/documents/file?id=${file.id}`} target="_blank" rel="noreferrer">
                              <FileText className="mr-2 h-4 w-4" />
                              Open
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget({ kind: 'file', id: file.id, name: file.name })
                              setRenameValue(file.name)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ kind: 'file', id: file.id, name: file.name })
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )
              })}
            </Card>
          )}
        </div>
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFolder()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={createFolder} disabled={busy || !newFolderName.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.kind}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={busy || !renameValue.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.kind}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'folder'
                ? `"${deleteTarget?.name}" and all of its contents will be permanently deleted.`
                : `"${deleteTarget?.name}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

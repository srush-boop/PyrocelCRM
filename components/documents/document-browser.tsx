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
  Tag as TagIcon,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { TagPicker, type TagSelection } from '@/components/documents/tag-picker'
import { setFileTags } from '@/lib/actions/document-tags'
import type {
  DocumentFile,
  DocumentFolder,
  DocumentOwnerType,
  DocumentTag,
} from '@/lib/types/database'
import { formatBytes } from '@/lib/documents/utils'

interface DocumentBrowserProps {
  ownerType: DocumentOwnerType
  ownerId: string
  folders: DocumentFolder[]
  files: DocumentFile[]
  canManage: boolean
  // Full shared tag vocabulary (for pickers) + tags actually used here (for the
  // Type filter). Optional so existing callers keep working until wired up.
  allTags?: DocumentTag[]
  usedTags?: DocumentTag[]
  // When true (default), uploads require at least one tag. System reference
  // stores pass false since tagging doesn't apply there.
  requireTags?: boolean
  // Whether the user may create brand-new tags inline while uploading. Defaults
  // to `canManage` (admin/office); engineer stores pass false so engineers can
  // pick existing tags but not extend the shared vocabulary.
  allowCreateTags?: boolean
  // Path to revalidate after tag edits.
  revalidatePath?: string
  // Optional callback fired after any create/upload/rename/delete/tag change,
  // in addition to router.refresh(). Used by dialogs whose data is fetched
  // client-side (not from the route), so they can re-load after a mutation.
  onMutate?: () => void
}

function fileIcon(contentType: string | null) {
  if (contentType?.startsWith('image/')) return FileImage
  if (contentType === 'application/pdf' || contentType?.includes('word') || contentType?.startsWith('text/'))
    return FileText
  return FileIcon
}

const EMPTY_SELECTION: TagSelection = { tagIds: [], newTags: [] }

export function DocumentBrowser({
  ownerType,
  ownerId,
  folders,
  files,
  canManage,
  allTags = [],
  usedTags = [],
  requireTags = true,
  allowCreateTags,
  revalidatePath,
  onMutate,
}: DocumentBrowserProps) {
  const router = useRouter()
  // Fire router.refresh() (for route-fed callers) plus the optional onMutate
  // callback (for dialogs whose data is fetched client-side).
  const refreshAfterMutation = () => {
    router.refresh()
    onMutate?.()
  }
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

  // Upload dialog state (file staged, awaiting required tags).
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadTags, setUploadTags] = useState<TagSelection>(EMPTY_SELECTION)

  // Edit-tags dialog state.
  const [tagTarget, setTagTarget] = useState<DocumentFile | null>(null)
  const [editTags, setEditTags] = useState<TagSelection>(EMPTY_SELECTION)

  // Active "Type" filter (tag id) — only meaningful when tags are used here.
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentFolderId = currentFolder

  const visibleFolders = useMemo(
    () => folders.filter((f) => f.parent_id === currentFolderId),
    [folders, currentFolderId],
  )
  const visibleFiles = useMemo(() => {
    let list = files.filter((f) => f.folder_id === currentFolderId)
    if (typeFilter) {
      list = list.filter((f) => (f.tags ?? []).some((t) => t.id === typeFilter))
    }
    return list
  }, [files, currentFolderId, typeFilter])

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

  const canCreateTags = allowCreateTags ?? canManage

  function openUploadPicker() {
    setError(null)
    fileInputRef.current?.click()
  }

  // When files are chosen, stage them and open the tag dialog (unless tags
  // aren't required for this store, in which case upload immediately).
  function onFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const arr = Array.from(fileList)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!requireTags) {
      void runUpload(arr, EMPTY_SELECTION)
      return
    }
    setPendingFiles(arr)
    setUploadTags(EMPTY_SELECTION)
    setError(null)
    setUploadOpen(true)
  }

  async function runUpload(filesToUpload: File[], tags: TagSelection) {
    setBusy(true)
    setError(null)
    try {
      for (const file of filesToUpload) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('owner_type', ownerType)
        fd.append('owner_id', ownerId)
        fd.append('folder_id', currentFolderId ?? 'null')
        fd.append('tag_ids', JSON.stringify(tags.tagIds))
        fd.append('new_tags', JSON.stringify(tags.newTags))
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Upload failed')
        }
      }
      setUploadOpen(false)
      setPendingFiles([])
      setUploadTags(EMPTY_SELECTION)
      refreshAfterMutation()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const uploadHasTags = uploadTags.tagIds.length > 0 || uploadTags.newTags.length > 0

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
      refreshAfterMutation()
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
      refreshAfterMutation()
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
      refreshAfterMutation()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function openEditTags(file: DocumentFile) {
    setTagTarget(file)
    setEditTags({ tagIds: (file.tags ?? []).map((t) => t.id), newTags: [] })
    setError(null)
  }

  async function submitEditTags() {
    if (!tagTarget) return
    setBusy(true)
    setError(null)
    try {
      // Edit mode selects from existing tags only (allowCreate=false), so we
      // just persist the chosen tag ids. New tags are created at upload time
      // or in Settings → Tags.
      const res = await setFileTags(
        tagTarget.id,
        uniqueIds(editTags),
        revalidatePath,
      )
      if (!res.ok) throw new Error(res.error)
      setTagTarget(null)
      refreshAfterMutation()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update tags')
    } finally {
      setBusy(false)
    }
  }

  const editHasTags = editTags.tagIds.length > 0 || editTags.newTags.length > 0

  const isEmpty = visibleFolders.length === 0 && visibleFiles.length === 0
  const showTypeFilter = usedTags.length > 0

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
            <Button size="sm" onClick={openUploadPicker} disabled={busy}>
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
              onChange={(e) => onFilesChosen(e.target.files)}
            />
          </div>
        )}
      </div>

      {/* Type filter — one chip per tag actually used in this store */}
      {showTypeFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TagIcon className="h-3.5 w-3.5" />
            Type
          </span>
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              typeFilter === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            All
          </button>
          {usedTags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                typeFilter === t.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {t.name}
            </button>
          ))}
          {typeFilter && (
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {error && !uploadOpen && !tagTarget && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isEmpty ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <Folder className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            {typeFilter ? 'No documents match this type' : 'This folder is empty'}
          </p>
          <p className="text-sm text-muted-foreground">
            {typeFilter
              ? 'Try clearing the Type filter.'
              : canManage
                ? 'Upload a file or create a folder to get started.'
                : 'No documents have been added here yet.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Folders */}
          {visibleFolders.length > 0 && (
            <Card className="divide-y">
              {visibleFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="group flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => setCurrentFolder(folder.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Folder className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate text-sm font-medium">{folder.name}</span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
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
                </div>
              ))}
            </Card>
          )}

          {/* Files */}
          {visibleFiles.length > 0 && (
            <Card className="divide-y">
              {visibleFiles.map((file) => {
                const Icon = fileIcon(file.content_type)
                const tags = file.tags ?? []
                return (
                  <div key={file.id} className="flex items-center gap-3 p-3">
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size_bytes)} ·{' '}
                        {new Date(file.created_at).toLocaleDateString()}
                      </p>
                      {tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <Badge
                              key={t.id}
                              variant="outline"
                              className="px-1.5 py-0 text-[11px] font-normal"
                            >
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
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
                          <DropdownMenuItem onClick={() => openEditTags(file)}>
                            <TagIcon className="mr-2 h-4 w-4" />
                            Edit tags
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

      {/* Upload dialog (with required tags) */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setUploadOpen(false)
            setPendingFiles([])
            setUploadTags(EMPTY_SELECTION)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Tag {pendingFiles.length > 1 ? `${pendingFiles.length} documents` : 'document'}
            </DialogTitle>
            <DialogDescription>
              Add at least one tag so this{' '}
              {pendingFiles.length > 1 ? 'set of documents can' : 'document can'} be found
              easily. Tags apply to{' '}
              {pendingFiles.length > 1 ? 'all selected files.' : 'this file.'}
            </DialogDescription>
          </DialogHeader>

          {pendingFiles.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">
                {pendingFiles.length === 1
                  ? pendingFiles[0].name
                  : `${pendingFiles.length} files`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Tags</Label>
            <TagPicker
              allTags={allTags}
              value={uploadTags}
              onChange={setUploadTags}
              allowCreate={canCreateTags}
              placeholder="Select or create tags…"
            />
          </div>

          {error && uploadOpen && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadOpen(false)
                setPendingFiles([])
                setUploadTags(EMPTY_SELECTION)
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => runUpload(pendingFiles, uploadTags)}
              disabled={busy || !uploadHasTags}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit tags dialog */}
      <Dialog open={!!tagTarget} onOpenChange={(open) => !open && !busy && setTagTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tags</DialogTitle>
            <DialogDescription className="truncate">{tagTarget?.name}</DialogDescription>
          </DialogHeader>
          <TagPicker
            allTags={allTags}
            value={editTags}
            onChange={setEditTags}
            allowCreate={false}
            placeholder="Select tags…"
          />
          <p className="text-xs text-muted-foreground">
            Every document must keep at least one tag. To add a brand-new tag, create it in
            Settings → Tags first.
          </p>
          {error && tagTarget && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitEditTags} disabled={busy || !editHasTags}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

// Edit mode only sends existing tag ids (creation happens at upload / in
// Settings), so this simply returns the selected ids.
function uniqueIds(sel: TagSelection): string[] {
  return [...new Set(sel.tagIds)]
}

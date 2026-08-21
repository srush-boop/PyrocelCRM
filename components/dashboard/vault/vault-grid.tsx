'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderClosed,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Vault,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { getVaultIcon } from '@/lib/vault-icons'
import { createClient } from '@/lib/supabase/client'
import type { VaultSection, VaultFolder, VaultDocument } from '@/lib/types/database'

// Human-readable file size from a byte count.
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
import {
  VaultNotifyDialog,
  type VaultDepartment,
  type VaultStaff,
} from '@/components/dashboard/vault/vault-notify-dialog'

interface VaultGridProps {
  sections: VaultSection[]
  isAdmin: boolean
  departments: VaultDepartment[]
  staff: VaultStaff[]
}

export function VaultGrid({ sections, isAdmin, departments, staff }: VaultGridProps) {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  // Admin dialog state.
  const [folderDialog, setFolderDialog] = useState<{
    sectionId: string
    folder?: VaultFolder
  } | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderDesc, setFolderDesc] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)
  const [uploadingFolderId, setUploadingFolderId] = useState<string | null>(null)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyContext, setNotifyContext] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    | { type: 'folder'; id: string; label: string; count: number }
    | { type: 'document'; id: string; label: string }
    | null
  >(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  function matchText(...vals: (string | null | undefined)[]) {
    if (!searching) return true
    return vals.some((v) => (v ?? '').toLowerCase().includes(q))
  }

  // Filter each section's buttons/folders/documents against the query, keeping
  // only sections that still have visible content (or all, for admins, when not
  // searching so they can manage empty sections).
  const view = useMemo(() => {
    return sections
      .map((section) => {
        const buttons = (section.buttons ?? []).filter((b) =>
          matchText(b.label, b.description, b.url),
        )
        const folders = (section.folders ?? [])
          .map((folder) => {
            const docs = (folder.documents ?? []).filter((d) =>
              matchText(d.name, d.description),
            )
            const folderMatches = matchText(folder.name, folder.description)
            // Show a folder if it matches by name, has matching docs, or (no
            // search) always. When searching we only surface matching docs.
            const documents = folderMatches ? (folder.documents ?? []) : docs
            const keep = !searching || folderMatches || docs.length > 0
            return keep ? { ...folder, documents } : null
          })
          .filter((f) => f !== null) as VaultFolder[]

        const sectionMatches = matchText(section.title, section.description)
        const hasContent = buttons.length > 0 || folders.length > 0
        const keep = searching
          ? sectionMatches || hasContent
          : isAdmin || (section.buttons?.length ?? 0) > 0 || (section.folders?.length ?? 0) > 0
        return keep
          ? { ...section, buttons, folders: searching && sectionMatches ? (section.folders ?? []) : folders }
          : null
      })
      .filter((s) => s !== null) as VaultSection[]
  }, [sections, q, searching, isAdmin])

  function isSectionOpen(id: string) {
    return searching || openSections.has(id)
  }
  function isFolderOpen(id: string) {
    return searching || openFolders.has(id)
  }
  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleFolder(id: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Admin: folder create / rename ──────────────────────────────────────────
  function openNewFolder(sectionId: string) {
    setFolderDialog({ sectionId })
    setFolderName('')
    setFolderDesc('')
  }
  function openEditFolder(folder: VaultFolder) {
    setFolderDialog({ sectionId: folder.section_id, folder })
    setFolderName(folder.name)
    setFolderDesc(folder.description ?? '')
  }

  async function saveFolder() {
    if (!folderDialog) return
    if (!folderName.trim()) {
      toast.error('Please enter a folder name')
      return
    }
    setSavingFolder(true)
    const payload = {
      section_id: folderDialog.sectionId,
      name: folderName.trim(),
      description: folderDesc.trim() || null,
    }
    const { error } = folderDialog.folder
      ? await supabase.from('vault_folders').update(payload).eq('id', folderDialog.folder.id)
      : await supabase.from('vault_folders').insert(payload)
    setSavingFolder(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(folderDialog.folder ? 'Folder updated' : 'Folder created')
    setFolderDialog(null)
    router.refresh()
  }

  // ── Admin: document upload ─────────────────────────────────────────────────
  async function handleUpload(folderId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingFolderId(folderId)
    const form = new FormData()
    form.append('folder_id', folderId)
    Array.from(files).forEach((f) => form.append('file', f))
    try {
      const res = await fetch('/api/vault/documents', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Upload failed')
      } else {
        const n = json.documents?.length ?? 0
        toast.success(`Uploaded ${n} ${n === 1 ? 'file' : 'files'}`)
        setOpenFolders((prev) => new Set(prev).add(folderId))
        router.refresh()
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploadingFolderId(null)
      const input = fileInputs.current[folderId]
      if (input) input.value = ''
    }
  }

  // ── Admin: delete folder / document ────────────────────────────────────────
  async function confirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.type === 'folder') {
      const { error } = await supabase
        .from('vault_folders')
        .delete()
        .eq('id', pendingDelete.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Folder deleted')
    } else {
      const res = await fetch(`/api/vault/documents/${pendingDelete.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'Could not delete document')
        return
      }
      toast.success('Document deleted')
    }
    setPendingDelete(null)
    router.refresh()
  }

  const nothingToShow = view.length === 0

  return (
    <div className="space-y-6">
      {/* Toolbar: search + admin broadcast */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search links, folders and documents..."
            className="pl-9"
            aria-label="Search the vault"
          />
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => {
              setNotifyContext(null)
              setNotifyOpen(true)
            }}
          >
            <Bell className="mr-2 h-4 w-4" />
            Notify team
          </Button>
        )}
      </div>

      {nothingToShow ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Vault className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">
              {searching ? 'No matches found' : 'Nothing here yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {searching
                ? 'Try a different search term.'
                : isAdmin
                  ? 'Use Configure to add sections and buttons for your team.'
                  : 'Your administrator has not added any items yet.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {view.map((section) => {
            const open = isSectionOpen(section.id)
            return (
              <div key={section.id} className="rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                  aria-expanded={open}
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      open ? 'rotate-90' : ''
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{section.title}</h2>
                    {section.description && (
                      <p className="text-sm text-muted-foreground text-pretty">
                        {section.description}
                      </p>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="space-y-5 border-t p-4">
                    {/* Link buttons */}
                    {section.buttons && section.buttons.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {section.buttons.map((button) => {
                          const Icon = getVaultIcon(button.icon)
                          return (
                            <Link
                              key={button.id}
                              href={button.url}
                              target={button.open_in_new_tab ? '_blank' : undefined}
                              rel={
                                button.open_in_new_tab ? 'noopener noreferrer' : undefined
                              }
                              className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium leading-tight">
                                    {button.label}
                                  </span>
                                  {button.open_in_new_tab && (
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                  )}
                                </div>
                                {button.description && (
                                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground text-pretty">
                                    {button.description}
                                  </p>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}

                    {/* Documentation folders */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Documentation
                        </h3>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openNewFolder(section.id)}
                          >
                            <FolderPlus className="mr-2 h-4 w-4" />
                            Add folder
                          </Button>
                        )}
                      </div>

                      {(section.folders?.length ?? 0) === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          {isAdmin
                            ? 'No folders yet. Add one to store documentation here.'
                            : 'No documentation in this section yet.'}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {section.folders?.map((folder) => (
                            <FolderRow
                              key={folder.id}
                              folder={folder}
                              open={isFolderOpen(folder.id)}
                              onToggle={() => toggleFolder(folder.id)}
                              isAdmin={isAdmin}
                              uploading={uploadingFolderId === folder.id}
                              onUploadClick={() => fileInputs.current[folder.id]?.click()}
                              onEdit={() => openEditFolder(folder)}
                              onDelete={() =>
                                setPendingDelete({
                                  type: 'folder',
                                  id: folder.id,
                                  label: folder.name,
                                  count: folder.documents?.length ?? 0,
                                })
                              }
                              onDeleteDoc={(doc) =>
                                setPendingDelete({
                                  type: 'document',
                                  id: doc.id,
                                  label: doc.name,
                                })
                              }
                              onNotifyDoc={(doc) => {
                                setNotifyContext(doc.name)
                                setNotifyOpen(true)
                              }}
                              registerInput={(el) => {
                                fileInputs.current[folder.id] = el
                              }}
                              onFilesChosen={(files) => handleUpload(folder.id, files)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Folder create/edit dialog */}
      <Dialog open={folderDialog !== null} onOpenChange={(o) => !o && setFolderDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.folder ? 'Rename folder' : 'New folder'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vault-folder-name">Folder name</Label>
              <Input
                id="vault-folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Policies & procedures"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vault-folder-desc">Description (optional)</Label>
              <Textarea
                id="vault-folder-desc"
                value={folderDesc}
                onChange={(e) => setFolderDesc(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)} disabled={savingFolder}>
              Cancel
            </Button>
            <Button onClick={saveFolder} disabled={savingFolder}>
              {savingFolder ? 'Saving...' : folderDialog?.folder ? 'Save' : 'Create folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.type === 'folder' ? 'Delete folder?' : 'Delete document?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === 'folder'
                ? `"${pendingDelete.label}" ${
                    pendingDelete.count > 0
                      ? `and its ${pendingDelete.count} document${
                          pendingDelete.count === 1 ? '' : 's'
                        } will be permanently deleted.`
                      : 'will be permanently deleted.'
                  }`
                : `"${pendingDelete?.label}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin broadcast composer */}
      {isAdmin && (
        <VaultNotifyDialog
          open={notifyOpen}
          onOpenChange={setNotifyOpen}
          departments={departments}
          staff={staff}
          contextLabel={notifyContext}
        />
      )}
    </div>
  )
}

// ── Folder row (collapsible with its documents) ──────────────────────────────
interface FolderRowProps {
  folder: VaultFolder
  open: boolean
  onToggle: () => void
  isAdmin: boolean
  uploading: boolean
  onUploadClick: () => void
  onEdit: () => void
  onDelete: () => void
  onDeleteDoc: (doc: VaultDocument) => void
  onNotifyDoc: (doc: VaultDocument) => void
  registerInput: (el: HTMLInputElement | null) => void
  onFilesChosen: (files: FileList | null) => void
}

function FolderRow({
  folder,
  open,
  onToggle,
  isAdmin,
  uploading,
  onUploadClick,
  onEdit,
  onDelete,
  onDeleteDoc,
  onNotifyDoc,
  registerInput,
  onFilesChosen,
}: FolderRowProps) {
  const docs = folder.documents ?? []
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? 'rotate-90' : ''
            }`}
          />
          <FolderClosed className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate font-medium leading-tight">{folder.name}</span>
            {folder.description && (
              <span className="block truncate text-xs text-muted-foreground">
                {folder.description}
              </span>
            )}
          </span>
          <span className="ml-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {docs.length}
          </span>
        </button>

        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={registerInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onFilesChosen(e.target.files)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onUploadClick}
              disabled={uploading}
              title="Upload documents"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="sr-only">Upload documents</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit} title="Rename folder">
              <Plus className="hidden" />
              <span className="text-xs">Rename</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Delete folder"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete folder</span>
            </Button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t p-3">
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'No documents yet. Use the upload button to add files.' : 'No documents yet.'}
            </p>
          ) : (
            <ul className="divide-y">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`/api/vault/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                  >
                    {doc.name}
                    {doc.size_bytes ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatFileSize(doc.size_bytes)}
                      </span>
                    ) : null}
                  </a>
                  <a
                    href={`/api/vault/documents/${doc.id}/file?download=1`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download {doc.name}</span>
                  </a>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => onNotifyDoc(doc)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Notify team about this document"
                      >
                        <Bell className="h-4 w-4" />
                        <span className="sr-only">Notify team about {doc.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDoc(doc)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Delete document"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete {doc.name}</span>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

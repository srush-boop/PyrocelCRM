'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileText,
  Download,
  Trash2,
  Pencil,
  Loader2,
  MoreVertical,
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import type { DocumentFile } from '@/lib/types/database'
import { formatBytes, SYSTEM_REFERENCE_OWNER_ID } from '@/lib/documents/utils'
import { updateSystemReference } from '@/app/(dashboard)/dashboard/documents/system-reference-actions'

export type SystemTypeLite = {
  id: string
  name: string
  code: string | null
}

interface SystemReferencesManagerProps {
  systemTypes: SystemTypeLite[]
  references: DocumentFile[]
  canManage: boolean
}

export function SystemReferencesManager({
  systemTypes,
  references,
  canManage,
}: SystemReferencesManagerProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Upload form state
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadSystemId, setUploadSystemId] = useState<string>('')

  // Edit / delete state
  const [editTarget, setEditTarget] = useState<DocumentFile | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editSystemId, setEditSystemId] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<DocumentFile | null>(null)

  const systemName = useMemo(
    () => new Map(systemTypes.map((s) => [s.id, s.name])),
    [systemTypes],
  )

  // Group references by their assigned system (unassigned last).
  const grouped = useMemo(() => {
    const map = new Map<string, DocumentFile[]>()
    for (const ref of references) {
      const key = ref.system_type_id ?? '__unassigned__'
      const list = map.get(key) ?? []
      list.push(ref)
      map.set(key, list)
    }
    // Order by system position (as provided), unassigned at the end.
    const ordered: { id: string; label: string; items: DocumentFile[] }[] = []
    for (const s of systemTypes) {
      const items = map.get(s.id)
      if (items && items.length) ordered.push({ id: s.id, label: s.name, items })
    }
    const unassigned = map.get('__unassigned__')
    if (unassigned && unassigned.length) {
      ordered.push({ id: '__unassigned__', label: 'Unassigned', items: unassigned })
    }
    return ordered
  }, [references, systemTypes])

  function resetUpload() {
    setPendingFile(null)
    setUploadDescription('')
    setUploadSystemId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleUpload() {
    if (!pendingFile || !uploadSystemId) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      fd.append('owner_type', 'system_reference')
      fd.append('owner_id', SYSTEM_REFERENCE_OWNER_ID)
      fd.append('folder_id', 'null')
      fd.append('description', uploadDescription.trim())
      fd.append('system_type_id', uploadSystemId)
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
      }
      resetUpload()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editTarget || !editSystemId) return
    setBusy(true)
    setError(null)
    try {
      const result = await updateSystemReference({
        id: editTarget.id,
        description: editDescription.trim() || null,
        system_type_id: editSystemId,
      })
      if (!result.ok) throw new Error(result.error || 'Could not update')
      setEditTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">AI reference guides</p>
          <p>
            Documents added here are assigned to a system and used by the AI spec builder as a
            reference when writing specifications for that system. Text is extracted automatically
            on upload (including from PDFs).
          </p>
        </div>
      </div>

      {/* Upload panel (admin only) */}
      {canManage && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reference-file">Reference document</Label>
            <input
              ref={fileInputRef}
              id="reference-file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PDF, Word (.docx) or text files.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reference-system">Assign to system</Label>
              <Select value={uploadSystemId} onValueChange={setUploadSystemId}>
                <SelectTrigger id="reference-system">
                  <SelectValue placeholder="Choose a system" />
                </SelectTrigger>
                <SelectContent>
                  {systemTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reference-description">Description</Label>
            <Textarea
              id="reference-description"
              placeholder="Describe what this document covers and how it should guide the AI (e.g. 'BS 5839-1 detection design rules for commercial fire alarm systems')."
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            {pendingFile && (
              <span className="mr-auto truncate text-sm text-muted-foreground">
                {pendingFile.name}
              </span>
            )}
            <Button
              variant="outline"
              onClick={resetUpload}
              disabled={busy || (!pendingFile && !uploadDescription && !uploadSystemId)}
            >
              Clear
            </Button>
            <Button onClick={handleUpload} disabled={busy || !pendingFile || !uploadSystemId}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Add reference
            </Button>
          </div>
          {busy && (
            <p className="text-xs text-muted-foreground">
              Uploading and extracting text — this can take a moment for large PDFs.
            </p>
          )}
        </Card>
      )}

      {!canManage && error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Reference list grouped by system */}
      {grouped.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">No system references yet</p>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Add a document above and assign it to a system to build your AI reference library.'
              : 'No reference guides have been added yet.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
              <Card className="divide-y">
                {group.items.map((ref) => {
                  const textCaptured = !!ref.extracted_text && ref.extracted_text.length > 0
                  return (
                    <div key={ref.id} className="flex items-start gap-3 p-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{ref.name}</p>
                          {textCaptured ? (
                            <Badge variant="secondary" className="gap-1">
                              <Sparkles className="h-3 w-3" />
                              Text captured
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No text extracted
                            </Badge>
                          )}
                        </div>
                        {ref.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{ref.description}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBytes(ref.size_bytes)} ·{' '}
                          {new Date(ref.created_at).toLocaleDateString()}
                          {textCaptured
                            ? ` · ${ref.extracted_text!.length.toLocaleString()} characters`
                            : ''}
                        </p>
                      </div>
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <a
                          href={`/api/documents/file?id=${ref.id}&download=1`}
                          aria-label={`Download ${ref.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Reference actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(ref)
                                setEditDescription(ref.description ?? '')
                                setEditSystemId(ref.system_type_id ?? '')
                                setError(null)
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(ref)}
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
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit reference</DialogTitle>
            <DialogDescription className="truncate">{editTarget?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-system">System</Label>
              <Select value={editSystemId} onValueChange={setEditSystemId}>
                <SelectTrigger id="edit-system">
                  <SelectValue placeholder="Choose a system" />
                </SelectTrigger>
                <SelectContent>
                  {systemTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={busy || !editSystemId}>
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
            <AlertDialogTitle>Delete reference?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${deleteTarget?.name}" will be permanently deleted and no longer used by the AI.`}
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

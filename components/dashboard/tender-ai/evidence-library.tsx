'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Loader2,
  Paperclip,
  Search,
  Trash2,
  Download,
  FileText,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { TenderEvidence } from '@/lib/tender/types'

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false
  const diff = new Date(date).getTime() - Date.now()
  return diff < 1000 * 60 * 60 * 24 * 30 // within 30 days (or already past)
}

export function EvidenceLibrary({ evidence }: { evidence: TenderEvidence[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ title: '', description: '', tags: '', expiry_date: '' })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return evidence
    return evidence.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [evidence, query])

  const submit = useCallback(async () => {
    if (!form.title.trim()) {
      toast.error('A title is required')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('title', form.title.trim())
      fd.set('description', form.description.trim())
      fd.set('tags', form.tags)
      fd.set('expiry_date', form.expiry_date)
      const file = fileRef.current?.files?.[0]
      if (file) fd.set('file', file)

      const res = await fetch('/api/tender/evidence', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save evidence')
      }
      toast.success('Evidence added')
      setForm({ title: '', description: '', tags: '', expiry_date: '' })
      if (fileRef.current) fileRef.current.value = ''
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save evidence')
    } finally {
      setSaving(false)
    }
  }, [form, router])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tender/evidence/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Evidence removed')
      setDeleteId(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteId, router])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search evidence..."
            className="pl-9"
            aria-label="Search evidence"
          />
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          Add evidence
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Paperclip className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              No evidence found. Add certificates and supporting documents here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => {
            const expiring = isExpiringSoon(e.expiry_date)
            return (
              <Card key={e.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <h3 className="truncate font-medium">{e.title}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(e.id)}
                      aria-label="Delete evidence"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {e.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{e.description}</p>
                  )}
                  {e.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {e.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                    {e.expiry_date ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          expiring ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {expiring ? (
                          <AlertTriangle className="size-3.5" />
                        ) : (
                          <CalendarClock className="size-3.5" />
                        )}
                        Expires {new Date(e.expiry_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No expiry</span>
                    )}
                    {e.file_url && (
                      <a
                        href={`/api/tender/evidence/file?id=${e.id}&download=1`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download className="size-3.5" />
                        {e.file_name ?? 'Download'}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
            <DialogDescription>
              Upload a supporting document and tag it so the AI can recommend it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-title">Title</Label>
              <Input
                id="e-title"
                value={form.title}
                onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
                placeholder="e.g. ISO 9001 Certificate 2025"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-desc">Description</Label>
              <Textarea
                id="e-desc"
                value={form.description}
                onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
                rows={3}
                placeholder="What this document proves..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-tags">Tags</Label>
                <Input
                  id="e-tags"
                  value={form.tags}
                  onChange={(ev) => setForm((f) => ({ ...f, tags: ev.target.value }))}
                  placeholder="Comma separated"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-expiry">Expiry date</Label>
                <Input
                  id="e-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(ev) => setForm((f) => ({ ...f, expiry_date: ev.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-file">File</Label>
              <Input id="e-file" type="file" ref={fileRef} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Add evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this evidence?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

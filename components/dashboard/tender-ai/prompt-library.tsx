'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Loader2, MessageSquareText, Pencil, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import type { TenderPrompt } from '@/lib/tender/types'

interface DraftState {
  id?: string
  name: string
  description: string
  prompt_text: string
  category: string
}

const EMPTY: DraftState = { name: '', description: '', prompt_text: '', category: '' }

export function PromptLibrary({ prompts }: { prompts: TenderPrompt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DraftState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = useCallback(() => {
    setDraft(EMPTY)
    setOpen(true)
  }, [])

  const openEdit = useCallback((p: TenderPrompt) => {
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      prompt_text: p.prompt_text,
      category: p.category ?? '',
    })
    setOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!draft.name.trim() || !draft.prompt_text.trim()) {
      toast.error('Name and prompt text are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        prompt_text: draft.prompt_text.trim(),
        category: draft.category.trim() || null,
      }
      const res = await fetch(
        draft.id ? `/api/tender/prompts/${draft.id}` : '/api/tender/prompts',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) throw new Error('Failed to save prompt')
      toast.success(draft.id ? 'Prompt updated' : 'Prompt added')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }, [draft, router])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tender/prompts/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Prompt removed')
      setDeleteId(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteId, router])

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Prompt copied')
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add prompt
        </Button>
      </div>

      {prompts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <MessageSquareText className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              No prompts yet. Save reusable instructions to guide the AI.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {prompts.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="gap-1.5 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-balance">{p.name}</h3>
                  {p.category && (
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {p.category}
                    </Badge>
                  )}
                </div>
                {p.description && (
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                <p className="line-clamp-4 flex-1 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  {p.prompt_text}
                </p>
                <div className="flex items-center justify-end gap-1 border-t pt-3">
                  <Button variant="ghost" size="sm" onClick={() => copy(p.prompt_text)}>
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(p.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit prompt' : 'Add prompt'}</DialogTitle>
            <DialogDescription>
              Prompts capture reusable instructions or answer styles for the AI.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Health & Safety answer style"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-cat">Category</Label>
                <Input
                  id="p-cat"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Input
                id="p-desc"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="When to use this prompt"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-text">Prompt text</Label>
              <Textarea
                id="p-text"
                value={draft.prompt_text}
                onChange={(e) => setDraft((d) => ({ ...d, prompt_text: e.target.value }))}
                rows={8}
                placeholder="The instruction the AI should follow..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {draft.id ? 'Save changes' : 'Add prompt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
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

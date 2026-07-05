'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Loader2,
  Archive,
  Search,
  Trash2,
  Download,
  Pencil,
  Trophy,
  XCircle,
  Clock,
  Sparkles,
  MessageSquareQuote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  VAULT_OUTCOME_META,
  VAULT_OUTCOME_ORDER,
  type TenderVaultEntry,
  type TenderVaultOutcome,
} from '@/lib/tender/types'

type OutcomeFilter = TenderVaultOutcome | 'all'

const OUTCOME_ICON: Record<TenderVaultOutcome, typeof Trophy> = {
  won: Trophy,
  lost: XCircle,
  awaiting: Clock,
}

// Badge colour per outcome, using the theme's chart tokens so we never
// hard-code raw colours.
const OUTCOME_BADGE: Record<TenderVaultOutcome, string> = {
  won: 'bg-chart-2/20 text-foreground',
  lost: 'bg-destructive/15 text-destructive',
  awaiting: 'bg-muted text-muted-foreground',
}

interface VaultForm {
  title: string
  client_name: string
  reference: string
  outcome: TenderVaultOutcome
  submitted_date: string
  decision_date: string
  contract_value: string
  summary: string
  winning_content: string
  client_feedback: string
}

const EMPTY_FORM: VaultForm = {
  title: '',
  client_name: '',
  reference: '',
  outcome: 'awaiting',
  submitted_date: '',
  decision_date: '',
  contract_value: '',
  summary: '',
  winning_content: '',
  client_feedback: '',
}

function entryHasAiContent(e: TenderVaultEntry): boolean {
  return Boolean(e.summary?.trim() || e.winning_content?.trim() || e.client_feedback?.trim())
}

export function TenderVault({ entries }: { entries: TenderVaultEntry[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<VaultForm>(EMPTY_FORM)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (outcomeFilter !== 'all' && e.outcome !== outcomeFilter) return false
      if (!q) return true
      return (
        e.title.toLowerCase().includes(q) ||
        e.client_name?.toLowerCase().includes(q) ||
        e.reference?.toLowerCase().includes(q) ||
        e.summary?.toLowerCase().includes(q) ||
        e.client_feedback?.toLowerCase().includes(q)
      )
    })
  }, [entries, query, outcomeFilter])

  const openCreate = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    if (fileRef.current) fileRef.current.value = ''
    setOpen(true)
  }, [])

  const openEdit = useCallback((e: TenderVaultEntry) => {
    setEditingId(e.id)
    setForm({
      title: e.title,
      client_name: e.client_name ?? '',
      reference: e.reference ?? '',
      outcome: e.outcome,
      submitted_date: e.submitted_date ?? '',
      decision_date: e.decision_date ?? '',
      contract_value: e.contract_value != null ? String(e.contract_value) : '',
      summary: e.summary ?? '',
      winning_content: e.winning_content ?? '',
      client_feedback: e.client_feedback ?? '',
    })
    if (fileRef.current) fileRef.current.value = ''
    setOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!form.title.trim()) {
      toast.error('A title is required')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('title', form.title.trim())
      fd.set('client_name', form.client_name.trim())
      fd.set('reference', form.reference.trim())
      fd.set('outcome', form.outcome)
      fd.set('submitted_date', form.submitted_date)
      fd.set('decision_date', form.decision_date)
      fd.set('contract_value', form.contract_value.trim())
      fd.set('summary', form.summary.trim())
      fd.set('winning_content', form.winning_content.trim())
      fd.set('client_feedback', form.client_feedback.trim())
      const file = fileRef.current?.files?.[0]
      if (file) fd.set('file', file)

      const url = editingId ? `/api/tender/vault/${editingId}` : '/api/tender/vault'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
      toast.success(editingId ? 'Tender updated' : 'Completed tender added to the vault')
      setOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [form, editingId, router])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tender/vault/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Removed from the vault')
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search completed tenders..."
            className="pl-9"
            aria-label="Search completed tenders"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(['all', ...VAULT_OUTCOME_ORDER] as OutcomeFilter[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcomeFilter(o)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  outcomeFilter === o
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {o === 'all' ? 'All' : VAULT_OUTCOME_META[o].label}
              </button>
            ))}
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="size-4" />
            Add tender
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Archive className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No completed tenders yet</p>
              <p className="text-sm text-muted-foreground text-pretty">
                Upload finished submissions, record whether they won, and add client feedback so the
                AI can learn from your past bids.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => {
            const OutcomeIcon = OUTCOME_ICON[e.outcome]
            return (
              <Card key={e.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{e.title}</h3>
                      {e.client_name && (
                        <p className="truncate text-sm text-muted-foreground">{e.client_name}</p>
                      )}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_BADGE[e.outcome]}`}
                    >
                      <OutcomeIcon className="size-3" />
                      {VAULT_OUTCOME_META[e.outcome].label}
                    </span>
                  </div>

                  {e.summary && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{e.summary}</p>
                  )}

                  {e.client_feedback && (
                    <div className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                      <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" />
                      <span className="line-clamp-2">{e.client_feedback}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {e.contract_value != null && (
                      <span>
                        Value: £
                        {e.contract_value.toLocaleString('en-GB', {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    )}
                    {e.submitted_date && (
                      <span>Submitted {new Date(e.submitted_date).toLocaleDateString('en-GB')}</span>
                    )}
                    {entryHasAiContent(e) && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Sparkles className="size-3" />
                        AI-indexed
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                    {e.file_url ? (
                      <a
                        href={`/api/tender/vault/file?id=${e.id}&download=1`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download className="size-3.5" />
                        {e.file_name ?? 'Download'}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file</span>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(e)}
                        aria-label="Edit tender"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(e.id)}
                        aria-label="Delete tender"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit completed tender' : 'Add completed tender'}</DialogTitle>
            <DialogDescription>
              Store the finished submission and record its outcome. The summary, key content and
              client feedback are indexed so the AI can assess and improve future bids.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="v-title">Tender title</Label>
                <Input
                  id="v-title"
                  value={form.title}
                  onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
                  placeholder="e.g. Fire safety maintenance — City Council"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-client">Client name</Label>
                <Input
                  id="v-client"
                  value={form.client_name}
                  onChange={(ev) => setForm((f) => ({ ...f, client_name: ev.target.value }))}
                  placeholder="e.g. City Council"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-ref">Reference</Label>
                <Input
                  id="v-ref"
                  value={form.reference}
                  onChange={(ev) => setForm((f) => ({ ...f, reference: ev.target.value }))}
                  placeholder="Tender / PQQ reference"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-outcome">Outcome</Label>
                <Select
                  value={form.outcome}
                  onValueChange={(v) => setForm((f) => ({ ...f, outcome: v as TenderVaultOutcome }))}
                >
                  <SelectTrigger id="v-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAULT_OUTCOME_ORDER.map((o) => (
                      <SelectItem key={o} value={o}>
                        {VAULT_OUTCOME_META[o].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-submitted">Submitted date</Label>
                <Input
                  id="v-submitted"
                  type="date"
                  value={form.submitted_date}
                  onChange={(ev) => setForm((f) => ({ ...f, submitted_date: ev.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-decision">Decision date</Label>
                <Input
                  id="v-decision"
                  type="date"
                  value={form.decision_date}
                  onChange={(ev) => setForm((f) => ({ ...f, decision_date: ev.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-value">Contract value (£)</Label>
              <Input
                id="v-value"
                inputMode="numeric"
                value={form.contract_value}
                onChange={(ev) => setForm((f) => ({ ...f, contract_value: ev.target.value }))}
                placeholder="e.g. 120000"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-summary">Summary</Label>
              <Textarea
                id="v-summary"
                value={form.summary}
                onChange={(ev) => setForm((f) => ({ ...f, summary: ev.target.value }))}
                rows={3}
                placeholder="What the tender was for and your overall approach."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-content">Key response content</Label>
              <Textarea
                id="v-content"
                value={form.winning_content}
                onChange={(ev) => setForm((f) => ({ ...f, winning_content: ev.target.value }))}
                rows={5}
                placeholder="Paste the standout answers or winning text you want the AI to reuse."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-feedback">Client feedback</Label>
              <Textarea
                id="v-feedback"
                value={form.client_feedback}
                onChange={(ev) => setForm((f) => ({ ...f, client_feedback: ev.target.value }))}
                rows={3}
                placeholder="Any scoring notes or feedback the client gave — useful for wins and losses."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-file">
                Completed tender file {editingId && '(leave blank to keep the current file)'}
              </Label>
              <Input id="v-file" type="file" ref={fileRef} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingId ? 'Save changes' : 'Add to vault'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this tender from the vault?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the record and stops it influencing future AI answers. This cannot be
              undone.
            </AlertDialogDescription>
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

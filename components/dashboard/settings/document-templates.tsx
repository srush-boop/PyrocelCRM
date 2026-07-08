'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import type {
  DocumentOwnerType,
  DocumentTemplate,
  DocumentTemplateCategory,
} from '@/lib/types/database'
import { OWNER_TYPE_LABELS } from '@/lib/documents/merge-tokens'
import { saveTemplate, deleteTemplate } from '@/lib/actions/documents-create'

interface DocumentTemplatesSettingsProps {
  templates: DocumentTemplate[]
}

const CATEGORIES: { value: DocumentTemplateCategory; label: string }[] = [
  { value: 'general_letter', label: 'General letter' },
  { value: 'cancellation_ack', label: 'Cancellation acknowledgement' },
  { value: 'complaint_response', label: 'Complaint response' },
  { value: 'payment_request', label: 'Payment request' },
  { value: 'other', label: 'Other' },
]

// Entity types templates can be scoped to (system_reference/site_engineer omitted:
// generated letters don't apply to the global reference store).
const ENTITY_OPTIONS: DocumentOwnerType[] = [
  'client',
  'site',
  'site_service',
  'task',
  'quote',
  'job',
]

interface FormState {
  id?: string
  name: string
  category: DocumentTemplateCategory
  subject: string
  body: string
  entity_types: DocumentOwnerType[]
  is_active: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    category: 'general_letter',
    subject: '',
    body: '',
    entity_types: ['client'],
    is_active: true,
  }
}

export function DocumentTemplatesSettings({ templates }: DocumentTemplatesSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplate | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openCreate() {
    setForm(emptyForm())
    setMessage(null)
    setDialogOpen(true)
  }

  function openEdit(tpl: DocumentTemplate) {
    setForm({
      id: tpl.id,
      name: tpl.name,
      category: tpl.category,
      subject: tpl.subject ?? '',
      body: tpl.body,
      entity_types: tpl.entity_types,
      is_active: tpl.is_active,
    })
    setMessage(null)
    setDialogOpen(true)
  }

  function toggleEntity(type: DocumentOwnerType) {
    setForm((f) => ({
      ...f,
      entity_types: f.entity_types.includes(type)
        ? f.entity_types.filter((t) => t !== type)
        : [...f.entity_types, type],
    }))
  }

  function handleSave() {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Template name is required.' })
      return
    }
    if (form.entity_types.length === 0) {
      setMessage({ type: 'error', text: 'Choose at least one entity type.' })
      return
    }
    startTransition(async () => {
      const res = await saveTemplate({
        id: form.id,
        name: form.name,
        category: form.category,
        subject: form.subject,
        body: form.body,
        entity_types: form.entity_types,
        is_active: form.is_active,
      })
      if (!res.ok) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      const res = await deleteTemplate(target.id)
      setDeleteTarget(null)
      if (!res.ok) {
        setMessage({ type: 'error', text: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Document templates</CardTitle>
          <CardDescription>
            Reusable letters merged with client, site, call, quote and job details. Use{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{'{{tokens}}'}</code> like{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{'{{client.contact_name}}'}</code>{' '}
            — the insert-field menu in the editor lists every available field.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add template
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No templates yet. Add one to speed up common letters.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tpl.entity_types.map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {OWNER_TYPE_LABELS[t] ?? t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tpl.is_active ? 'default' : 'secondary'}>
                        {tpl.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(tpl)}
                          aria-label={`Edit ${tpl.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(tpl)}
                          aria-label={`Delete ${tpl.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit template' : 'Add template'}</DialogTitle>
            <DialogDescription>
              Write the letter body with merge tokens. Tokens are filled in when a user creates a
              document from an entity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="t-name">Name</Label>
                <Input
                  id="t-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Acknowledgement of cancellation"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as DocumentTemplateCategory })}
                >
                  <SelectTrigger id="t-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Applies to</Label>
              <div className="flex flex-wrap gap-2">
                {ENTITY_OPTIONS.map((type) => {
                  const active = form.entity_types.includes(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleEntity(type)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {OWNER_TYPE_LABELS[type]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="t-subject">Email subject</Label>
              <Input
                id="t-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Used as the default subject when emailing"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="t-body">Body</Label>
              <Textarea
                id="t-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={12}
                className="font-mono text-sm"
                placeholder="Dear {{client.contact_name}}, ..."
              />
              <p className="text-xs text-muted-foreground">
                Insert tokens like {'{{company.name}}'}, {'{{site.address}}'}, {'{{today}}'}. Unknown
                or empty fields are left blank.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Active (available when creating documents)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This template will no longer be available when creating documents. Documents already
              generated from it are unaffected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

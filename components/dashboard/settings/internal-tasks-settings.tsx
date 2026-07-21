'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ClipboardCheck,
  CornerDownRight,
  GripVertical,
  BellRing,
  Heading,
  FileText,
  Link2,
  Table as TableIcon,
} from 'lucide-react'
import type {
  Department,
  Role,
  Profile,
  InternalTaskTemplate,
  InternalTaskFrequency,
  InternalTaskItem,
  InternalTaskTableColumn,
  ChecklistItem,
  ChecklistCondition,
} from '@/lib/types/database'
import {
  saveInternalTaskTemplate,
  deleteInternalTaskTemplate,
} from '@/lib/actions/internal-tasks'

interface Props {
  templates: InternalTaskTemplate[]
  departments: Department[]
  roles: Role[]
  users: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  // Company-wide reference documents that can be linked from a doc_link block.
  documents: { id: string; name: string }[]
}

// Question types the user actually answers (support conditional rules).
type QuestionType = 'pass_fail' | 'checkbox' | 'text' | 'number'
const QUESTION_TYPES: readonly QuestionType[] = [
  'pass_fail',
  'checkbox',
  'text',
  'number',
]

// Whether a block is a question the user answers (vs a display/content block).
function isQuestionType(type: InternalTaskItem['type']): type is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(type)
}

const FREQUENCY_LABELS: Record<InternalTaskFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  one_off: 'One-off',
}

const ITEM_TYPES = [
  { value: 'pass_fail', label: 'Pass / Fail' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
] as const

const DOW = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

function blankTemplate(): InternalTaskTemplate {
  return {
    id: '',
    name: '',
    description: null,
    category: null,
    active: true,
    sort_order: 0,
    frequency: 'weekly',
    week_ending_dow: 0,
    anchor_month: null,
    anchor_day: null,
    one_off_due_date: null,
    grace_days: 1,
    due_time: '09:00',
    reminder_days_before: [1],
    warn_overdue: true,
    questions: [],
    requires_reference: false,
    reference_label: null,
    applies_to_all: false,
    role_names: [],
    department_ids: [],
    user_ids: [],
    notify_on_issue_user_ids: [],
    notify_on_issue_email: null,
    created_by: null,
    created_at: '',
    updated_at: '',
  }
}

export function InternalTasksSettings({
  templates,
  departments,
  roles,
  users,
  documents,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<InternalTaskTemplate | null>(null)
  const [open, setOpen] = useState(false)

  function startCreate() {
    setEditing(blankTemplate())
    setOpen(true)
  }
  function startEdit(t: InternalTaskTemplate) {
    setEditing(structuredClone(t))
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" />
            Internal Tasks
          </CardTitle>
          <CardDescription>
            Recurring internal quality/management tasks (toolbox talks, vehicle
            checks, nominations) with conditional questions, photos and reminders.
          </CardDescription>
        </div>
        <Button onClick={startCreate}>
          <Plus className="size-4" />
          New task
        </Button>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No internal tasks yet. Create one to start assigning recurring work.
          </p>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{t.name}</p>
                    <Badge variant="secondary">{FREQUENCY_LABELS[t.frequency]}</Badge>
                    {t.category ? <Badge variant="outline">{t.category}</Badge> : null}
                    {!t.active ? <Badge variant="outline">Inactive</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.applies_to_all
                      ? 'All users'
                      : [
                          t.role_names.length ? `${t.role_names.length} role(s)` : null,
                          t.department_ids.length
                            ? `${t.department_ids.length} dept(s)`
                            : null,
                          t.user_ids.length ? `${t.user_ids.length} user(s)` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No assignees'}
                    {t.questions.length ? ` · ${t.questions.length} question(s)` : ''}
                    {t.requires_reference ? ' · reference required' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(t)}>
                    <Pencil className="size-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <DeleteButton templateId={t.id} name={t.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editing ? (
        <TemplateEditorDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) setEditing(null)
          }}
          template={editing}
          departments={departments}
          roles={roles}
          users={users}
          documents={documents}
          onSaved={() => {
            setOpen(false)
            setEditing(null)
            router.refresh()
          }}
        />
      ) : null}
    </Card>
  )
}

function DeleteButton({ templateId, name }: { templateId: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setConfirm(true)}>
        <Trash2 className="size-4 text-destructive" />
        <span className="sr-only">Delete</span>
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete internal task?</DialogTitle>
            <DialogDescription>
              This permanently removes &quot;{name}&quot; and all its recorded
              completions. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteInternalTaskTemplate(templateId)
                  setConfirm(false)
                  router.refresh()
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  departments,
  roles,
  users,
  documents,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  template: InternalTaskTemplate
  departments: Department[]
  roles: Role[]
  users: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  documents: { id: string; name: string }[]
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<InternalTaskTemplate>(template)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(updates: Partial<InternalTaskTemplate>) {
    setDraft((d) => ({ ...d, ...updates }))
  }

  // --- Question / block helpers ----------------------------------------------
  function addQuestion() {
    const q: InternalTaskItem = {
      id: crypto.randomUUID(),
      label: '',
      type: 'pass_fail',
      required: true,
    }
    patch({ questions: [...draft.questions, q] })
  }
  // Adds a display/content block (section heading, document link, URL link or
  // fillable table). These carry no answer and no conditional rules.
  function addBlock(type: 'section' | 'doc_link' | 'url_link' | 'table') {
    const base: InternalTaskItem = {
      id: crypto.randomUUID(),
      label: '',
      type,
      required: false,
    }
    if (type === 'section') base.description = ''
    if (type === 'doc_link') {
      base.documentId = null
      base.documentName = null
    }
    if (type === 'url_link') base.url = ''
    if (type === 'table') {
      base.columns = [{ id: crypto.randomUUID(), label: '', type: 'text' }]
    }
    patch({ questions: [...draft.questions, base] })
  }
  function updateQuestion(id: string, updates: Partial<InternalTaskItem>) {
    patch({
      questions: draft.questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    })
  }
  function removeQuestion(id: string) {
    patch({ questions: draft.questions.filter((q) => q.id !== id) })
  }
  // Table column helpers (table blocks only).
  function addColumn(qId: string) {
    updateQuestion(qId, {
      columns: [
        ...(draft.questions.find((q) => q.id === qId)?.columns ?? []),
        { id: crypto.randomUUID(), label: '', type: 'text' },
      ],
    })
  }
  function updateColumn(qId: string, colId: string, updates: Partial<InternalTaskTableColumn>) {
    const cols = draft.questions.find((q) => q.id === qId)?.columns ?? []
    updateQuestion(qId, {
      columns: cols.map((c) => (c.id === colId ? { ...c, ...updates } : c)),
    })
  }
  function removeColumn(qId: string, colId: string) {
    const cols = draft.questions.find((q) => q.id === qId)?.columns ?? []
    updateQuestion(qId, { columns: cols.filter((c) => c.id !== colId) })
  }
  function addCondition(qId: string) {
    patch({
      questions: draft.questions.map((q) => {
        if (q.id !== qId) return q
        const cond: ChecklistCondition = {
          id: crypto.randomUUID(),
          when: q.type === 'checkbox' ? 'checked' : q.type === 'number' ? 'number' : 'fail',
          comparator: q.type === 'number' ? 'lt' : undefined,
          threshold: q.type === 'number' ? 0 : undefined,
          requirePhoto: false,
          requireNote: false,
          items: [],
        }
        return { ...q, conditions: [...(q.conditions ?? []), cond] }
      }),
    })
  }
  function updateCondition(qId: string, cId: string, updates: Partial<ChecklistCondition>) {
    patch({
      questions: draft.questions.map((q) =>
        q.id !== qId
          ? q
          : {
              ...q,
              conditions: (q.conditions ?? []).map((c) =>
                c.id === cId ? { ...c, ...updates } : c,
              ),
            },
      ),
    })
  }
  function removeCondition(qId: string, cId: string) {
    patch({
      questions: draft.questions.map((q) =>
        q.id !== qId
          ? q
          : { ...q, conditions: (q.conditions ?? []).filter((c) => c.id !== cId) },
      ),
    })
  }
  function addFollowUp(qId: string, cId: string) {
    patch({
      questions: draft.questions.map((q) =>
        q.id !== qId
          ? q
          : {
              ...q,
              conditions: (q.conditions ?? []).map((c) =>
                c.id !== cId
                  ? c
                  : {
                      ...c,
                      items: [
                        ...(c.items ?? []),
                        {
                          id: crypto.randomUUID(),
                          label: '',
                          type: 'text' as const,
                          required: true,
                        },
                      ],
                    },
              ),
            },
      ),
    })
  }
  function updateFollowUp(
    qId: string,
    cId: string,
    fId: string,
    updates: Partial<ChecklistItem>,
  ) {
    patch({
      questions: draft.questions.map((q) =>
        q.id !== qId
          ? q
          : {
              ...q,
              conditions: (q.conditions ?? []).map((c) =>
                c.id !== cId
                  ? c
                  : {
                      ...c,
                      items: (c.items ?? []).map((f) =>
                        f.id === fId ? { ...f, ...updates } : f,
                      ),
                    },
              ),
            },
      ),
    })
  }
  function removeFollowUp(qId: string, cId: string, fId: string) {
    patch({
      questions: draft.questions.map((q) =>
        q.id !== qId
          ? q
          : {
              ...q,
              conditions: (q.conditions ?? []).map((c) =>
                c.id !== cId
                  ? c
                  : { ...c, items: (c.items ?? []).filter((f) => f.id !== fId) },
              ),
            },
      ),
    })
  }

  // --- Targeting helpers -----------------------------------------------------
  function toggleArray<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    if (!draft.name.trim()) {
      setError('Name is required')
      setSaving(false)
      return
    }
    const result = await saveInternalTaskTemplate(draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not save')
      return
    }
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? 'Edit' : 'New'} internal task</DialogTitle>
          <DialogDescription>
            Configure the recurring task, its questions and who it applies to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Basics */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="it-name">Name</Label>
              <Input
                id="it-name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Weekly toolbox talk"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="it-desc">Description</Label>
              <Textarea
                id="it-desc"
                value={draft.description ?? ''}
                onChange={(e) => patch({ description: e.target.value || null })}
                placeholder="What the user needs to do"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="it-cat">Category</Label>
              <Input
                id="it-cat"
                value={draft.category ?? ''}
                onChange={(e) => patch({ category: e.target.value || null })}
                placeholder="H&S / Vehicle / HR"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="it-active"
                  checked={draft.active}
                  onCheckedChange={(v) => patch({ active: v })}
                />
                <Label htmlFor="it-active">Active</Label>
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">Recurrence &amp; deadline</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Frequency</Label>
                <Select
                  value={draft.frequency}
                  onValueChange={(v) => patch({ frequency: v as InternalTaskFrequency })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.frequency === 'weekly' ? (
                <div>
                  <Label>Week ending day</Label>
                  <Select
                    value={String(draft.week_ending_dow)}
                    onValueChange={(v) => patch({ week_ending_dow: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOW.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {draft.frequency === 'one_off' ? (
                <div>
                  <Label htmlFor="it-oneoff">Due date</Label>
                  <Input
                    id="it-oneoff"
                    type="date"
                    value={draft.one_off_due_date ?? ''}
                    onChange={(e) => patch({ one_off_due_date: e.target.value || null })}
                  />
                </div>
              ) : null}
              <div>
                <Label htmlFor="it-grace">Grace days after period</Label>
                <Input
                  id="it-grace"
                  type="number"
                  min={0}
                  value={draft.grace_days}
                  onChange={(e) => patch({ grace_days: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="it-due-time">Deadline time</Label>
                <Input
                  id="it-due-time"
                  type="time"
                  value={draft.due_time.slice(0, 5)}
                  onChange={(e) => patch({ due_time: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="it-reminders">Reminder days before (comma separated)</Label>
                <Input
                  id="it-reminders"
                  value={draft.reminder_days_before.join(', ')}
                  onChange={(e) =>
                    patch({
                      reminder_days_before: e.target.value
                        .split(',')
                        .map((s) => Number(s.trim()))
                        .filter((n) => !Number.isNaN(n) && n >= 0),
                    })
                  }
                  placeholder="3, 1"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="it-warn"
                  checked={draft.warn_overdue}
                  onCheckedChange={(v) => patch({ warn_overdue: v })}
                />
                <Label htmlFor="it-warn">Warn when overdue</Label>
              </div>
            </div>
          </div>

          {/* Reference */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Switch
                id="it-ref"
                checked={draft.requires_reference}
                onCheckedChange={(v) => patch({ requires_reference: v })}
              />
              <Label htmlFor="it-ref">Require a reference number on completion</Label>
            </div>
            {draft.requires_reference ? (
              <div className="mt-3">
                <Label htmlFor="it-ref-label">Reference label</Label>
                <Input
                  id="it-ref-label"
                  value={draft.reference_label ?? ''}
                  onChange={(e) => patch({ reference_label: e.target.value || null })}
                  placeholder="Toolbox talk reference number"
                />
              </div>
            ) : null}
          </div>

          {/* Questions & content blocks */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-medium">Questions &amp; content</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="size-4" />
                  Question
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBlock('section')}>
                  <Heading className="size-4" />
                  Section
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBlock('doc_link')}>
                  <FileText className="size-4" />
                  Document
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBlock('url_link')}>
                  <Link2 className="size-4" />
                  Link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addBlock('table')}>
                  <TableIcon className="size-4" />
                  Table
                </Button>
              </div>
            </div>
            {draft.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No content yet — add questions, section headings, document/URL links or
                tables. With none, the user just confirms completion.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {draft.questions.map((q) =>
                  !isQuestionType(q.type) ? (
                    <BlockEditor
                      key={q.id}
                      block={q}
                      documents={documents}
                      onChange={(u) => updateQuestion(q.id, u)}
                      onRemove={() => removeQuestion(q.id)}
                      onAddColumn={() => addColumn(q.id)}
                      onUpdateColumn={(colId, u) => updateColumn(q.id, colId, u)}
                      onRemoveColumn={(colId) => removeColumn(q.id, colId)}
                    />
                  ) : (
                  <div key={q.id} className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-2 size-4 shrink-0 text-muted-foreground" />
                      <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <Input
                          value={q.label}
                          onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                          placeholder="Question label"
                        />
                        <Select
                          value={q.type}
                          onValueChange={(v) =>
                            updateQuestion(q.id, {
                              type: v as ChecklistItem['type'],
                              conditions: v === 'text' ? undefined : q.conditions,
                            })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ITEM_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Checkbox
                            id={`req-${q.id}`}
                            checked={q.required !== false}
                            onCheckedChange={(v) =>
                              updateQuestion(q.id, { required: v === true })
                            }
                          />
                          <Label htmlFor={`req-${q.id}`} className="text-xs">
                            Required
                          </Label>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQuestion(q.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Conditional rules (not for text) */}
                    {q.type !== 'text' ? (
                      <div className="mt-3 space-y-2 pl-6">
                        {(q.conditions ?? []).map((c) => (
                          <div key={c.id} className="rounded border border-dashed p-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <CornerDownRight className="size-4 text-muted-foreground" />
                              <span>When answer is</span>
                              {q.type === 'pass_fail' ? (
                                <Select
                                  value={c.when}
                                  onValueChange={(v) =>
                                    updateCondition(q.id, c.id, { when: v as any })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="fail">Fail</SelectItem>
                                    <SelectItem value="advisory">Advisory</SelectItem>
                                    <SelectItem value="pass">Pass</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : q.type === 'checkbox' ? (
                                <Select
                                  value={c.when}
                                  onValueChange={(v) =>
                                    updateCondition(q.id, c.id, { when: v as any })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="checked">Ticked</SelectItem>
                                    <SelectItem value="unchecked">Unticked</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <>
                                  <Select
                                    value={c.comparator ?? 'lt'}
                                    onValueChange={(v) =>
                                      updateCondition(q.id, c.id, { comparator: v as any })
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="lt">less than</SelectItem>
                                      <SelectItem value="lte">at most</SelectItem>
                                      <SelectItem value="gt">greater than</SelectItem>
                                      <SelectItem value="gte">at least</SelectItem>
                                      <SelectItem value="eq">equal to</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    className="h-8 w-24"
                                    value={c.threshold ?? 0}
                                    onChange={(e) =>
                                      updateCondition(q.id, c.id, {
                                        threshold: Number(e.target.value),
                                      })
                                    }
                                  />
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-auto size-7"
                                onClick={() => removeCondition(q.id, c.id)}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 pl-6 text-xs">
                              <label className="flex items-center gap-1">
                                <Checkbox
                                  checked={!!c.requirePhoto}
                                  onCheckedChange={(v) =>
                                    updateCondition(q.id, c.id, { requirePhoto: v === true })
                                  }
                                />
                                Require photo
                              </label>
                              <label className="flex items-center gap-1">
                                <Checkbox
                                  checked={!!c.requireNote}
                                  onCheckedChange={(v) =>
                                    updateCondition(q.id, c.id, { requireNote: v === true })
                                  }
                                />
                                Require note
                              </label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => addFollowUp(q.id, c.id)}
                              >
                                <Plus className="size-3" />
                                Follow-up question
                              </Button>
                            </div>
                            <ConditionNotifyPicker
                              users={users}
                              selected={c.notifyUserIds ?? []}
                              onChange={(ids) =>
                                updateCondition(q.id, c.id, { notifyUserIds: ids })
                              }
                            />
                            {(c.items ?? []).map((f) => (
                              <div key={f.id} className="mt-2 flex items-center gap-2 pl-6">
                                <CornerDownRight className="size-3.5 text-muted-foreground" />
                                <Input
                                  className="h-8"
                                  value={f.label}
                                  onChange={(e) =>
                                    updateFollowUp(q.id, c.id, f.id, { label: e.target.value })
                                  }
                                  placeholder="Follow-up label"
                                />
                                <Select
                                  value={f.type}
                                  onValueChange={(v) =>
                                    updateFollowUp(q.id, c.id, f.id, {
                                      type: v as ChecklistItem['type'],
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ITEM_TYPES.map((t) => (
                                      <SelectItem key={t.value} value={t.value}>
                                        {t.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => removeFollowUp(q.id, c.id, f.id)}
                                >
                                  <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => addCondition(q.id)}
                        >
                          <Plus className="size-3.5" />
                          Add rule
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Applies to */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-medium">Applies to</h3>
            <label className="mb-3 flex items-center gap-2">
              <Switch
                checked={draft.applies_to_all}
                onCheckedChange={(v) => patch({ applies_to_all: v })}
              />
              <span className="text-sm">Everyone</span>
            </label>
            {!draft.applies_to_all ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Roles</p>
                  <div className="flex flex-col gap-1">
                    {roles.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.role_names.includes(r.name)}
                          onCheckedChange={() =>
                            patch({ role_names: toggleArray(draft.role_names, r.name) })
                          }
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Departments
                  </p>
                  <div className="flex flex-col gap-1">
                    {departments.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.department_ids.includes(d.id)}
                          onCheckedChange={() =>
                            patch({
                              department_ids: toggleArray(draft.department_ids, d.id),
                            })
                          }
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Individuals
                  </p>
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.user_ids.includes(u.id)}
                          onCheckedChange={() =>
                            patch({ user_ids: toggleArray(draft.user_ids, u.id) })
                          }
                        />
                        {u.full_name ?? 'Unnamed'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Notify on issue */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <BellRing className="size-4" />
              Notify if failure/issue
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              When a completed task has any Fail or Advisory answer, alert the
              nominated user(s) in-app and email a nominated address.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Notify users
                </p>
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.notify_on_issue_user_ids.includes(u.id)}
                        onCheckedChange={() =>
                          patch({
                            notify_on_issue_user_ids: toggleArray(
                              draft.notify_on_issue_user_ids,
                              u.id,
                            ),
                          })
                        }
                      />
                      {u.full_name ?? 'Unnamed'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="it-notify-email">Notify email address</Label>
                <Input
                  id="it-notify-email"
                  type="email"
                  value={draft.notify_on_issue_email ?? ''}
                  onChange={(e) =>
                    patch({ notify_on_issue_email: e.target.value || null })
                  }
                  placeholder="quality@pyrocel.co.uk"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional. Leave blank to only notify users in-app.
                </p>
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Editor for a display/content block: section heading, document link, external
// URL link, or a fillable table (author defines columns). These carry no answer
// and no conditional rules.
function BlockEditor({
  block,
  documents,
  onChange,
  onRemove,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
}: {
  block: InternalTaskItem
  documents: { id: string; name: string }[]
  onChange: (updates: Partial<InternalTaskItem>) => void
  onRemove: () => void
  onAddColumn: () => void
  onUpdateColumn: (colId: string, updates: Partial<InternalTaskTableColumn>) => void
  onRemoveColumn: (colId: string) => void
}) {
  const meta =
    block.type === 'section'
      ? { icon: Heading, label: 'Section heading' }
      : block.type === 'doc_link'
        ? { icon: FileText, label: 'Document link' }
        : block.type === 'url_link'
          ? { icon: Link2, label: 'External link' }
          : { icon: TableIcon, label: 'Fillable table' }
  const Icon = meta.icon

  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {meta.label}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRemove}>
          <Trash2 className="size-4 text-destructive" />
          <span className="sr-only">Remove block</span>
        </Button>
      </div>

      {block.type === 'section' && (
        <div className="space-y-2">
          <Input
            value={block.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Section title (e.g. Expense details)"
          />
          <Textarea
            value={block.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Optional supporting text shown under the heading"
            rows={2}
          />
        </div>
      )}

      {block.type === 'doc_link' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Document</Label>
            <Select
              value={block.documentId ?? ''}
              onValueChange={(v) =>
                onChange({
                  documentId: v,
                  documentName: documents.find((d) => d.id === v)?.name ?? null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a document" />
              </SelectTrigger>
              <SelectContent>
                {documents.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No reference documents uploaded yet.
                  </div>
                ) : (
                  documents.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Link label (optional)</Label>
            <Input
              value={block.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder={block.documentName ?? 'Shown to the user'}
            />
          </div>
        </div>
      )}

      {block.type === 'url_link' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Link label</Label>
            <Input
              value={block.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="e.g. Expenses policy"
            />
          </div>
          <div>
            <Label className="text-xs">URL</Label>
            <Input
              type="url"
              value={block.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </div>
      )}

      {block.type === 'table' && (
        <div className="space-y-2">
          <Input
            value={block.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Table title (e.g. Line items)"
          />
          <div className="rounded-md border p-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Columns — the user adds rows when completing the task
            </p>
            <div className="flex flex-col gap-1.5">
              {(block.columns ?? []).map((col) => (
                <div key={col.id} className="flex items-center gap-2">
                  <Input
                    className="h-8"
                    value={col.label}
                    onChange={(e) => onUpdateColumn(col.id, { label: e.target.value })}
                    placeholder="Column name"
                  />
                  <Select
                    value={col.type}
                    onValueChange={(v) =>
                      onUpdateColumn(col.id, {
                        type: v as InternalTaskTableColumn['type'],
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => onRemoveColumn(col.id)}
                    disabled={(block.columns ?? []).length <= 1}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-2 h-7" onClick={onAddColumn}>
              <Plus className="size-3.5" />
              Add column
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={block.required === true}
              onCheckedChange={(v) => onChange({ required: v === true })}
            />
            Require at least one row
          </label>
        </div>
      )}
    </div>
  )
}

// Compact multi-select of users to notify when a condition fires on submit.
// Collapsed by default so the condition editor stays tidy.
function ConditionNotifyPicker({
  users,
  selected,
  onChange,
}: {
  users: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }
  return (
    <details className="mt-2 pl-6 text-xs">
      <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground">
        <BellRing className="size-3.5" />
        Notify users when triggered
        {selected.length > 0 ? (
          <Badge variant="secondary" className="ml-1">
            {selected.length}
          </Badge>
        ) : null}
      </summary>
      <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
        {users.length === 0 ? (
          <span className="text-muted-foreground">No users available.</span>
        ) : (
          users.map((u) => (
            <label key={u.id} className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(u.id)}
                onCheckedChange={() => toggle(u.id)}
              />
              {u.full_name ?? 'Unnamed'}
            </label>
          ))
        )}
      </div>
    </details>
  )
}

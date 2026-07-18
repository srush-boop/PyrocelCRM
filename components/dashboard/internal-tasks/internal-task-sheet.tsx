'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Camera,
  CornerDownRight,
  Loader2,
  X,
  Check,
  AlertCircle,
} from 'lucide-react'
import type {
  InternalTaskInstance,
  ChecklistItem,
  ChecklistCondition,
  ChecklistResult,
} from '@/lib/types/database'
import { submitInternalTask } from '@/lib/actions/internal-tasks'

interface Props {
  instance: InternalTaskInstance
  open: boolean
  onOpenChange: (open: boolean) => void
}

type RowPhoto = { id: string; name: string; url: string }

// A working row mirrors ChecklistResult with an optional photos list. Top-level
// rows carry their conditions; follow-up rows carry parent_item_id/condition_id.
type Row = ChecklistResult & { photos?: RowPhoto[] }

// Builds the flat working row list from the template questions: each top-level
// question, immediately followed by its conditions' follow-up questions (hidden
// until the parent's answer activates them). Rehydrates from saved answers.
function buildRows(questions: ChecklistItem[], saved: ChecklistResult[]): Row[] {
  const savedById = new Map(saved.map((r) => [r.item_id, r]))
  const rows: Row[] = []
  for (const q of questions) {
    const prev = savedById.get(q.id)
    rows.push({
      item_id: q.id,
      label: q.label,
      type: q.type,
      value: prev?.value ?? (q.type === 'checkbox' ? false : ''),
      passed: prev?.passed ?? null,
      advisory: prev?.advisory,
      na: prev?.na,
      notes: prev?.notes ?? '',
      photos: (prev as Row | undefined)?.photos ?? [],
      conditions: q.conditions,
    })
    for (const cond of q.conditions ?? []) {
      for (const child of cond.items ?? []) {
        const cprev = savedById.get(child.id)
        rows.push({
          item_id: child.id,
          label: child.label,
          type: child.type,
          value: cprev?.value ?? (child.type === 'checkbox' ? false : ''),
          passed: cprev?.passed ?? null,
          notes: cprev?.notes ?? '',
          photos: (cprev as Row | undefined)?.photos ?? [],
          parent_item_id: q.id,
          condition_id: cond.id,
          required: child.required,
        })
      }
    }
  }
  return rows
}

// Whether a condition on `row` is currently triggered by its answer.
function isConditionActive(row: Row, cond: ChecklistCondition): boolean {
  if (row.na) return false
  switch (cond.when) {
    case 'fail':
      return row.passed === false && !row.advisory
    case 'pass':
      return row.passed === true
    case 'advisory':
      return row.advisory === true
    case 'checked':
      return row.value === true
    case 'unchecked':
      return row.value === false
    case 'number': {
      const n = Number(row.value)
      if (Number.isNaN(n) || cond.threshold == null) return false
      switch (cond.comparator) {
        case 'gt':
          return n > cond.threshold
        case 'lt':
          return n < cond.threshold
        case 'gte':
          return n >= cond.threshold
        case 'lte':
          return n <= cond.threshold
        case 'eq':
          return n === cond.threshold
        default:
          return false
      }
    }
    default:
      return false
  }
}

export function InternalTaskSheet({ instance, open, onOpenChange }: Props) {
  const router = useRouter()
  const template = instance.template
  const questions = useMemo<ChecklistItem[]>(() => template?.questions ?? [], [template])
  const readOnly = instance.status === 'completed'

  const [rows, setRows] = useState<Row[]>(() => buildRows(questions, instance.answers ?? []))
  const [reference, setReference] = useState(instance.reference_number ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null)

  const update = (itemId: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.item_id === itemId ? { ...r, ...patch } : r)))
  }

  // A follow-up row is only visible when its owning condition is active.
  const isRowVisible = (row: Row): boolean => {
    if (!row.parent_item_id || !row.condition_id) return true
    const parent = rows.find((r) => r.item_id === row.parent_item_id)
    if (!parent) return false
    const cond = (parent.conditions ?? []).find((c) => c.id === row.condition_id)
    return cond ? isConditionActive(parent, cond) : false
  }

  const uploadPhoto = async (row: Row, file: File) => {
    setPhotoUploadingId(row.item_id)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('instance_id', instance.id)
      const res = await fetch('/api/internal-tasks/attachments/upload', {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error('upload failed')
      const { attachment } = await res.json()
      update(row.item_id, {
        photos: [
          ...(row.photos ?? []),
          {
            id: attachment.id as string,
            name: attachment.name as string,
            url: `/api/internal-tasks/attachments/file?id=${attachment.id}`,
          },
        ],
      })
    } catch {
      setError('Photo upload failed — please try again.')
    } finally {
      setPhotoUploadingId(null)
    }
  }

  const removePhoto = (row: Row, photoId: string) => {
    update(row.item_id, { photos: (row.photos ?? []).filter((p) => p.id !== photoId) })
  }

  // Collects unmet requirements. Empty = safe to submit.
  const blockers = useMemo<string[]>(() => {
    const out: string[] = []
    for (const row of rows) {
      // Required top-level answers.
      const q = questions.find((x) => x.id === row.item_id)
      if (q?.required && !row.na) {
        if (row.type === 'pass_fail' && row.passed == null && !row.advisory) {
          out.push(`${row.label}: choose an answer`)
        } else if (
          (row.type === 'text' || row.type === 'number') &&
          String(row.value ?? '').trim() === ''
        ) {
          out.push(`${row.label}: enter a value`)
        }
      }
      // Conditional requirements on visible top-level rows.
      if (!row.parent_item_id) {
        for (const cond of row.conditions ?? []) {
          if (!isConditionActive(row, cond)) continue
          if (cond.requireNote && !(row.notes && row.notes.trim())) {
            out.push(`${row.label}: add a note`)
          }
          if (cond.requirePhoto && !(row.photos && row.photos.length > 0)) {
            out.push(`${row.label}: attach a photo`)
          }
        }
      }
      // Required follow-up rows that are visible.
      if (row.parent_item_id && row.required && isRowVisible(row)) {
        if (row.type === 'pass_fail' && row.passed == null) {
          out.push(`${row.label}: choose an answer`)
        } else if (String(row.value ?? '').trim() === '' && row.type !== 'checkbox') {
          out.push(`${row.label}: enter a value`)
        }
      }
    }
    if (template?.requires_reference && !reference.trim()) {
      out.push(`${template.reference_label || 'Reference number'} is required`)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, reference, questions, template])

  const handleSubmit = async () => {
    setError(null)
    if (blockers.length > 0) {
      setError(blockers[0])
      return
    }
    setSaving(true)
    // Persist only visible rows (hidden follow-ups are dropped).
    const answers: ChecklistResult[] = rows
      .filter((r) => isRowVisible(r))
      .map((r) => ({
        item_id: r.item_id,
        label: r.label,
        type: r.type,
        value: r.value,
        passed: r.passed,
        advisory: r.advisory,
        na: r.na,
        notes: r.notes,
        photos: r.photos,
        conditions: r.conditions,
        parent_item_id: r.parent_item_id,
        condition_id: r.condition_id,
        required: r.required,
      })) as ChecklistResult[]

    const result = await submitInternalTask({
      instanceId: instance.id,
      answers,
      referenceNumber: template?.requires_reference ? reference : null,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error || 'Could not submit.')
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-balance">{template?.name}</SheetTitle>
          {template?.description && (
            <SheetDescription className="text-pretty">{template.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {rows.map((row) => {
            if (!isRowVisible(row)) return null
            const isFollowUp = !!row.parent_item_id
            return (
              <div
                key={row.item_id}
                className={
                  isFollowUp
                    ? 'ml-3 border-l-2 border-primary/30 pl-3'
                    : 'rounded-lg border p-3'
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <Label className="flex items-start gap-1.5 text-sm font-medium leading-snug">
                    {isFollowUp && (
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                    )}
                    <span className="text-pretty">{row.label}</span>
                  </Label>
                  {/* N/A toggle for top-level rows only. */}
                  {!isFollowUp && !readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        update(row.item_id, {
                          na: !row.na,
                          passed: null,
                          advisory: false,
                        })
                      }
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                        row.na
                          ? 'border-muted-foreground/40 bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      N/A
                    </button>
                  )}
                </div>

                {!row.na && (
                  <div className="mt-2 space-y-2">
                    {row.type === 'pass_fail' && (
                      <div className="flex flex-wrap gap-2">
                        <AnswerButton
                          active={row.passed === true && !row.advisory}
                          onClick={() => update(row.item_id, { passed: true, advisory: false })}
                          disabled={readOnly}
                          variant="pass"
                        >
                          Pass
                        </AnswerButton>
                        <AnswerButton
                          active={row.passed === false && !row.advisory}
                          onClick={() => update(row.item_id, { passed: false, advisory: false })}
                          disabled={readOnly}
                          variant="fail"
                        >
                          Fail
                        </AnswerButton>
                        <AnswerButton
                          active={row.advisory === true}
                          onClick={() =>
                            update(row.item_id, { advisory: true, passed: null })
                          }
                          disabled={readOnly}
                          variant="advisory"
                        >
                          Advisory
                        </AnswerButton>
                      </div>
                    )}

                    {row.type === 'checkbox' && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`cb-${row.item_id}`}
                          checked={row.value === true}
                          disabled={readOnly}
                          onCheckedChange={(c) => update(row.item_id, { value: c === true })}
                        />
                        <Label htmlFor={`cb-${row.item_id}`} className="text-sm">
                          Yes
                        </Label>
                      </div>
                    )}

                    {row.type === 'text' && (
                      <Textarea
                        value={String(row.value ?? '')}
                        disabled={readOnly}
                        onChange={(e) => update(row.item_id, { value: e.target.value })}
                        placeholder="Type your answer"
                        rows={2}
                      />
                    )}

                    {row.type === 'number' && (
                      <Input
                        type="number"
                        value={String(row.value ?? '')}
                        disabled={readOnly}
                        onChange={(e) => update(row.item_id, { value: e.target.value })}
                        placeholder="Enter a number"
                        className="max-w-[160px]"
                      />
                    )}

                    {/* Notes + photos for top-level rows with an active condition
                        requiring them, or always available as optional notes. */}
                    {!isFollowUp && <RowExtras row={row} update={update} />}

                    {/* Photo capture (top-level rows). */}
                    {!isFollowUp && !readOnly && (
                      <div className="space-y-2">
                        {(row.photos ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(row.photos ?? []).map((p) => (
                              <div key={p.id} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.url || '/placeholder.svg'}
                                  alt={p.name}
                                  className="h-16 w-16 rounded-md border object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePhoto(row, p.id)}
                                  className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                                  aria-label="Remove photo"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                          {photoUploadingId === row.item_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Camera className="h-3.5 w-3.5" />
                          )}
                          Add photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={photoUploadingId === row.item_id}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) uploadPhoto(row, f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {/* Read-only photo display. */}
                    {readOnly && (row.photos ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(row.photos ?? []).map((p) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={p.id}
                            src={p.url || '/placeholder.svg'}
                            alt={p.name}
                            className="h-16 w-16 rounded-md border object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {template?.requires_reference && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <Label htmlFor="reference">
                {template.reference_label || 'Reference number'}
              </Label>
              <Input
                id="reference"
                value={reference}
                disabled={readOnly}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter reference"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {readOnly ? (
            <Badge className="bg-green-600 text-white hover:bg-green-600/90">
              <Check className="mr-1 h-3.5 w-3.5" />
              Completed
            </Badge>
          ) : (
            <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-4">
              {blockers.length > 0 && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {blockers.length} item{blockers.length === 1 ? '' : 's'} still need
                  {blockers.length === 1 ? 's' : ''} attention.
                </p>
              )}
              <Button onClick={handleSubmit} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Complete task'
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Optional note field, always available on top-level rows.
function RowExtras({
  row,
  update,
}: {
  row: Row
  update: (itemId: string, patch: Partial<Row>) => void
}) {
  return (
    <Textarea
      value={row.notes ?? ''}
      onChange={(e) => update(row.item_id, { notes: e.target.value })}
      placeholder="Notes (optional)"
      rows={2}
      className="text-sm"
    />
  )
}

function AnswerButton({
  children,
  active,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  disabled?: boolean
  variant: 'pass' | 'fail' | 'advisory'
}) {
  const activeCls =
    variant === 'pass'
      ? 'bg-green-600 text-white border-green-600'
      : variant === 'fail'
        ? 'bg-destructive text-destructive-foreground border-destructive'
        : 'bg-amber-500 text-white border-amber-500'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        active ? activeCls : 'border-input bg-background hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

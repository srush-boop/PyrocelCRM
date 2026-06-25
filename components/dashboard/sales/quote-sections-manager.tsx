'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsDownUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchQuoteSections,
  saveQuoteSection,
  deleteQuoteSection,
  reorderQuoteSections,
  saveQuoteSectionElement,
  deleteQuoteSectionElement,
  reorderQuoteSectionElements,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { WORK_TYPES, workTypeLabel } from '@/lib/sales'
import type {
  SystemType,
  QuoteSection,
  QuoteSectionElement,
  QuoteElementType,
  QuoteTableColumn,
} from '@/lib/types/database'

const ELEMENT_TYPES: { value: QuoteElementType; label: string; help: string }[] = [
  { value: 'text', label: 'Text box', help: 'Single line of text' },
  { value: 'paragraph', label: 'Paragraph', help: 'Multi-line text area' },
  { value: 'select', label: 'Dropdown', help: 'Choose one from a list' },
  { value: 'yesno', label: 'Yes / No / N/A', help: 'N/A omits it from the quote' },
  { value: 'number', label: 'Number', help: 'Numeric value' },
  { value: 'price', label: 'Price', help: 'Currency amount' },
  { value: 'table', label: 'Table', help: 'Repeatable rows with columns' },
  { value: 'asset_type', label: 'Asset type', help: 'Pick from configured asset types' },
  {
    value: 'design_category',
    label: 'Design category',
    help: 'Pick from configured design categories',
  },
  {
    value: 'spec_template',
    label: 'Specification',
    help: 'Long text, importable from the matching spec template',
  },
]

function elementTypeLabel(t: QuoteElementType): string {
  return ELEMENT_TYPES.find((e) => e.value === t)?.label ?? t
}

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function QuoteSectionsManager({ systemTypes }: { systemTypes: SystemType[] }) {
  const [isPending, startTransition] = useTransition()

  const [systemTypeId, setSystemTypeId] = useState<string>(systemTypes[0]?.id ?? '')
  const [workType, setWorkType] = useState<string>(WORK_TYPES[0].code)

  const [sections, setSections] = useState<QuoteSection[]>([])
  const [loading, setLoading] = useState(false)

  // Load sections whenever the system type / work type combo changes.
  useEffect(() => {
    if (!systemTypeId || !workType) {
      setSections([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetchQuoteSections(systemTypeId, workType).then((data) => {
      if (!cancelled) {
        setSections(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [systemTypeId, workType])

  function reload() {
    fetchQuoteSections(systemTypeId, workType).then(setSections)
  }

  // All element keys in this combo, used to build the condition dropdown.
  const allElements = sections.flatMap((s) => s.elements ?? [])

  return (
    <div className="space-y-6">
      {/* Combo selector */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cfg-system-type">System type</Label>
            <Select value={systemTypeId} onValueChange={setSystemTypeId}>
              <SelectTrigger id="cfg-system-type">
                <SelectValue placeholder="Select a system type" />
              </SelectTrigger>
              <SelectContent>
                {systemTypes.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cfg-work-type">Type of work</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger id="cfg-work-type">
                <SelectValue placeholder="Select a type of work" />
              </SelectTrigger>
              <SelectContent>
                {WORK_TYPES.map((wt) => (
                  <SelectItem key={wt.code} value={wt.code}>
                    {wt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sections list */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Sections for {systemTypes.find((s) => s.id === systemTypeId)?.name ?? '—'} ·{' '}
          {workTypeLabel(workType)}
        </h2>
        <AddSectionButton
          systemTypeId={systemTypeId}
          workType={workType}
          position={sections.length}
          elements={allElements}
          disabled={!systemTypeId || isPending}
          onSaved={reload}
        />
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading sections…</p>
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <LayoutEmptyIcon />
            <p className="font-medium">No sections configured yet</p>
            <p className="max-w-md text-sm text-muted-foreground text-pretty">
              Add a section to start building the quote form for this system type and type of work.
              If none are configured, the quote builder falls back to the default fields.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              index={index}
              total={sections.length}
              sections={sections}
              allElements={allElements}
              isPending={isPending}
              startTransition={startTransition}
              onChanged={reload}
              setSections={setSections}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LayoutEmptyIcon() {
  return <ChevronsDownUp className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
}

/* ------------------------------ Section card ------------------------------ */

function SectionCard({
  section,
  index,
  total,
  sections,
  allElements,
  isPending,
  startTransition,
  onChanged,
  setSections,
}: {
  section: QuoteSection
  index: number
  total: number
  sections: QuoteSection[]
  allElements: QuoteSectionElement[]
  isPending: boolean
  startTransition: (cb: () => void) => void
  onChanged: () => void
  setSections: (s: QuoteSection[]) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [elementOpen, setElementOpen] = useState(false)
  const [editingElement, setEditingElement] = useState<QuoteSectionElement | null>(null)
  const [deleteElementId, setDeleteElementId] = useState<string | null>(null)

  function move(direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= total) return
    const reordered = [...sections]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(target, 0, removed)
    setSections(reordered) // optimistic
    startTransition(async () => {
      const res = await reorderQuoteSections(reordered.map((s) => s.id))
      if (!res.ok) toast.error(res.error ?? 'Could not reorder')
    })
  }

  // Reorder elements within this section (optimistic, then persist).
  function moveElement(elIndex: number, direction: -1 | 1) {
    const current = section.elements ?? []
    const target = elIndex + direction
    if (target < 0 || target >= current.length) return
    const reorderedEls = [...current]
    const [removed] = reorderedEls.splice(elIndex, 1)
    reorderedEls.splice(target, 0, removed)
    // Optimistically update this section's elements in the parent list.
    setSections(
      sections.map((s) => (s.id === section.id ? { ...s, elements: reorderedEls } : s)),
    )
    startTransition(async () => {
      const res = await reorderQuoteSectionElements(reorderedEls.map((e) => e.id))
      if (!res.ok) toast.error(res.error ?? 'Could not reorder elements')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteQuoteSection(section.id)
      if (res.ok) {
        toast.success('Section deleted')
        setDeleteOpen(false)
        onChanged()
      } else {
        toast.error(res.error ?? 'Could not delete section')
      }
    })
  }

  function handleDeleteElement(id: string) {
    startTransition(async () => {
      const res = await deleteQuoteSectionElement(id)
      if (res.ok) {
        toast.success('Element deleted')
        setDeleteElementId(null)
        onChanged()
      } else {
        toast.error(res.error ?? 'Could not delete element')
      }
    })
  }

  const conditionElement = section.condition_element_key
    ? allElements.find((e) => e.element_key === section.condition_element_key)
    : null

  const elements = section.elements ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={index === 0 || isPending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move section up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={index === total - 1 || isPending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move section down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {elements.length} {elements.length === 1 ? 'element' : 'elements'}
              </Badge>
              {section.default_collapsed && <Badge variant="outline">Starts collapsed</Badge>}
              {conditionElement && (
                <Badge variant="outline">
                  Shows when {conditionElement.label} = {section.condition_value}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label="Edit section">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete section"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {elements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No elements yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {elements.map((el, elIndex) => (
              <li key={el.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveElement(elIndex, -1)}
                      disabled={elIndex === 0 || isPending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move element up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveElement(elIndex, 1)}
                      disabled={elIndex === elements.length - 1 || isPending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move element down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-medium">{el.label}</span>
                  {el.required && <Badge variant="outline">Required</Badge>}
                  <Badge variant="secondary">{elementTypeLabel(el.element_type)}</Badge>
                  <code className="text-xs text-muted-foreground">{el.element_key}</code>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingElement(el)
                      setElementOpen(true)
                    }}
                    aria-label="Edit element"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteElementId(el.id)}
                    aria-label="Delete element"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingElement(null)
            setElementOpen(true)
          }}
          disabled={isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add element
        </Button>
      </CardContent>

      {/* Edit section dialog */}
      <SectionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        systemTypeId={section.system_type_id}
        workType={section.work_type}
        position={section.position}
        elements={allElements}
        existing={section}
        onSaved={onChanged}
      />

      {/* Element dialog */}
      <ElementDialog
        open={elementOpen}
        onOpenChange={setElementOpen}
        sectionId={section.id}
        position={editingElement ? editingElement.position : elements.length}
        existing={editingElement}
        onSaved={onChanged}
      />

      {/* Delete section confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this section?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the section and all its elements from this combination. Existing quotes
              keep any answers already saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete element confirm */}
      <AlertDialog
        open={deleteElementId !== null}
        onOpenChange={(o) => !o && setDeleteElementId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this element?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteElementId && handleDeleteElement(deleteElementId)}
              disabled={isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/* ----------------------------- Add section btn ---------------------------- */

function AddSectionButton({
  systemTypeId,
  workType,
  position,
  elements,
  disabled,
  onSaved,
}: {
  systemTypeId: string
  workType: string
  position: number
  elements: QuoteSectionElement[]
  disabled: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        Add section
      </Button>
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        systemTypeId={systemTypeId}
        workType={workType}
        position={position}
        elements={elements}
        existing={null}
        onSaved={onSaved}
      />
    </>
  )
}

/* ----------------------------- Section dialog ----------------------------- */

function SectionDialog({
  open,
  onOpenChange,
  systemTypeId,
  workType,
  position,
  elements,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  systemTypeId: string
  workType: string
  position: number
  elements: QuoteSectionElement[]
  existing: QuoteSection | null
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [conditionKey, setConditionKey] = useState<string>('')
  const [conditionValue, setConditionValue] = useState<string>('')

  useEffect(() => {
    if (open) {
      setTitle(existing?.title ?? '')
      setCollapsed(existing?.default_collapsed ?? false)
      setConditionKey(existing?.condition_element_key ?? '')
      setConditionValue(existing?.condition_value ?? '')
    }
  }, [open, existing])

  // Candidate condition elements: anything except the section's own elements is
  // fine; we exclude table elements (no single value to compare).
  const candidates = elements.filter(
    (e) => e.element_type !== 'table' && e.element_type !== 'paragraph',
  )
  const selectedCandidate = candidates.find((e) => e.element_key === conditionKey)

  function handleSave() {
    if (!title.trim()) {
      toast.error('A section title is required')
      return
    }
    startTransition(async () => {
      const res = await saveQuoteSection({
        id: existing?.id,
        system_type_id: systemTypeId,
        work_type: workType,
        title,
        position: existing?.position ?? position,
        default_collapsed: collapsed,
        condition_element_key: conditionKey || null,
        condition_value: conditionKey ? conditionValue || null : null,
      })
      if (res.ok) {
        toast.success(existing ? 'Section updated' : 'Section added')
        onOpenChange(false)
        onSaved()
      } else {
        toast.error(res.error ?? 'Could not save section')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit section' : 'Add section'}</DialogTitle>
          <DialogDescription>
            Sections group the fields shown on a quote. You can reorder them and set whether they
            start collapsed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="section-title">Section title</Label>
            <Input
              id="section-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Survey & Design"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Start collapsed</p>
              <p className="text-xs text-muted-foreground">
                The section is collapsed by default when building a quote.
              </p>
            </div>
            <Switch checked={collapsed} onCheckedChange={setCollapsed} aria-label="Start collapsed" />
          </div>

          <div className="grid gap-2 rounded-md border p-3">
            <Label>Conditional display (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Only show this section when another field has a specific value. Leave as
              &quot;Always show&quot; to show it every time.
            </p>
            <Select
              value={conditionKey || 'none'}
              onValueChange={(v) => {
                setConditionKey(v === 'none' ? '' : v)
                setConditionValue('')
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Always show</SelectItem>
                {candidates.map((e) => (
                  <SelectItem key={e.id} value={e.element_key}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCandidate && (
              <div className="grid gap-2">
                <Label htmlFor="condition-value">Show when value is</Label>
                {selectedCandidate.element_type === 'yesno' ? (
                  <Select value={conditionValue} onValueChange={setConditionValue}>
                    <SelectTrigger id="condition-value">
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : selectedCandidate.element_type === 'select' ? (
                  <Select value={conditionValue} onValueChange={setConditionValue}>
                    <SelectTrigger id="condition-value">
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedCandidate.options as string[]).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="condition-value"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder="Value to match"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {existing ? 'Save changes' : 'Add section'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------- Element dialog ----------------------------- */

function ElementDialog({
  open,
  onOpenChange,
  sectionId,
  position,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sectionId: string
  position: number
  existing: QuoteSectionElement | null
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const [elementKey, setElementKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [elementType, setElementType] = useState<QuoteElementType>('text')
  const [required, setRequired] = useState(false)
  const [optionsText, setOptionsText] = useState('')

  useEffect(() => {
    if (open) {
      setLabel(existing?.label ?? '')
      setElementKey(existing?.element_key ?? '')
      setKeyEdited(Boolean(existing))
      setElementType(existing?.element_type ?? 'text')
      setRequired(existing?.required ?? false)
      if (existing && existing.element_type === 'table') {
        setOptionsText(
          (existing.options as QuoteTableColumn[]).map((c) => c.label).join('\n'),
        )
      } else {
        setOptionsText(((existing?.options as string[]) ?? []).join('\n'))
      }
    }
  }, [open, existing])

  function handleLabelChange(value: string) {
    setLabel(value)
    if (!keyEdited && !existing) setElementKey(slugifyKey(value))
  }

  const needsOptions = elementType === 'select'
  const needsColumns = elementType === 'table'

  function handleSave() {
    if (!label.trim()) {
      toast.error('A label is required')
      return
    }
    if (!elementKey.trim()) {
      toast.error('A key is required')
      return
    }
    let options: string[] | QuoteTableColumn[] = []
    if (needsOptions) {
      options = optionsText
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean)
      if (options.length === 0) {
        toast.error('Add at least one dropdown option')
        return
      }
    } else if (needsColumns) {
      const cols = optionsText
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean)
      if (cols.length === 0) {
        toast.error('Add at least one column')
        return
      }
      options = cols.map((label) => ({ key: slugifyKey(label), label }))
    }

    startTransition(async () => {
      const res = await saveQuoteSectionElement({
        id: existing?.id,
        section_id: sectionId,
        label,
        element_key: elementKey,
        element_type: elementType,
        options,
        required,
        position: existing?.position ?? position,
      })
      if (res.ok) {
        toast.success(existing ? 'Element updated' : 'Element added')
        onOpenChange(false)
        onSaved()
      } else {
        toast.error(res.error ?? 'Could not save element')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit element' : 'Add element'}</DialogTitle>
          <DialogDescription>
            Elements are the individual fields shown inside this section on a quote.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="element-label">Label</Label>
            <Input
              id="element-label"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Cable type"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="element-type">Element type</Label>
            <Select
              value={elementType}
              onValueChange={(v) => setElementType(v as QuoteElementType)}
            >
              <SelectTrigger id="element-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ELEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} — {t.help}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(needsOptions || needsColumns) && (
            <div className="grid gap-2">
              <Label htmlFor="element-options">
                {needsColumns ? 'Columns (one per line)' : 'Options (one per line)'}
              </Label>
              <Textarea
                id="element-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                placeholder={needsColumns ? 'Description\nQty\nUnit price' : 'Option A\nOption B'}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="element-key">Key</Label>
            <Input
              id="element-key"
              value={elementKey}
              onChange={(e) => {
                setElementKey(e.target.value)
                setKeyEdited(true)
              }}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Stable identifier used to store the answer. Avoid changing it after quotes exist.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Required</p>
              <p className="text-xs text-muted-foreground">Must be filled in before sending.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} aria-label="Required" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {existing ? 'Save changes' : 'Add element'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

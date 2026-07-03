'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveWorkTypeField,
  deleteWorkTypeField,
  reorderWorkTypeFields,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { cn } from '@/lib/utils'
import { WORK_TYPES } from '@/lib/sales'
import type { WorkTypeField, SystemType } from '@/lib/types/database'
import { SystemBadge, SystemIcon } from '@/lib/system-types'

type FieldType = 'text' | 'number' | 'select' | 'boolean'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'boolean', label: 'Yes / No' },
]

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function WorkTypeFieldsManager({
  fields,
  systemTypes,
}: {
  fields: WorkTypeField[]
  systemTypes: SystemType[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WorkTypeField | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // Which system type sections are expanded. Default: all collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [systemTypeId, setSystemTypeId] = useState<string>(systemTypes[0]?.id ?? '')
  const [workType, setWorkType] = useState<string>(WORK_TYPES[0].code)
  const [label, setLabel] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [optionsText, setOptionsText] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)

  function openNew() {
    setEditing(null)
    setSystemTypeId(systemTypes[0]?.id ?? '')
    setWorkType(WORK_TYPES[0].code)
    setLabel('')
    setFieldKey('')
    setFieldType('text')
    setOptionsText('')
    setKeyEdited(false)
    setOpen(true)
  }

  function openEdit(f: WorkTypeField) {
    setEditing(f)
    setSystemTypeId(f.system_type_id)
    setWorkType(f.work_type)
    setLabel(f.label)
    setFieldKey(f.field_key)
    setFieldType(f.field_type)
    setOptionsText((f.options ?? []).join('\n'))
    setKeyEdited(true)
    setOpen(true)
  }

  function handleLabelChange(value: string) {
    setLabel(value)
    if (!keyEdited && !editing) setFieldKey(slugifyKey(value))
  }

  function handleSave() {
    if (!systemTypeId) {
      toast.error('Select a system type')
      return
    }
    if (!label.trim() || !fieldKey.trim()) {
      toast.error('Label and key are required')
      return
    }
    const options =
      fieldType === 'select'
        ? optionsText
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean)
        : []
    if (fieldType === 'select' && options.length === 0) {
      toast.error('Add at least one option for a dropdown field')
      return
    }
    const position =
      editing?.position ??
      fields.filter((f) => f.work_type === workType && f.system_type_id === systemTypeId).length
    startTransition(async () => {
      const res = await saveWorkTypeField({
        id: editing?.id,
        work_type: workType,
        system_type_id: systemTypeId,
        label: label.trim(),
        field_key: slugifyKey(fieldKey),
        field_type: fieldType,
        options,
        position,
      })
      if (res.ok) {
        toast.success(editing ? 'Field updated' : 'Field added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save field')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteWorkTypeField(deleteId)
      if (res.ok) {
        toast.success('Field deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete field')
      }
    })
  }

  // Move a field up or down within its system type x work type group, then
  // persist the new order of that group only.
  function handleMove(groupItems: WorkTypeField[], index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= groupItems.length) return
    const reordered = [...groupItems]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    startTransition(async () => {
      const res = await reorderWorkTypeFields(reordered.map((f) => f.id))
      if (res.ok) {
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not reorder fields')
      }
    })
  }

  // Group fields by system type, then by work type within each.
  const bySystemType = systemTypes
    .map((st) => ({
      systemType: st,
      groups: WORK_TYPES.map((w) => ({
        def: w,
        items: fields.filter((f) => f.system_type_id === st.id && f.work_type === w.code),
      })).filter((g) => g.items.length > 0),
    }))
    .filter((s) => s.groups.length > 0)

  const allExpanded =
    bySystemType.length > 0 && bySystemType.every((sys) => expanded[sys.systemType.id])

  function toggleAll() {
    if (allExpanded) {
      setExpanded({})
    } else {
      setExpanded(Object.fromEntries(bySystemType.map((sys) => [sys.systemType.id, true])))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {bySystemType.length > 0 && (
          <Button variant="outline" onClick={toggleAll}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        )}
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
      </div>

      {bySystemType.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No conditional fields yet. Pick a system type and work type, then add fields such as
            cable type for a Fire Alarm install.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {bySystemType.map((sys) => {
            const fieldCount = sys.groups.reduce((n, g) => n + g.items.length, 0)
            const isOpen = !!expanded[sys.systemType.id]
            return (
            <Collapsible
              key={sys.systemType.id}
              open={isOpen}
              onOpenChange={(o) =>
                setExpanded((prev) => ({ ...prev, [sys.systemType.id]: o }))
              }
              className="space-y-3"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md text-lg font-semibold tracking-tight"
                >
                  <ChevronRight
                    className={cn(
                      'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-90',
                    )}
                  />
                  <SystemIcon system={sys.systemType} />
                  {sys.systemType.name}
                  {sys.systemType.code && <SystemBadge system={sys.systemType} codeOnly />}
                  <Badge variant="secondary" className="ml-1 font-normal">
                    {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <div className="grid gap-4">
                {sys.groups.map((group) => (
                  <Card key={group.def.code}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Badge variant="outline" className="font-mono">
                          {group.def.code}
                        </Badge>
                        {group.def.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {group.items.map((f, index) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex shrink-0 flex-col">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-6"
                                disabled={isPending || index === 0}
                                onClick={() => handleMove(group.items, index, -1)}
                              >
                                <ChevronUp className="h-4 w-4" />
                                <span className="sr-only">Move up</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-6"
                                disabled={isPending || index === group.items.length - 1}
                                onClick={() => handleMove(group.items, index, 1)}
                              >
                                <ChevronDown className="h-4 w-4" />
                                <span className="sr-only">Move down</span>
                              </Button>
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium">{f.label}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-mono">{f.field_key}</span> ·{' '}
                                {FIELD_TYPES.find((t) => t.value === f.field_type)?.label}
                                {f.field_type === 'select' && f.options.length > 0
                                  ? ` · ${f.options.join(', ')}`
                                  : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(f.id)}>
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              </CollapsibleContent>
            </Collapsible>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit field' : 'Add field'}</DialogTitle>
            <DialogDescription>
              This input appears on a system when its system type and work type both match.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>System type</Label>
              <Select value={systemTypeId} onValueChange={setSystemTypeId}>
                <SelectTrigger>
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
              <Label>Type of work</Label>
              <Select value={workType} onValueChange={setWorkType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map((w) => (
                    <SelectItem key={w.code} value={w.code}>
                      {w.code} — {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-label">Label *</Label>
              <Input
                id="f-label"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="e.g. Cable type"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-key">Key *</Label>
              <Input
                id="f-key"
                value={fieldKey}
                onChange={(e) => {
                  setKeyEdited(true)
                  setFieldKey(e.target.value)
                }}
                placeholder="cable_type"
                disabled={!!editing}
              />
              <p className="text-xs text-muted-foreground">
                Stable identifier used to store answers. {editing ? 'Cannot be changed.' : ''}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Field type</Label>
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldType === 'select' && (
              <div className="grid gap-2">
                <Label htmlFor="f-options">Options (one per line)</Label>
                <textarea
                  id="f-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={'FP200\nMICC\nSWA'}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this field?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing quotes keep any answers already captured.
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
    </div>
  )
}

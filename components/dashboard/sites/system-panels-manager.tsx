'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Plus, Pencil, Trash2, Cpu } from 'lucide-react'
import { toast } from 'sonner'
import { savePanel, deletePanel } from '@/lib/actions/panels'
import { orderedActiveDefs, panelSummaryLine } from '@/lib/panels'
import type { PanelFieldDef, SystemPanel } from '@/lib/types/database'

type FieldValue = string | number | boolean | null

export function SystemPanelsManager({
  siteSystemId,
  panels,
  fieldDefs,
  sitePath,
  disabled = false,
}: {
  siteSystemId: string
  panels: SystemPanel[]
  fieldDefs: PanelFieldDef[]
  sitePath: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SystemPanel | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [values, setValues] = useState<Record<string, FieldValue>>({})

  const defs = orderedActiveDefs(fieldDefs)
  const systemPanels = [...panels].sort((a, b) => a.position - b.position)

  function openNew() {
    setEditing(null)
    setName(`Panel ${systemPanels.length + 1}`)
    // Seed defaults: booleans false, everything else empty.
    const initial: Record<string, FieldValue> = {}
    for (const d of defs) initial[d.field_key] = d.field_type === 'boolean' ? false : ''
    setValues(initial)
    setOpen(true)
  }

  function openEdit(panel: SystemPanel) {
    setEditing(panel)
    setName(panel.name)
    const initial: Record<string, FieldValue> = {}
    for (const d of defs) {
      const existing = panel.field_values?.[d.field_key]
      initial[d.field_key] =
        existing !== undefined ? existing : d.field_type === 'boolean' ? false : ''
    }
    setValues(initial)
    setOpen(true)
  }

  function setValue(key: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('A panel name is required')
      return
    }
    // Enforce required fields.
    for (const d of defs) {
      if (!d.required) continue
      const v = values[d.field_key]
      if (d.field_type === 'boolean') continue
      if (v === null || v === undefined || String(v).trim() === '') {
        toast.error(`${d.label} is required`)
        return
      }
    }
    // Coerce number fields.
    const cleaned: Record<string, FieldValue> = {}
    for (const d of defs) {
      const v = values[d.field_key]
      if (d.field_type === 'number') {
        cleaned[d.field_key] = v === '' || v === null || v === undefined ? null : Number(v)
      } else {
        cleaned[d.field_key] = v ?? (d.field_type === 'boolean' ? false : '')
      }
    }
    startTransition(async () => {
      const res = await savePanel({
        id: editing?.id,
        site_system_id: siteSystemId,
        name: name.trim(),
        field_values: cleaned,
        sitePath,
      })
      if (res.ok) {
        toast.success(editing ? 'Panel updated' : 'Panel added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save panel')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deletePanel(deleteId, sitePath)
      if (res.ok) {
        toast.success('Panel deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete panel')
      }
    })
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          Panels
          <span className="text-muted-foreground">({systemPanels.length})</span>
        </span>
        <Button variant="outline" size="sm" onClick={openNew} disabled={disabled}>
          <Plus className="h-4 w-4" />
          Add panel
        </Button>
      </div>

      {systemPanels.length > 0 && (
        <ul className="divide-y rounded-md border">
          {systemPanels.map((panel) => {
            const summary = panelSummaryLine(panel, defs)
            return (
              <li key={panel.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{panel.name}</div>
                  {summary && (
                    <div className="truncate text-xs text-muted-foreground">{summary}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(panel)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit panel</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(panel.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete panel</span>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit panel' : 'Add panel'}</DialogTitle>
            <DialogDescription>Record the details for this panel.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="panel-name">Panel name *</Label>
              <Input
                id="panel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Panel 1"
              />
            </div>
            {defs.map((def) => {
              const value = values[def.field_key]
              const id = `panel-field-${def.field_key}`
              if (def.field_type === 'boolean') {
                return (
                  <div
                    key={def.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <Label htmlFor={id}>
                      {def.label}
                      {def.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Switch
                      id={id}
                      checked={Boolean(value)}
                      onCheckedChange={(checked) => setValue(def.field_key, checked)}
                    />
                  </div>
                )
              }
              if (def.field_type === 'select') {
                return (
                  <div key={def.id} className="grid gap-2">
                    <Label htmlFor={id}>
                      {def.label}
                      {def.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={value ? String(value) : ''}
                      onValueChange={(v) => setValue(def.field_key, v)}
                    >
                      <SelectTrigger id={id}>
                        <SelectValue placeholder={`Select ${def.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {def.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }
              return (
                <div key={def.id} className="grid gap-2">
                  <Label htmlFor={id}>
                    {def.label}
                    {def.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id={id}
                    type={def.field_type === 'number' ? 'number' : 'text'}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => setValue(def.field_key, e.target.value)}
                  />
                </div>
              )
            })}
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
            <AlertDialogTitle>Delete this panel?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Any inspection results already recorded against this panel are
              kept in past reports.
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

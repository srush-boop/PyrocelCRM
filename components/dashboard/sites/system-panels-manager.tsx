'use client'

import { useState, useEffect, useTransition } from 'react'
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
import { Plus, Pencil, Trash2, Cpu, CalendarRange, Wand2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { savePanel, deletePanel } from '@/lib/actions/panels'
import { setPanelRotationEnabled, savePanelRotation } from '@/lib/actions/panel-rotation'
import type { PanelRotationCell } from '@/lib/actions/panel-rotation'
import { orderedActiveDefs, panelSummaryLine } from '@/lib/panels'
import type {
  PanelFieldDef,
  SystemPanel,
  ServiceVisitType,
  PanelVisitAssignment,
} from '@/lib/types/database'

type FieldValue = string | number | boolean | null

export function SystemPanelsManager({
  siteSystemId,
  panels,
  fieldDefs,
  sitePath,
  disabled = false,
  rotationEnabled = false,
  visitTypes = [],
  assignments = [],
}: {
  siteSystemId: string
  panels: SystemPanel[]
  fieldDefs: PanelFieldDef[]
  sitePath: string
  disabled?: boolean
  // Panel-level visit rotation: whether it's on for this system, the visit types
  // that form the grid columns, and any saved panel→visit assignments.
  rotationEnabled?: boolean
  visitTypes?: ServiceVisitType[]
  assignments?: PanelVisitAssignment[]
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

  // Panels are nested under each system, so collapse the list by default once
  // there are panels to keep the systems view compact; expand on click.
  const [panelsOpen, setPanelsOpen] = useState(false)

  // ── Panel-level visit rotation ───────────────────────────────────────────────
  // Rotation only makes sense with ≥2 panels and ≥2 visit occurrences (e.g. a
  // fire alarm service with Annual + Periodic). The grid is panels × visit types;
  // each cell stores which level (visit type id) that panel gets on that visit.
  const orderedVisitTypes = [...visitTypes].sort((a, b) => a.sort_order - b.sort_order)
  const rotationSupported = systemPanels.length >= 2 && orderedVisitTypes.length >= 2
  // The heavy level (Annual) is the first visit type by sort order; the rest are
  // treated as the light default when a cell isn't explicitly set.
  const heavyVisitType = orderedVisitTypes[0]
  const lightVisitType = orderedVisitTypes[1]

  const [enabled, setEnabled] = useState(rotationEnabled)
  // cells keyed by `${panelId}::${visitTypeId}` → applied visit type id.
  const [cells, setCells] = useState<Record<string, string>>({})
  const [rotationDirty, setRotationDirty] = useState(false)

  // Seed the grid from saved assignments; cells with no assignment default to the
  // light level so every panel is at least Periodic on every visit.
  useEffect(() => {
    const seeded: Record<string, string> = {}
    for (const panel of systemPanels) {
      for (const vt of orderedVisitTypes) {
        const saved = assignments.find(
          (a) => a.panel_id === panel.id && a.visit_type_id === vt.id,
        )
        seeded[`${panel.id}::${vt.id}`] =
          saved?.applied_visit_type_id ?? lightVisitType?.id ?? vt.id
      }
    }
    setCells(seeded)
    setRotationDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSystemId, panels.length, visitTypes.length, assignments.length])

  function cellLevel(panelId: string, visitTypeId: string): string {
    return cells[`${panelId}::${visitTypeId}`] ?? lightVisitType?.id ?? visitTypeId
  }

  function setCell(panelId: string, visitTypeId: string, appliedId: string) {
    setCells((prev) => ({ ...prev, [`${panelId}::${visitTypeId}`]: appliedId }))
    setRotationDirty(true)
  }

  // Auto-split: give each panel its heavy (Annual) level on exactly one visit
  // column, block-distributed by panel order across the columns; everything else
  // defaults to the light level. e.g. 6 panels / 2 visits → panels 1-3 heavy on
  // visit A, panels 4-6 heavy on visit B.
  function autoSplit() {
    if (!heavyVisitType || !lightVisitType) return
    const cols = orderedVisitTypes.length
    const perCol = Math.ceil(systemPanels.length / cols)
    const next: Record<string, string> = {}
    systemPanels.forEach((panel, idx) => {
      const heavyCol = Math.min(Math.floor(idx / perCol), cols - 1)
      orderedVisitTypes.forEach((vt, colIdx) => {
        next[`${panel.id}::${vt.id}`] =
          colIdx === heavyCol ? heavyVisitType.id : lightVisitType.id
      })
    })
    setCells(next)
    setRotationDirty(true)
  }

  function handleToggleRotation(on: boolean) {
    setEnabled(on)
    startTransition(async () => {
      const res = await setPanelRotationEnabled({
        site_system_id: siteSystemId,
        enabled: on,
        sitePath,
      })
      if (res.ok) {
        toast.success(on ? 'Panel rotation enabled' : 'Panel rotation disabled')
        router.refresh()
      } else {
        setEnabled(!on)
        toast.error(res.error ?? 'Could not update rotation')
      }
    })
  }

  function handleSaveRotation() {
    const payload: PanelRotationCell[] = []
    for (const panel of systemPanels) {
      for (const vt of orderedVisitTypes) {
        payload.push({
          panel_id: panel.id,
          visit_type_id: vt.id,
          applied_visit_type_id: cellLevel(panel.id, vt.id),
        })
      }
    }
    startTransition(async () => {
      const res = await savePanelRotation({
        site_system_id: siteSystemId,
        cells: payload,
        sitePath,
      })
      if (res.ok) {
        toast.success('Rotation saved')
        setRotationDirty(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save rotation')
      }
    })
  }

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
        <button
          type="button"
          onClick={() => setPanelsOpen((o) => !o)}
          disabled={systemPanels.length === 0}
          className="flex items-center gap-2 rounded text-sm font-medium disabled:cursor-default"
          aria-expanded={panelsOpen}
        >
          {systemPanels.length > 0 && (
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                panelsOpen ? 'rotate-90' : ''
              }`}
            />
          )}
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          Panels
          <span className="text-muted-foreground">({systemPanels.length})</span>
        </button>
        <Button variant="outline" size="sm" onClick={openNew} disabled={disabled}>
          <Plus className="h-4 w-4" />
          Add panel
        </Button>
      </div>

      {systemPanels.length > 0 && panelsOpen && (
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

      {rotationSupported && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                Spread {heavyVisitType?.name ?? 'Annual'} across visits
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                Rotate which panels get the {heavyVisitType?.name ?? 'Annual'} inspection each
                visit, so the heavy workload is shared across the year.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggleRotation}
              disabled={disabled || isPending}
              aria-label="Toggle panel rotation"
            />
          </div>

          {enabled && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoSplit}
                  disabled={disabled || isPending}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-split
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveRotation}
                  disabled={disabled || isPending || !rotationDirty}
                >
                  {isPending ? 'Saving...' : 'Save rotation'}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left font-medium">Panel</th>
                      {orderedVisitTypes.map((vt, i) => (
                        <th key={vt.id} className="p-2 text-center font-medium">
                          Visit {i + 1}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {vt.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {systemPanels.map((panel) => (
                      <tr key={panel.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{panel.name}</td>
                        {orderedVisitTypes.map((vt) => {
                          const level = cellLevel(panel.id, vt.id)
                          const isHeavy = level === heavyVisitType?.id
                          return (
                            <td key={vt.id} className="p-2 text-center">
                              <Select
                                value={level}
                                onValueChange={(v) => setCell(panel.id, vt.id, v)}
                                disabled={disabled || isPending}
                              >
                                <SelectTrigger
                                  className={
                                    isHeavy
                                      ? 'h-8 justify-center border-primary/40 bg-primary/5 text-xs font-medium'
                                      : 'h-8 justify-center text-xs'
                                  }
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {orderedVisitTypes.map((opt) => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground text-pretty">
                Each cell is the inspection level that panel receives on that visit. Highlighted
                cells are the heavier {heavyVisitType?.name ?? 'Annual'} inspection.
              </p>
            </>
          )}
        </div>
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

'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, EyeOff, Eye, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  deleteHazard,
  deleteSystemHazard,
  exportLibraryWorkbook,
  importLibraryWorkbook,
  saveHazard,
  saveMatrixText,
  saveRamsType,
  saveSystemHazard,
  setRamsTypeActive,
  type LibraryData,
  type MatrixEntry,
  type MatrixKind,
} from '@/lib/rams/library-actions'
import type { RamsHazard, RamsMasterTemplate, RamsSystemHazard } from '@/lib/rams/types'

const SCORES = [1, 2, 3, 4, 5]

function riskTone(score: number) {
  if (score >= 15) return 'bg-destructive text-destructive-foreground'
  if (score >= 8) return 'bg-amber-500 text-foreground'
  return 'bg-secondary text-secondary-foreground'
}

function RiskChip({ likelihood, severity }: { likelihood: number; severity: number }) {
  const score = likelihood * severity
  return (
    <span className={`inline-flex min-w-9 justify-center rounded px-1.5 py-0.5 text-xs font-medium ${riskTone(score)}`}>
      {score}
    </span>
  )
}

export function LibraryAdmin({ data }: { data: LibraryData }) {
  const systems = useMemo(() => data.types.filter((t) => t.template_type === 'system'), [data.types])
  const activities = useMemo(() => data.types.filter((t) => t.template_type !== 'system'), [data.types])

  return (
    <div className="flex flex-col gap-4">
      <ExcelBar />
      <Tabs defaultValue="types" className="flex flex-col gap-4">
        <TabsList className="h-auto w-fit flex-wrap">
          <TabsTrigger value="types">System &amp; activity types</TabsTrigger>
          <TabsTrigger value="hazards">Hazards ({data.hazards.length})</TabsTrigger>
          <TabsTrigger value="system-hazards">System hazards ({data.systemHazards.length})</TabsTrigger>
          <TabsTrigger value="method">Method statements ({data.methodStatements.length})</TabsTrigger>
          <TabsTrigger value="scope">Scope of works ({data.scopes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="types">
          <TypesPanel types={data.types} />
        </TabsContent>
        <TabsContent value="hazards">
          <HazardsPanel hazards={data.hazards} />
        </TabsContent>
        <TabsContent value="system-hazards">
          <SystemHazardsPanel hazards={data.systemHazards} systems={systems} />
        </TabsContent>
        <TabsContent value="method">
          <MatrixPanel kind="method" entries={data.methodStatements} systems={systems} activities={activities} />
        </TabsContent>
        <TabsContent value="scope">
          <MatrixPanel kind="scope" entries={data.scopes} systems={systems} activities={activities} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Excel export / import
// ---------------------------------------------------------------------------

function ExcelBar() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  async function handleExport() {
    setBusy('export')
    const res = await exportLibraryWorkbook()
    setBusy(null)
    if (!res.success || !res.data) {
      toast.error(res.success ? 'Export failed' : res.error)
      return
    }
    const bytes = Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rams-library-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFile(file: File) {
    setBusy('import')
    const buf = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i += 0x8000) {
      binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    }
    const res = await importLibraryWorkbook(btoa(binary))
    setBusy(null)
    if (fileRef.current) fileRef.current.value = ''
    if (!res.success || !res.data) {
      toast.error(res.success ? 'Import failed' : res.error)
      return
    }
    const { created, updated, skipped } = res.data
    toast.success(`Imported: ${created} created, ${updated} updated`, {
      description: skipped.length
        ? `${skipped.length} row(s) skipped — ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '…' : ''}`
        : undefined,
      duration: skipped.length ? 12000 : 4000,
    })
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Export the whole library to Excel, edit it offline, then import it back. Rows are matched by
          code or name and updated — nothing is deleted on import.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={handleExport} disabled={busy !== null}>
            <Download className="mr-2 h-4 w-4" />
            {busy === 'export' ? 'Exporting…' : 'Export Excel'}
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            <Upload className="mr-2 h-4 w-4" />
            {busy === 'import' ? 'Importing…' : 'Import Excel'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            aria-label="Import RAMS library workbook"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  )
}

function ScoreSelect({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCORES.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ConfirmDelete({
  label,
  open,
  onCancel,
  onConfirm,
}: {
  label: string
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{label}&rdquo; will be removed from the library. Existing RAMS keep their copy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// System & activity types
// ---------------------------------------------------------------------------

type TypeForm = {
  id?: string
  code: string
  name: string
  description: string
  category: string
  template_type: 'system' | 'activity'
  default_ppe: string
  default_method_steps: string
  is_active: boolean
}

function TypesPanel({ types }: { types: RamsMasterTemplate[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'system' | 'activity'>('system')
  const [form, setForm] = useState<TypeForm | null>(null)
  const [saving, setSaving] = useState(false)

  const rows = types.filter((t) => (filter === 'system' ? t.template_type === 'system' : t.template_type !== 'system'))

  function open(t?: RamsMasterTemplate) {
    setForm(
      t
        ? {
            id: t.id,
            code: t.code,
            name: t.name,
            description: t.description ?? '',
            category: t.category,
            template_type: t.template_type === 'system' ? 'system' : 'activity',
            default_ppe: (t.default_ppe ?? []).join('\n'),
            default_method_steps: t.default_method_steps ?? '',
            is_active: t.is_active,
          }
        : {
            code: '',
            name: '',
            description: '',
            category: '',
            template_type: filter,
            default_ppe: '',
            default_method_steps: '',
            is_active: true,
          },
    )
  }

  async function save() {
    if (!form) return
    setSaving(true)
    const res = await saveRamsType({ ...form, default_ppe: form.default_ppe.split('\n') })
    setSaving(false)
    if (!res.success) return toast.error(res.error)
    toast.success(form.id ? 'Type updated' : 'Type added')
    setForm(null)
    router.refresh()
  }

  async function toggleActive(t: RamsMasterTemplate) {
    const res = await setRamsTypeActive(t.id, !t.is_active)
    if (!res.success) return toast.error(res.error)
    toast.success(t.is_active ? `${t.name} hidden from the wizard` : `${t.name} restored`)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>System &amp; activity types</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            System types drive hazards and equipment; activities drive the method statement and scope.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as 'system' | 'activity')}>
            <SelectTrigger className="w-40" aria-label="Type filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System types</SelectItem>
              <SelectItem value="activity">Activities</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className={t.is_active ? '' : 'opacity-60'}>
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{t.category}</TableCell>
                <TableCell>
                  <Badge variant={t.is_active ? 'secondary' : 'outline'}>{t.is_active ? 'Active' : 'Hidden'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => open(t)} aria-label={`Edit ${t.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(t)}
                    aria-label={t.is_active ? `Hide ${t.name}` : `Restore ${t.name}`}
                  >
                    {t.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Nothing here yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit type' : 'Add type'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="t-code">Code *</Label>
                  <Input id="t-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. FA" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="t-kind">Kind</Label>
                  <Select value={form.template_type} onValueChange={(v) => setForm({ ...form, template_type: v as 'system' | 'activity' })}>
                    <SelectTrigger id="t-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System type</SelectItem>
                      <SelectItem value="activity">Activity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-name">Name *</Label>
                <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-cat">Category</Label>
                <Input id="t-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="General" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-desc">Description</Label>
                <Textarea id="t-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-ppe">Default PPE (one per line)</Label>
                <Textarea id="t-ppe" rows={3} value={form.default_ppe} onChange={(e) => setForm({ ...form, default_ppe: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-steps">Default method steps</Label>
                <Textarea id="t-steps" rows={4} value={form.default_method_steps} onChange={(e) => setForm({ ...form, default_method_steps: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="t-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label htmlFor="t-active">Show in the RAMS wizard</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Hazard form (shared by general + system hazards)
// ---------------------------------------------------------------------------

type HazardForm = {
  id?: string
  system_type_id: string
  name: string
  description: string
  consequences: string
  category: string
  likelihood: number
  severity: number
  controls: string
  display_order: number
  is_active: boolean
}

function HazardDialog({
  form,
  setForm,
  onSave,
  saving,
  systems,
}: {
  form: HazardForm | null
  setForm: (f: HazardForm | null) => void
  onSave: () => void
  saving: boolean
  systems?: RamsMasterTemplate[]
}) {
  const isSystem = !!systems
  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {form?.id ? 'Edit' : 'Add'} {isSystem ? 'system hazard' : 'hazard'}
          </DialogTitle>
        </DialogHeader>
        {form && (
          <div className="grid gap-4 py-2">
            {isSystem && (
              <div className="grid gap-2">
                <Label htmlFor="h-sys">System type *</Label>
                <Select value={form.system_type_id} onValueChange={(v) => setForm({ ...form, system_type_id: v })}>
                  <SelectTrigger id="h-sys">
                    <SelectValue placeholder="Select a system type" />
                  </SelectTrigger>
                  <SelectContent>
                    {systems!.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isSystem && (
              <div className="grid gap-2">
                <Label htmlFor="h-name">Hazard name *</Label>
                <Input id="h-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="h-cat">Category{isSystem ? '' : ' *'}</Label>
              <Input
                id="h-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder={isSystem ? 'System Specific' : 'e.g. Working at height'}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="h-desc">Description{isSystem ? '' : ' *'}</Label>
              <Textarea id="h-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="h-cons">Potential consequences</Label>
              <Textarea id="h-cons" rows={2} value={form.consequences} onChange={(e) => setForm({ ...form, consequences: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 items-end gap-4">
              <ScoreSelect id="h-l" label="Likelihood" value={form.likelihood} onChange={(n) => setForm({ ...form, likelihood: n })} />
              <ScoreSelect id="h-s" label="Severity" value={form.severity} onChange={(n) => setForm({ ...form, severity: n })} />
              <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                Risk <RiskChip likelihood={form.likelihood} severity={form.severity} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="h-ctrl">Standard controls (one per line)</Label>
              <Textarea id="h-ctrl" rows={4} value={form.controls} onChange={(e) => setForm({ ...form, controls: e.target.value })} />
            </div>
            {isSystem && (
              <div className="grid gap-2 sm:max-w-32">
                <Label htmlFor="h-order">Display order</Label>
                <Input
                  id="h-order"
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="h-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="h-active">Active</Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HazardsPanel({ hazards }: { hazards: RamsHazard[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<HazardForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [del, setDel] = useState<RamsHazard | null>(null)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? hazards.filter((h) => `${h.category} ${h.description}`.toLowerCase().includes(s)) : hazards
  }, [hazards, q])

  function open(h?: RamsHazard) {
    setForm({
      id: h?.id,
      system_type_id: '',
      name: '',
      description: h?.description ?? '',
      consequences: h?.potential_consequences ?? '',
      category: h?.category ?? '',
      likelihood: h?.default_likelihood ?? 3,
      severity: h?.default_severity ?? 3,
      controls: (h?.standard_controls ?? []).join('\n'),
      display_order: 0,
      is_active: h?.is_active ?? true,
    })
  }

  async function save() {
    if (!form) return
    setSaving(true)
    const res = await saveHazard({
      id: form.id,
      category: form.category,
      description: form.description,
      potential_consequences: form.consequences,
      default_likelihood: form.likelihood,
      default_severity: form.severity,
      standard_controls: form.controls.split('\n'),
      is_active: form.is_active,
    })
    setSaving(false)
    if (!res.success) return toast.error(res.error)
    toast.success(form.id ? 'Hazard updated' : 'Hazard added')
    setForm(null)
    router.refresh()
  }

  async function remove() {
    if (!del) return
    const res = await deleteHazard(del.id)
    if (!res.success) return toast.error(res.error)
    toast.success('Hazard deleted')
    setDel(null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Hazard library</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">General hazards engineers can add to any RAMS.</p>
        </div>
        <div className="flex gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search hazards" />
          <Button onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-44 md:table-cell">Category</TableHead>
              <TableHead className="w-full">Hazard</TableHead>
              <TableHead className="w-16">Risk</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => (
              <TableRow key={h.id} className={h.is_active ? '' : 'opacity-60'}>
                <TableCell className="hidden text-muted-foreground md:table-cell">{h.category}</TableCell>
                <TableCell className="max-w-0">
                  <p className="truncate font-medium">{h.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {(h.standard_controls ?? []).length} controls
                    {h.is_active ? '' : ' · hidden'}
                  </p>
                </TableCell>
                <TableCell>
                  <RiskChip likelihood={h.default_likelihood ?? 3} severity={h.default_severity ?? 3} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => open(h)} aria-label={`Edit ${h.description}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDel(h)} aria-label={`Delete ${h.description}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <HazardDialog form={form} setForm={setForm} onSave={save} saving={saving} />
      <ConfirmDelete label={del?.description ?? ''} open={!!del} onCancel={() => setDel(null)} onConfirm={remove} />
    </Card>
  )
}

function SystemHazardsPanel({ hazards, systems }: { hazards: RamsSystemHazard[]; systems: RamsMasterTemplate[] }) {
  const router = useRouter()
  const [systemId, setSystemId] = useState<string>('all')
  const [form, setForm] = useState<HazardForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [del, setDel] = useState<RamsSystemHazard | null>(null)
  const nameById = useMemo(() => new Map(systems.map((s) => [s.id, s.name])), [systems])

  const rows = systemId === 'all' ? hazards : hazards.filter((h) => h.system_type_id === systemId)

  function open(h?: RamsSystemHazard) {
    setForm({
      id: h?.id,
      system_type_id: h?.system_type_id ?? (systemId !== 'all' ? systemId : ''),
      name: h?.hazard_name ?? '',
      description: h?.hazard_description ?? '',
      consequences: h?.potential_consequences ?? '',
      category: h?.category ?? 'System Specific',
      likelihood: h?.default_likelihood ?? 3,
      severity: h?.default_severity ?? 3,
      controls: (h?.standard_controls ?? []).join('\n'),
      display_order: h?.display_order ?? 0,
      is_active: h?.is_active ?? true,
    })
  }

  async function save() {
    if (!form) return
    setSaving(true)
    const res = await saveSystemHazard({
      id: form.id,
      system_type_id: form.system_type_id,
      hazard_name: form.name,
      hazard_description: form.description,
      potential_consequences: form.consequences,
      category: form.category,
      default_likelihood: form.likelihood,
      default_severity: form.severity,
      standard_controls: form.controls.split('\n'),
      display_order: form.display_order,
      is_active: form.is_active,
    })
    setSaving(false)
    if (!res.success) return toast.error(res.error)
    toast.success(form.id ? 'System hazard updated' : 'System hazard added')
    setForm(null)
    router.refresh()
  }

  async function remove() {
    if (!del) return
    const res = await deleteSystemHazard(del.id)
    if (!res.success) return toast.error(res.error)
    toast.success('System hazard deleted')
    setDel(null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>System hazards</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Loaded automatically into a RAMS when its system type is chosen.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={systemId} onValueChange={setSystemId}>
            <SelectTrigger className="w-52" aria-label="Filter by system type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All system types</SelectItem>
              {systems.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-44 md:table-cell">System</TableHead>
              <TableHead className="w-full">Hazard</TableHead>
              <TableHead className="w-16">Risk</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => (
              <TableRow key={h.id} className={h.is_active ? '' : 'opacity-60'}>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {nameById.get(h.system_type_id) ?? '—'}
                </TableCell>
                <TableCell className="max-w-0">
                  <p className="truncate font-medium">{h.hazard_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.hazard_description || `${h.standard_controls.length} controls`}
                  </p>
                </TableCell>
                <TableCell>
                  <RiskChip likelihood={h.default_likelihood} severity={h.default_severity} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => open(h)} aria-label={`Edit ${h.hazard_name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDel(h)} aria-label={`Delete ${h.hazard_name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No system hazards for this system type yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <HazardDialog form={form} setForm={setForm} onSave={save} saving={saving} systems={systems} />
      <ConfirmDelete label={del?.hazard_name ?? ''} open={!!del} onCancel={() => setDel(null)} onConfirm={remove} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Method statement / scope of works matrix (system × activity)
// ---------------------------------------------------------------------------

function MatrixPanel({
  kind,
  entries,
  systems,
  activities,
}: {
  kind: MatrixKind
  entries: MatrixEntry[]
  systems: RamsMasterTemplate[]
  activities: RamsMasterTemplate[]
}) {
  const router = useRouter()
  const title = kind === 'method' ? 'Method statements' : 'Scope of works'
  const [systemId, setSystemId] = useState(systems[0]?.id ?? '')
  const [editing, setEditing] = useState<{ activity: RamsMasterTemplate; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const textByActivity = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of entries) if (e.system_type_id === systemId) m.set(e.activity_type_id, e.text)
    return m
  }, [entries, systemId])

  async function save() {
    if (!editing) return
    setSaving(true)
    const res = await saveMatrixText({
      kind,
      system_type_id: systemId,
      activity_type_id: editing.activity.id,
      text: editing.text,
    })
    setSaving(false)
    if (!res.success) return toast.error(res.error)
    toast.success(editing.text.trim() ? `${title.replace(/s$/, '')} saved` : 'Cleared')
    setEditing(null)
    router.refresh()
  }

  const systemName = systems.find((s) => s.id === systemId)?.name ?? ''

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            One template per system type and activity. The wizard pre-fills it when that pair is picked.
          </p>
        </div>
        <Select value={systemId} onValueChange={setSystemId}>
          <SelectTrigger className="w-52" aria-label="System type">
            <SelectValue placeholder="Select a system type" />
          </SelectTrigger>
          <SelectContent>
            {systems.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Activity</TableHead>
              <TableHead className="w-full">Template</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a) => {
              const text = textByActivity.get(a.id)
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="max-w-0">
                    {text ? (
                      <p className="truncate text-sm text-muted-foreground">{text}</p>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing({ activity: a, text: text ?? '' })}
                      aria-label={`Edit ${a.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-balance">
              {title}: {systemName} — {editing?.activity.name}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-2 py-2">
              <Label htmlFor="matrix-text" className="sr-only">
                Template text
              </Label>
              <Textarea
                id="matrix-text"
                rows={14}
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                className="font-mono text-sm leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">Leave empty and save to remove this template.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

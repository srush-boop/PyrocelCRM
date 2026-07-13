'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Globe, AppWindow } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveRemMonFieldDef,
  deleteRemMonFieldDef,
  reorderRemMonFieldDefs,
  saveRemMonLinkDef,
  deleteRemMonLinkDef,
  reorderRemMonLinkDefs,
} from '@/lib/actions/rem-mon'
import type {
  RemMonFieldDef,
  RemMonLinkDef,
  RemMonFieldType,
  RemMonInAppTarget,
  RemMonLinkTargetKind,
  SystemType,
} from '@/lib/types/database'

const FIELD_TYPES: { value: RemMonFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
]

const IN_APP_TARGETS: { value: RemMonInAppTarget; label: string }[] = [
  { value: 'overview', label: 'Site overview' },
  { value: 'systems', label: 'Systems' },
  { value: 'documents', label: 'Documents' },
  { value: 'assets', label: 'Assets' },
  { value: 'calls', label: 'Calls' },
  { value: 'logbook', label: 'Log book' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'custom', label: 'Custom path (per site)' },
]

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export function RemMonTemplateManager({
  systemType,
  fields,
  links,
}: {
  systemType: SystemType | null
  fields: RemMonFieldDef[]
  links: RemMonLinkDef[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ---- Field dialog state ----
  const [fieldOpen, setFieldOpen] = useState(false)
  const [editingField, setEditingField] = useState<RemMonFieldDef | null>(null)
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldType, setFieldType] = useState<RemMonFieldType>('text')
  const [optionsText, setOptionsText] = useState('')
  const [required, setRequired] = useState(false)
  const [keyEdited, setKeyEdited] = useState(false)

  // ---- Link dialog state ----
  const [linkOpen, setLinkOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<RemMonLinkDef | null>(null)
  const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkKey, setLinkKey] = useState('')
  const [targetKind, setTargetKind] = useState<RemMonLinkTargetKind>('online')
  const [inAppTarget, setInAppTarget] = useState<RemMonInAppTarget>('documents')
  const [linkKeyEdited, setLinkKeyEdited] = useState(false)

  const sortedFields = [...fields].sort((a, b) => a.position - b.position)
  const sortedLinks = [...links].sort((a, b) => a.position - b.position)

  if (!systemType) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No &ldquo;Remote Monitoring&rdquo; system type (code REM-MON) is configured yet. Create it
          under System Types first, then return here to build the section template.
        </CardContent>
      </Card>
    )
  }

  // ---------- Field handlers ----------
  function openNewField() {
    setEditingField(null)
    setLabel('')
    setFieldKey('')
    setFieldType('text')
    setOptionsText('')
    setRequired(false)
    setKeyEdited(false)
    setFieldOpen(true)
  }

  function openEditField(f: RemMonFieldDef) {
    setEditingField(f)
    setLabel(f.label)
    setFieldKey(f.field_key)
    setFieldType(f.field_type)
    setOptionsText((f.options ?? []).join('\n'))
    setRequired(f.required)
    setKeyEdited(true)
    setFieldOpen(true)
  }

  function handleFieldLabelChange(value: string) {
    setLabel(value)
    if (!keyEdited && !editingField) setFieldKey(slugifyKey(value))
  }

  function handleSaveField() {
    if (!label.trim() || !fieldKey.trim()) {
      toast.error('Label and key are required')
      return
    }
    const options =
      fieldType === 'select'
        ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean)
        : []
    if (fieldType === 'select' && options.length === 0) {
      toast.error('Add at least one option for a dropdown field')
      return
    }
    const position = editingField?.position ?? sortedFields.length
    startTransition(async () => {
      const res = await saveRemMonFieldDef({
        id: editingField?.id,
        system_type_id: systemType!.id,
        label: label.trim(),
        field_key: slugifyKey(fieldKey),
        field_type: fieldType,
        options,
        required,
        position,
      })
      if (res.ok) {
        toast.success(editingField ? 'Field updated' : 'Field added')
        setFieldOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save field')
      }
    })
  }

  function handleDeleteField() {
    if (!deleteFieldId) return
    startTransition(async () => {
      const res = await deleteRemMonFieldDef(deleteFieldId)
      if (res.ok) {
        toast.success('Field deleted')
        setDeleteFieldId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete field')
      }
    })
  }

  function handleMoveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= sortedFields.length) return
    const reordered = [...sortedFields]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    startTransition(async () => {
      const res = await reorderRemMonFieldDefs(reordered.map((f) => f.id))
      if (res.ok) router.refresh()
      else toast.error(res.error ?? 'Could not reorder fields')
    })
  }

  // ---------- Link handlers ----------
  function openNewLink() {
    setEditingLink(null)
    setLinkLabel('')
    setLinkKey('')
    setTargetKind('online')
    setInAppTarget('documents')
    setLinkKeyEdited(false)
    setLinkOpen(true)
  }

  function openEditLink(l: RemMonLinkDef) {
    setEditingLink(l)
    setLinkLabel(l.label)
    setLinkKey(l.link_key)
    setTargetKind(l.target_kind)
    setInAppTarget(l.in_app_target ?? 'documents')
    setLinkKeyEdited(true)
    setLinkOpen(true)
  }

  function handleLinkLabelChange(value: string) {
    setLinkLabel(value)
    if (!linkKeyEdited && !editingLink) setLinkKey(slugifyKey(value))
  }

  function handleSaveLink() {
    if (!linkLabel.trim() || !linkKey.trim()) {
      toast.error('Label and key are required')
      return
    }
    const position = editingLink?.position ?? sortedLinks.length
    startTransition(async () => {
      const res = await saveRemMonLinkDef({
        id: editingLink?.id,
        system_type_id: systemType!.id,
        label: linkLabel.trim(),
        link_key: slugifyKey(linkKey),
        target_kind: targetKind,
        in_app_target: targetKind === 'in_app' ? inAppTarget : null,
        position,
      })
      if (res.ok) {
        toast.success(editingLink ? 'Link updated' : 'Link added')
        setLinkOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save link')
      }
    })
  }

  function handleDeleteLink() {
    if (!deleteLinkId) return
    startTransition(async () => {
      const res = await deleteRemMonLinkDef(deleteLinkId)
      if (res.ok) {
        toast.success('Link deleted')
        setDeleteLinkId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete link')
      }
    })
  }

  function handleMoveLink(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= sortedLinks.length) return
    const reordered = [...sortedLinks]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    startTransition(async () => {
      const res = await reorderRemMonLinkDefs(reordered.map((l) => l.id))
      if (res.ok) router.refresh()
      else toast.error(res.error ?? 'Could not reorder links')
    })
  }

  return (
    <div className="grid gap-6">
      {/* Fields */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              Details captured for each Remote Monitoring entry on a site.
            </CardDescription>
          </div>
          <Button onClick={openNewField}>
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedFields.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No fields yet. Add fields such as account number, receiver, or signalling type.
            </p>
          ) : (
            sortedFields.map((f, index) => (
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
                      onClick={() => handleMoveField(index, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="sr-only">Move up</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-6"
                      disabled={isPending || index === sortedFields.length - 1}
                      onClick={() => handleMoveField(index, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                      <span className="sr-only">Move down</span>
                    </Button>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {f.label}
                      {f.required && (
                        <Badge variant="outline" className="font-normal">
                          Required
                        </Badge>
                      )}
                    </div>
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
                  <Button variant="ghost" size="icon" onClick={() => openEditField(f)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteFieldId(f.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Links</CardTitle>
            <CardDescription>
              Link slots each site fills in &mdash; an online portal URL or a deep link to one of
              the site&apos;s own pages.
            </CardDescription>
          </div>
          <Button onClick={openNewLink}>
            <Plus className="mr-2 h-4 w-4" />
            Add link
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedLinks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No link slots yet. Add slots such as &ldquo;Monitoring portal&rdquo; (online) or
              &ldquo;Site documents&rdquo; (in-app).
            </p>
          ) : (
            sortedLinks.map((l, index) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-6"
                      disabled={isPending || index === 0}
                      onClick={() => handleMoveLink(index, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="sr-only">Move up</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-6"
                      disabled={isPending || index === sortedLinks.length - 1}
                      onClick={() => handleMoveLink(index, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                      <span className="sr-only">Move down</span>
                    </Button>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {l.target_kind === 'online' ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <AppWindow className="h-4 w-4 text-muted-foreground" />
                      )}
                      {l.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{l.link_key}</span> ·{' '}
                      {l.target_kind === 'online'
                        ? 'Online URL (per site)'
                        : `In-app · ${IN_APP_TARGETS.find((t) => t.value === l.in_app_target)?.label ?? l.in_app_target}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditLink(l)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteLinkId(l.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Field dialog */}
      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit field' : 'Add field'}</DialogTitle>
            <DialogDescription>
              Captured for each Remote Monitoring entry added to a site.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rm-label">Label *</Label>
              <Input
                id="rm-label"
                value={label}
                onChange={(e) => handleFieldLabelChange(e.target.value)}
                placeholder="e.g. Account number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rm-key">Key *</Label>
              <Input
                id="rm-key"
                value={fieldKey}
                onChange={(e) => {
                  setKeyEdited(true)
                  setFieldKey(e.target.value)
                }}
                placeholder="account_number"
                disabled={!!editingField}
              />
              <p className="text-xs text-muted-foreground">
                Stable identifier used to store answers. {editingField ? 'Cannot be changed.' : ''}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Field type</Label>
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as RemMonFieldType)}>
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
                <Label htmlFor="rm-options">Options (one per line)</Label>
                <textarea
                  id="rm-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={'Digital\nDualcom\nWebway'}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="rm-required">Required</Label>
                <p className="text-xs text-muted-foreground">Must be filled in on each entry.</p>
              </div>
              <Switch id="rm-required" checked={required} onCheckedChange={setRequired} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveField} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Edit link' : 'Add link'}</DialogTitle>
            <DialogDescription>
              A link slot each site fills in. Choose an online URL or an in-app destination.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rm-link-label">Label *</Label>
              <Input
                id="rm-link-label"
                value={linkLabel}
                onChange={(e) => handleLinkLabelChange(e.target.value)}
                placeholder="e.g. Monitoring portal"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rm-link-key">Key *</Label>
              <Input
                id="rm-link-key"
                value={linkKey}
                onChange={(e) => {
                  setLinkKeyEdited(true)
                  setLinkKey(e.target.value)
                }}
                placeholder="monitoring_portal"
                disabled={!!editingLink}
              />
              <p className="text-xs text-muted-foreground">
                Stable identifier used to store each site&apos;s URL.{' '}
                {editingLink ? 'Cannot be changed.' : ''}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Target</Label>
              <Select
                value={targetKind}
                onValueChange={(v) => setTargetKind(v as RemMonLinkTargetKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online URL (each site enters a link)</SelectItem>
                  <SelectItem value="in_app">In-app page (this site&apos;s record)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetKind === 'in_app' && (
              <div className="grid gap-2">
                <Label>In-app destination</Label>
                <Select
                  value={inAppTarget}
                  onValueChange={(v) => setInAppTarget(v as RemMonInAppTarget)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IN_APP_TARGETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Deep-links to this site&apos;s matching page automatically. &ldquo;Custom
                  path&rdquo; lets each site enter its own in-app path.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveLink} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFieldId} onOpenChange={(o) => !o && setDeleteFieldId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this field?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing entries keep any values already captured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteField} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLinkId} onOpenChange={(o) => !o && setDeleteLinkId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing entries keep any URLs already captured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLink} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

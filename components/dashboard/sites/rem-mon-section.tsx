'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { ChevronRight, Radio, Plus, Pencil, Trash2, ExternalLink, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { saveRemMonEntry, deleteRemMonEntry, ensureRemMonService } from '@/lib/actions/rem-mon'
import type {
  RemMonFieldDef,
  RemMonLinkDef,
  RemMonEntry,
  RemMonInAppTarget,
} from '@/lib/types/database'

// Site tab slugs are URL-driven via ?tab=. 'overview' is the bare site URL.
function resolveInAppHref(siteId: string, target: RemMonInAppTarget, customPath?: string | null): string {
  if (target === 'custom') return customPath?.trim() || '#'
  if (target === 'overview') return `/dashboard/sites/${siteId}`
  return `/dashboard/sites/${siteId}?tab=${target}`
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function RemMonSection({
  siteId,
  siteSystemId,
  fieldDefs,
  linkDefs,
  entries,
  sitePath,
  disabled = false,
}: {
  siteId: string
  siteSystemId: string
  fieldDefs: RemMonFieldDef[]
  linkDefs: RemMonLinkDef[]
  entries: RemMonEntry[]
  sitePath: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const ensuredRef = useRef(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RemMonEntry | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean | null>>({})
  const [linkValues, setLinkValues] = useState<Record<string, string | null>>({})

  const sortedFields = [...fieldDefs].sort((a, b) => a.position - b.position)
  const sortedLinks = [...linkDefs].sort((a, b) => a.position - b.position)
  const sortedEntries = [...entries].sort((a, b) => a.position - b.position)

  // On first expand, make sure the REM-MON site_service exists so the normal
  // per-service "charge" affordance appears on this system. Idempotent + no visits.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && !ensuredRef.current) {
      ensuredRef.current = true
      startTransition(async () => {
        const res = await ensureRemMonService(siteSystemId, sitePath)
        if (res.ok && res.serviceId) router.refresh()
      })
    }
  }

  function openNew() {
    setEditing(null)
    setName('Remote Monitoring')
    setFieldValues({})
    setLinkValues({})
    setDialogOpen(true)
  }

  function openEdit(entry: RemMonEntry) {
    setEditing(entry)
    setName(entry.name)
    setFieldValues({ ...entry.field_values })
    setLinkValues({ ...entry.link_values })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('A name is required')
      return
    }
    // Enforce required fields from the template.
    for (const f of sortedFields) {
      if (f.required) {
        const v = fieldValues[f.field_key]
        if (v === null || v === undefined || v === '') {
          toast.error(`${f.label} is required`)
          return
        }
      }
    }
    startTransition(async () => {
      const res = await saveRemMonEntry({
        id: editing?.id,
        site_system_id: siteSystemId,
        name: name.trim(),
        field_values: fieldValues,
        link_values: linkValues,
        sitePath,
      })
      if (res.ok) {
        toast.success(editing ? 'Entry updated' : 'Entry added')
        setDialogOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save entry')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteRemMonEntry(deleteId, sitePath)
      if (res.ok) {
        toast.success('Entry deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete entry')
      }
    })
  }

  const hasTemplate = sortedFields.length > 0 || sortedLinks.length > 0

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="mt-3">
      <div className="rounded-md border bg-muted/30">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
            aria-expanded={open}
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
            <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
            Remote Monitoring
            <Badge variant="secondary" className="ml-1 font-normal">
              {sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t p-3">
            {!hasTemplate && (
              <p className="text-xs text-muted-foreground text-pretty">
                No Remote Monitoring template configured yet. An admin can add fields and links
                under Sales → Remote Monitoring.
              </p>
            )}

            {sortedEntries.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No monitoring entries recorded yet.
              </p>
            ) : (
              <div className="grid gap-3">
                {sortedEntries.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium">{entry.name}</div>
                        {!disabled && (
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(entry.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        )}
                      </div>

                      {sortedFields.length > 0 && (
                        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                          {sortedFields.map((f) => (
                            <div key={f.id} className="flex flex-col">
                              <dt className="text-xs text-muted-foreground">{f.label}</dt>
                              <dd className="text-sm">{formatValue(entry.field_values?.[f.field_key] ?? null)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {sortedLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {sortedLinks.map((l) => {
                            if (l.target_kind === 'online') {
                              const url = (entry.link_values?.[l.link_key] ?? '').toString().trim()
                              if (!url) return null
                              const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
                              return (
                                <Button key={l.id} asChild variant="outline" size="sm" className="h-7">
                                  <a href={href} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    {l.label}
                                  </a>
                                </Button>
                              )
                            }
                            const href = resolveInAppHref(
                              siteId,
                              l.in_app_target ?? 'overview',
                              entry.link_values?.[l.link_key],
                            )
                            if (href === '#') return null
                            return (
                              <Button key={l.id} asChild variant="outline" size="sm" className="h-7">
                                <Link href={href}>
                                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                                  {l.label}
                                </Link>
                              </Button>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {!disabled && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                Add entry
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Add / edit entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit entry' : 'Add entry'}</DialogTitle>
            <DialogDescription>
              Remote Monitoring details for this site. Links open the monitoring portal or jump to
              this site&apos;s pages.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rme-name">Name *</Label>
              <Input
                id="rme-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fire alarm monitoring"
              />
            </div>

            {sortedFields.map((f) => {
              const key = f.field_key
              const value = fieldValues[key]
              const label = (
                <Label htmlFor={`rme-f-${key}`}>
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
              )
              if (f.field_type === 'select') {
                return (
                  <div key={f.id} className="grid gap-2">
                    {label}
                    <Select
                      value={(value ?? '').toString()}
                      onValueChange={(v) => setFieldValues((prev) => ({ ...prev, [key]: v }))}
                    >
                      <SelectTrigger id={`rme-f-${key}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }
              if (f.field_type === 'textarea') {
                return (
                  <div key={f.id} className="grid gap-2">
                    {label}
                    <textarea
                      id={`rme-f-${key}`}
                      value={(value ?? '').toString()}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )
              }
              return (
                <div key={f.id} className="grid gap-2">
                  {label}
                  <Input
                    id={`rme-f-${key}`}
                    type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                    value={(value ?? '').toString()}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              )
            })}

            {sortedLinks.length > 0 && (
              <div className="grid gap-3 rounded-md border p-3">
                <p className="text-sm font-medium">Links</p>
                {sortedLinks.map((l) => {
                  // Online links need a URL per site; custom in-app links need a path.
                  // Fixed in-app targets resolve automatically and need no input.
                  const needsInput = l.target_kind === 'online' || l.in_app_target === 'custom'
                  if (!needsInput) {
                    return (
                      <div key={l.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{l.label}</span> — links to this
                        site&apos;s {l.in_app_target} page automatically.
                      </div>
                    )
                  }
                  return (
                    <div key={l.id} className="grid gap-2">
                      <Label htmlFor={`rme-l-${l.link_key}`}>
                        {l.label}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          {l.target_kind === 'online' ? '(URL)' : '(in-app path)'}
                        </span>
                      </Label>
                      <Input
                        id={`rme-l-${l.link_key}`}
                        value={(linkValues[l.link_key] ?? '').toString()}
                        onChange={(e) =>
                          setLinkValues((prev) => ({ ...prev, [l.link_key]: e.target.value }))
                        }
                        placeholder={l.target_kind === 'online' ? 'https://portal.example.com/site/123' : '/dashboard/...'}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
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
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  )
}

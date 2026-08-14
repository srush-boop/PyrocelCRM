'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SystemBadge, SystemIcon } from '@/lib/system-types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { saveSystemType, deleteSystemType } from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import type { SystemType } from '@/lib/types/database'

export function SystemTypesManager({
  systemTypes,
  serviceCounts,
}: {
  systemTypes: SystemType[]
  serviceCounts: Record<string, number>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SystemType | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#b91c1c')
  const [requiresRecurringVisits, setRequiresRecurringVisits] = useState(true)
  const [logbookCategory, setLogbookCategory] = useState<'fire' | 'security' | 'other'>('fire')

  function openNew() {
    setEditing(null)
    setName('')
    setCode('')
    setDescription('')
    setColor('#b91c1c')
    setRequiresRecurringVisits(true)
    setLogbookCategory('fire')
    setOpen(true)
  }

  function openEdit(st: SystemType) {
    setEditing(st)
    setName(st.name)
    setCode(st.code ?? '')
    setDescription(st.description ?? '')
    setColor(st.color ?? '#b91c1c')
    setRequiresRecurringVisits(st.requires_recurring_visits ?? true)
    setLogbookCategory(st.logbook_category ?? 'fire')
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    startTransition(async () => {
      const res = await saveSystemType({
        id: editing?.id,
        name: name.trim(),
        code,
        description,
        color,
        requiresRecurringVisits,
        logbookCategory,
      })
      if (res.ok) {
        toast.success(editing ? 'System type updated' : 'System type added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save system type')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteSystemType(deleteId)
      if (res.ok) {
        toast.success('System type deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete system type')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add system type
        </Button>
      </div>

      {systemTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Layers className="mb-2 h-8 w-8 text-muted-foreground/50" />
            No system types yet. Add your first to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Services</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {systemTypes.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>
                    {st.code ? (
                      <SystemBadge system={st} codeOnly />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <SystemIcon system={st} />
                      {st.name}
                      {st.requires_recurring_visits === false && (
                        <span className="rounded-full border border-zinc-500/25 bg-zinc-500/12 px-2 py-0.5 text-xs font-normal text-zinc-600 dark:text-zinc-300">
                          Charge-only
                        </span>
                      )}
                      {st.logbook_category === 'security' && (
                        <span className="rounded-full border border-violet-500/25 bg-violet-500/12 px-2 py-0.5 text-xs font-normal text-violet-600 dark:text-violet-300">
                          Security
                        </span>
                      )}
                      {st.logbook_category === 'other' && (
                        <span className="rounded-full border border-zinc-500/25 bg-zinc-500/12 px-2 py-0.5 text-xs font-normal text-zinc-600 dark:text-zinc-300">
                          Other
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {st.description || '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {serviceCounts[st.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(st)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(st.id)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit system type' : 'Add system type'}</DialogTitle>
            <DialogDescription>
              A top-level system (e.g. Fire Alarm). Service types sit underneath it, and the code is
              used to identify the system in quotes and quote-bank analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="st-name">Name *</Label>
              <Input
                id="st-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fire Alarm"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="st-code">Code</Label>
                <Input
                  id="st-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FA, CCTV, AC"
                  maxLength={12}
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="st-color">Colour</Label>
                <Input
                  id="st-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-16 p-1"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="st-description">Description</Label>
              <Textarea
                id="st-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional description of this system type"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="st-logbook-category">Log book section</Label>
              <Select
                value={logbookCategory}
                onValueChange={(v) => setLogbookCategory(v as 'fire' | 'security' | 'other')}
              >
                <SelectTrigger id="st-logbook-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fire">Fire safety</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which section of the site log book this system&apos;s service history appears under.
                Fire-safety systems (fire alarm, emergency lighting, extinguishers, dampers) stay
                under Fire safety; intruder alarm, CCTV and access control belong under Security.
              </p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="st-recurring" className="cursor-pointer">
                  Requires recurring service visits
                </Label>
                <p className="text-xs text-muted-foreground">
                  When off, services under this system are charge-only and never generate PPM
                  visits (e.g. Remote Monitoring).
                </p>
              </div>
              <Switch
                id="st-recurring"
                checked={requiresRecurringVisits}
                onCheckedChange={setRequiresRecurringVisits}
              />
            </div>
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
            <AlertDialogTitle>Delete this system type?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Service types linked to it will be left without a system, and
              its spec templates will be removed.
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

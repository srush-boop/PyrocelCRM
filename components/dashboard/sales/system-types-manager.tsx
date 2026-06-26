'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

  function openNew() {
    setEditing(null)
    setName('')
    setCode('')
    setDescription('')
    setColor('#b91c1c')
    setOpen(true)
  }

  function openEdit(st: SystemType) {
    setEditing(st)
    setName(st.name)
    setCode(st.code ?? '')
    setDescription(st.description ?? '')
    setColor(st.color ?? '#b91c1c')
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
                      <Badge
                        variant="outline"
                        className="font-mono"
                        style={st.color ? { borderColor: st.color, color: st.color } : undefined}
                      >
                        {st.code}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{st.name}</TableCell>
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

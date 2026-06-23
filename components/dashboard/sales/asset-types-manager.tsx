'use client'

import { useMemo, useState, useTransition } from 'react'
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
import { Plus, Pencil, Trash2, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { saveAssetType, deleteAssetType } from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import type { AssetType, SystemType } from '@/lib/types/database'

const UNASSIGNED = '__none__'

export function AssetTypesManager({
  assetTypes,
  systemTypes,
}: {
  assetTypes: AssetType[]
  systemTypes: SystemType[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AssetType | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [systemTypeId, setSystemTypeId] = useState<string>(UNASSIGNED)
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('0')

  // Group asset types under their system type for display.
  const grouped = useMemo(() => {
    const map = new Map<string, AssetType[]>()
    for (const a of assetTypes) {
      const key = a.system_type_id ?? UNASSIGNED
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    return map
  }, [assetTypes])

  function openNew() {
    setEditing(null)
    setName('')
    setSystemTypeId(systemTypes[0]?.id ?? UNASSIGNED)
    setDescription('')
    setMinutes('0')
    setOpen(true)
  }

  function openEdit(a: AssetType) {
    setEditing(a)
    setName(a.name)
    setSystemTypeId(a.system_type_id ?? UNASSIGNED)
    setDescription(a.description ?? '')
    setMinutes(String(a.default_minutes ?? 0))
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    startTransition(async () => {
      const res = await saveAssetType({
        id: editing?.id,
        system_type_id: systemTypeId === UNASSIGNED ? null : systemTypeId,
        name: name.trim(),
        description,
        default_minutes: Number.parseFloat(minutes) || 0,
      })
      if (res.ok) {
        toast.success(editing ? 'Asset type updated' : 'Asset type added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save asset type')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteAssetType(deleteId)
      if (res.ok) {
        toast.success('Asset type deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete asset type')
      }
    })
  }

  const systemName = (id: string) =>
    id === UNASSIGNED
      ? 'Unassigned'
      : systemTypes.find((s) => s.id === id)?.name ?? 'Unknown system'

  // Stable display order: known system types first (in their order), then unassigned.
  const orderedKeys = [
    ...systemTypes.map((s) => s.id).filter((id) => grouped.has(id)),
    ...(grouped.has(UNASSIGNED) ? [UNASSIGNED] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add asset type
        </Button>
      </div>

      {assetTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Boxes className="mb-2 h-8 w-8 text-muted-foreground/50" />
            No asset types yet. Add the assets you test (e.g. detector, call point) with a default
            test time.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedKeys.map((key) => (
            <Card key={key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{systemName(key)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Test time</TableHead>
                        <TableHead className="w-[90px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(grouped.get(key) ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="max-w-md truncate text-muted-foreground">
                            {a.description || '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge variant="secondary">{a.default_minutes} min</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit asset type' : 'Add asset type'}</DialogTitle>
            <DialogDescription>
              An asset you test on a system, with the time it typically takes. Used by the PPM
              service-contract calculator.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="at-system">System type</Label>
              <Select value={systemTypeId} onValueChange={setSystemTypeId}>
                <SelectTrigger id="at-system">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {systemTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code ? `${s.code} — ${s.name}` : s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="at-name">Asset name *</Label>
                <Input
                  id="at-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Smoke detector"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="at-minutes">Test time (min)</Label>
                <Input
                  id="at-minutes"
                  type="number"
                  min={0}
                  step="0.5"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="at-description">Description</Label>
              <Textarea
                id="at-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional notes"
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
            <AlertDialogTitle>Delete this asset type?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing quote calculations keep their saved snapshot.
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

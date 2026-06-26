'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { formatPence, penceToPounds, poundsToPence } from '@/lib/sales'
import type { DirectCost } from '@/lib/types/database'
import { saveDirectCost, deleteDirectCost } from '@/app/(dashboard)/dashboard/sales/direct-cost-actions'

interface FormState {
  id?: string
  role: string
  rate: string
  notes: string
  active: boolean
}

function emptyForm(): FormState {
  return { role: '', rate: '0.00', notes: '', active: true }
}

export function DirectCostsManager({ costs }: { costs: DirectCost[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<DirectCost | null>(null)

  function openNew() {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(cost: DirectCost) {
    setForm({
      id: cost.id,
      role: cost.role,
      rate: penceToPounds(cost.hourly_cost_pence),
      notes: cost.notes ?? '',
      active: cost.active,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveDirectCost({
        id: form.id,
        role: form.role,
        hourly_cost_pence: poundsToPence(form.rate),
        notes: form.notes || null,
        active: form.active,
      })
      if (res.ok) {
        toast.success('Direct cost saved')
        setDialogOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save direct cost')
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startTransition(async () => {
      const res = await deleteDirectCost(id)
      if (res.ok) {
        toast.success('Direct cost deleted')
        setDeleteTarget(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete direct cost')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Role
        </Button>
      </div>

      <Card>
        {costs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No direct costs yet</p>
            <p className="text-sm text-muted-foreground">
              Add roles and their hourly cost to underpin labour estimates.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hourly cost</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell className="font-medium">{cost.role}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPence(cost.hourly_cost_pence)}/hr
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cost.notes ? (
                      <span className="line-clamp-1">{cost.notes}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cost.active ? 'secondary' : 'outline'}>
                      {cost.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cost)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTarget(cost)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit role' : 'Add role'}</DialogTitle>
            <DialogDescription>The hourly cost used when estimating labour for this role.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="d-role">Role *</Label>
              <Input
                id="d-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="e.g. Fire Engineer"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-rate">Hourly cost (£)</Label>
              <Input
                id="d-rate"
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                onBlur={(e) => setForm({ ...form, rate: penceToPounds(poundsToPence(e.target.value)) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-notes">Notes</Label>
              <Textarea
                id="d-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional context, e.g. includes vehicle and tools"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="d-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="d-active" className="font-normal">
                Active (available for estimates)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || !form.role.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete direct cost?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.role}&rdquo; will be removed. This does not affect quotes already created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

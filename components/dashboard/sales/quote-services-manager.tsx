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
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveQuoteService,
  deleteQuoteService,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { formatPence, poundsToPence, penceToPounds } from '@/lib/sales'
import type { QuoteService } from '@/lib/types/database'

export function QuoteServicesManager({ services }: { services: QuoteService[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QuoteService | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [active, setActive] = useState(true)

  function openNew() {
    setEditing(null)
    setName('')
    setDescription('')
    setPrice('')
    setActive(true)
    setOpen(true)
  }

  function openEdit(s: QuoteService) {
    setEditing(s)
    setName(s.name)
    setDescription(s.description ?? '')
    setPrice(s.default_price_pence !== null ? penceToPounds(s.default_price_pence) : '')
    setActive(s.active)
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    startTransition(async () => {
      const res = await saveQuoteService({
        id: editing?.id,
        name: name.trim(),
        description,
        default_price_pence: price.trim() === '' ? null : poundsToPence(price),
        active,
      })
      if (res.ok) {
        toast.success(editing ? 'Service updated' : 'Service added')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save service')
      }
    })
  }

  function handleDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const res = await deleteQuoteService(deleteId)
      if (res.ok) {
        toast.success('Service deleted')
        setDeleteId(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete service')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add service
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Wrench className="mb-2 h-8 w-8 text-muted-foreground/50" />
            No services yet. Add non-product services (e.g. Installation, Decommission redundant
            equipment) that can be added to any quote.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Default price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {s.description || '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.default_price_pence !== null ? formatPence(s.default_price_pence) : '-'}
                  </TableCell>
                  <TableCell>
                    {s.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Hidden</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)}>
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
            <DialogTitle>{editing ? 'Edit service' : 'Add service'}</DialogTitle>
            <DialogDescription>
              A reusable non-product service that can be added to any system on a quote. The default
              price is a starting point and can be edited per quote.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="qs-name">Service name *</Label>
                <Input
                  id="qs-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Installation"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="qs-price">Default price (£)</Label>
                <Input
                  id="qs-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Optional"
                  className="w-32"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qs-description">Description</Label>
              <Textarea
                id="qs-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional extra detail shown under the service on the quote"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="qs-active" className="cursor-pointer">
                  Active
                </Label>
                <span className="text-xs text-muted-foreground">
                  Inactive services are hidden from the quote builder.
                </span>
              </div>
              <Switch id="qs-active" checked={active} onCheckedChange={setActive} />
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
            <AlertDialogTitle>Delete this service?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Existing quotes keep their saved service lines.
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

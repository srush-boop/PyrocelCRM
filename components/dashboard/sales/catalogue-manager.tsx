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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Plus, Pencil, Trash2, Loader2, PackageOpen } from 'lucide-react'
import { toast } from 'sonner'
import { formatPence, penceToPounds, poundsToPence } from '@/lib/sales'
import type { QuoteCatalogueItem, ServiceType } from '@/lib/types/database'
import { saveCatalogueItem, deleteCatalogueItem } from '@/app/(dashboard)/dashboard/sales/actions'

const NO_SERVICE = '__none__'

interface FormState {
  id?: string
  name: string
  description: string
  category: string
  service_type_id: string
  default_unit: string
  price: string
  active: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    category: '',
    service_type_id: NO_SERVICE,
    default_unit: '',
    price: '0.00',
    active: true,
  }
}

export function CatalogueManager({
  items,
  serviceTypes,
}: {
  items: QuoteCatalogueItem[]
  serviceTypes: ServiceType[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<QuoteCatalogueItem | null>(null)

  function openNew() {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(item: QuoteCatalogueItem) {
    setForm({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      category: item.category ?? '',
      service_type_id: item.service_type_id ?? NO_SERVICE,
      default_unit: item.default_unit ?? '',
      price: penceToPounds(item.default_unit_price_pence),
      active: item.active,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveCatalogueItem({
        id: form.id,
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        service_type_id: form.service_type_id === NO_SERVICE ? null : form.service_type_id,
        default_unit: form.default_unit || null,
        default_unit_price_pence: poundsToPence(form.price),
        active: form.active,
      })
      if (res.ok) {
        toast.success('Catalogue item saved')
        setDialogOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save item')
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startTransition(async () => {
      const res = await deleteCatalogueItem(id)
      if (res.ok) {
        toast.success('Catalogue item deleted')
        setDeleteTarget(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete item')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <Card>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No catalogue items yet</p>
            <p className="text-sm text-muted-foreground">
              Add standard products and services to speed up quoting.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Default price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{item.category ?? '—'}</TableCell>
                  <TableCell className="text-sm">{item.default_unit ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPence(item.default_unit_price_pence)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.active ? 'secondary' : 'outline'}>
                      {item.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTarget(item)}
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit item' : 'Add item'}</DialogTitle>
            <DialogDescription>Reusable line item available across all quotes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Optical smoke detector"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-desc">Description</Label>
              <Textarea
                id="c-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="c-cat">Category</Label>
                <Input
                  id="c-cat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Supply, Labour…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-unit">Unit</Label>
                <Input
                  id="c-unit"
                  value={form.default_unit}
                  onChange={(e) => setForm({ ...form, default_unit: e.target.value })}
                  placeholder="each, hour, m"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="c-price">Default price (£)</Label>
                <Input
                  id="c-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  onBlur={(e) => setForm({ ...form, price: penceToPounds(poundsToPence(e.target.value)) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-service">Service type</Label>
                <Select
                  value={form.service_type_id}
                  onValueChange={(v) => setForm({ ...form, service_type_id: v })}
                >
                  <SelectTrigger id="c-service">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SERVICE}>None</SelectItem>
                    {serviceTypes.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="c-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="c-active" className="font-normal">
                Active (available to add to quotes)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete catalogue item?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be removed. Existing quotes that already use it are
              unaffected.
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

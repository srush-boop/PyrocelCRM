'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
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
import { Plus, Pencil, Trash2, Loader2, PackageOpen, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatPence, penceToPounds, poundsToPence, sellFromCost } from '@/lib/sales'
import type { QuoteCatalogueItem, ServiceType } from '@/lib/types/database'
import {
  saveCatalogueItem,
  deleteCatalogueItem,
  fetchCataloguePage,
} from '@/app/(dashboard)/dashboard/sales/actions'

const NO_SERVICE = '__none__'

interface FormState {
  id?: string
  name: string
  product_code: string
  description: string
  category: string
  service_type_id: string
  default_unit: string
  cost: string
  margin: string
  active: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    product_code: '',
    description: '',
    category: '',
    service_type_id: NO_SERVICE,
    default_unit: '',
    cost: '0.00',
    margin: '0',
    active: true,
  }
}

export function CatalogueManager({
  initialItems,
  initialTotal,
  pageSize,
  serviceTypes,
}: {
  initialItems: QuoteCatalogueItem[]
  initialTotal: number
  pageSize: number
  serviceTypes: ServiceType[]
}) {
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<QuoteCatalogueItem | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // The catalogue can hold thousands of rows, so we fetch one page at a time
  // from the server (with the search term applied in SQL) instead of loading
  // everything into the browser. The first page is provided by the server
  // component so there's no loading flash on initial render.
  const [items, setItems] = useState<QuoteCatalogueItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)

  const PAGE_SIZE = pageSize
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)

  const loadPage = useCallback(
    async (opts: { search: string; page: number }) => {
      setLoading(true)
      const res = await fetchCataloguePage({
        search: opts.search,
        page: opts.page,
        pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
      setLoading(false)
    },
    [PAGE_SIZE],
  )

  // Debounce search; refetch immediately on page changes. We skip the very
  // first render because the server already supplied page 0 with no search.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true)
      return
    }
    const handle = setTimeout(() => {
      void loadPage({ search, page })
    }, 250)
    return () => clearTimeout(handle)
  }, [search, page, hydrated, loadPage])

  function onSearchChange(value: string) {
    setSearch(value)
    setPage(0)
  }

  function openNew() {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(item: QuoteCatalogueItem) {
    setForm({
      id: item.id,
      name: item.name,
      product_code: item.product_code ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      service_type_id: item.service_type_id ?? NO_SERVICE,
      default_unit: item.default_unit ?? '',
      cost: penceToPounds(item.unit_cost_pence),
      margin: String(item.margin_percent ?? 0),
      active: item.active,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveCatalogueItem({
        id: form.id,
        name: form.name,
        product_code: form.product_code || null,
        description: form.description || null,
        category: form.category || null,
        service_type_id: form.service_type_id === NO_SERVICE ? null : form.service_type_id,
        default_unit: form.default_unit || null,
        unit_cost_pence: poundsToPence(form.cost),
        margin_percent: Number.parseFloat(form.margin) || 0,
        active: form.active,
      })
      if (res.ok) {
        toast.success('Catalogue item saved')
        setDialogOpen(false)
        await loadPage({ search, page })
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
        // If we just removed the last item on the page, step back a page.
        const nextPage = items.length === 1 && page > 0 ? page - 1 : page
        setPage(nextPage)
        await loadPage({ search, page: nextPage })
      } else {
        toast.error(res.error ?? 'Could not delete item')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by code, name or category"
            className="pl-9"
            aria-label="Search catalogue"
          />
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <Card>
        {total === 0 && !search.trim() ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No catalogue items yet</p>
            <p className="text-sm text-muted-foreground">
              Add standard products and services to speed up quoting.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No matching items</p>
            <p className="text-sm text-muted-foreground">
              Nothing matches &ldquo;{search}&rdquo;. Try a different search.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.product_code ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{item.category ?? '—'}</TableCell>
                  <TableCell className="text-sm">{item.default_unit ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatPence(item.unit_cost_pence)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.margin_percent ?? 0}%</TableCell>
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {safePage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit item' : 'Add item'}</DialogTitle>
            <DialogDescription>Reusable line item available across all quotes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-[130px_1fr] gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="c-code">Product code</Label>
                <Input
                  id="c-code"
                  value={form.product_code}
                  onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                  placeholder="000081"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-name">Name *</Label>
                <Input
                  id="c-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Optical smoke detector"
                />
              </div>
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
                <Label htmlFor="c-cost">Unit cost (£)</Label>
                <Input
                  id="c-cost"
                  inputMode="decimal"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  onBlur={(e) => setForm({ ...form, cost: penceToPounds(poundsToPence(e.target.value)) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-margin">Margin %</Label>
                <Input
                  id="c-margin"
                  inputMode="decimal"
                  value={form.margin}
                  onChange={(e) => setForm({ ...form, margin: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Sell price</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
                  {formatPence(
                    sellFromCost(poundsToPence(form.cost), Number.parseFloat(form.margin) || 0),
                  )}
                </div>
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

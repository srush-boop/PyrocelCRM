'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ShoppingCart, Plus, ChevronRight, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { purchaseOrderStatusMeta } from '@/lib/jobs/purchasing-shared'
import { createJobPurchaseOrder } from '@/app/(dashboard)/dashboard/purchasing/actions'
import type { PurchaseOrder } from '@/lib/types/database'
import type { SupplierOrderingProgress } from '@/lib/jobs/purchasing'

interface Props {
  jobId: string
  orders: (PurchaseOrder & {
    lines?: { id: string; quantity: number; quantity_received: number }[]
  })[]
  progress: SupplierOrderingProgress[]
  suppliers: { id: string; name: string }[]
}

export function JobPurchasing({ jobId, orders, progress, suppliers }: Props) {
  // Supplier groups that still have something left to order.
  const outstanding = progress.filter((g) => g.remainingLineCount > 0)
  const fullyOrdered = progress.length > 0 && outstanding.length === 0
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          Purchasing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Existing purchase orders — each links to its own page (viewable in any
            order, no stepping back and forth). */}
        {orders.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Purchase orders
            </h3>
            <ul className="space-y-2">
              {orders.map((po) => {
                const statusMeta = purchaseOrderStatusMeta(po.status)
                const ordered = (po.lines ?? []).reduce((s, l) => s + Number(l.quantity), 0)
                const received = (po.lines ?? []).reduce((s, l) => s + Number(l.quantity_received), 0)
                return (
                  <li key={po.id}>
                    <Link
                      href={`/dashboard/purchasing/${po.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{po.po_number ?? 'Draft'}</span>
                          <Badge variant="secondary" className={cn('capitalize', statusMeta.badgeClass)}>
                            {statusMeta.label}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {po.supplier?.name ?? 'Unassigned supplier'}
                          {ordered > 0 ? ` · received ${received}/${ordered}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums">{formatPence(po.subtotal_pence)}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Still to order — phased ordering per supplier. */}
        {outstanding.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Still to order
            </h3>
            <ul className="space-y-2">
              {outstanding.map((group) => {
                const key = group.supplierId ?? 'unassigned'
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{group.supplierName}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.remainingLineCount} item{group.remainingLineCount === 1 ? '' : 's'} ·{' '}
                        {formatPence(group.remainingValuePence)} outstanding
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setOpenGroupKey(key)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create order
                    </Button>
                    <OrderBuilderDialog
                      jobId={jobId}
                      group={group}
                      suppliers={suppliers}
                      open={openGroupKey === key}
                      onOpenChange={(o) => setOpenGroupKey(o ? key : null)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Empty / complete states. */}
        {orders.length === 0 && outstanding.length === 0 && (
          <p className="text-sm text-muted-foreground text-pretty">
            {progress.length === 0
              ? 'No orderable parts were found on the source quote.'
              : 'All quoted parts have been ordered.'}
          </p>
        )}
        {fullyOrdered && orders.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <PackageCheck className="h-4 w-4 text-chart-4" />
            All quoted parts have been ordered.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Order builder dialog: pick which remaining lines (and how many) to order now.
// ---------------------------------------------------------------------------

function OrderBuilderDialog({
  jobId,
  group,
  suppliers,
  open,
  onOpenChange,
}: {
  jobId: string
  group: SupplierOrderingProgress
  suppliers: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const remainingLines = useMemo(() => group.lines.filter((l) => l.remainingQty > 0), [group.lines])

  // Quantity to order per line, defaulting to everything outstanding.
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(remainingLines.map((l) => [l.quoteLineItemId, l.remainingQty])),
  )
  // For the "Unassigned" group the buyer must choose a supplier first.
  const [supplierId, setSupplierId] = useState<string>(group.supplierId ?? '')

  // Reset local state whenever the dialog is (re)opened.
  function handleOpenChange(next: boolean) {
    if (next) {
      setQty(Object.fromEntries(remainingLines.map((l) => [l.quoteLineItemId, l.remainingQty])))
      setSupplierId(group.supplierId ?? '')
    }
    onOpenChange(next)
  }

  const selections = remainingLines
    .map((l) => ({ quoteLineItemId: l.quoteLineItemId, quantity: qty[l.quoteLineItemId] ?? 0 }))
    .filter((s) => s.quantity > 0)

  const totalPence = remainingLines.reduce((sum, l) => {
    const q = qty[l.quoteLineItemId] ?? 0
    return sum + Math.round(l.unitCostPence * Math.min(q, l.remainingQty))
  }, 0)

  const needsSupplier = group.supplierId === null
  const canSubmit = selections.length > 0 && (!needsSupplier || supplierId !== '')

  function setLineQty(lineId: string, value: string, max: number) {
    const n = Math.max(0, Math.min(Math.floor(Number(value) || 0), max))
    setQty((prev) => ({ ...prev, [lineId]: n }))
  }

  function submit() {
    startTransition(async () => {
      const res = await createJobPurchaseOrder(jobId, needsSupplier ? supplierId : group.supplierId, selections)
      if (res.ok && res.poId) {
        toast.success('Draft purchase order created')
        onOpenChange(false)
        router.push(`/dashboard/purchasing/${res.poId}`)
      } else {
        toast.error(res.error ?? 'Could not create the order')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create purchase order</DialogTitle>
          <DialogDescription className="text-pretty">
            Choose how many of each outstanding item to order now. You can raise further orders for
            the remainder later.
          </DialogDescription>
        </DialogHeader>

        {needsSupplier && (
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="po-supplier">
                <SelectValue placeholder="Choose a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Item</th>
                <th className="p-2 text-right font-medium">Remaining</th>
                <th className="p-2 text-right font-medium">Order now</th>
                <th className="p-2 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {remainingLines.map((l) => {
                const q = qty[l.quoteLineItemId] ?? 0
                return (
                  <tr key={l.quoteLineItemId} className="border-t border-border">
                    <td className="p-2">
                      <p className="font-medium leading-tight">{l.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.productCode ? `${l.productCode} · ` : ''}
                        {formatPence(l.unitCostPence)} / {l.unit} · {l.orderedQty} of {l.quotedQty} ordered
                      </p>
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">
                      {l.remainingQty}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={l.remainingQty}
                        value={q}
                        onChange={(e) => setLineQty(l.quoteLineItemId, e.target.value, l.remainingQty)}
                        className="ml-auto h-8 w-20 text-right"
                        aria-label={`Quantity of ${l.description} to order`}
                      />
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {formatPence(Math.round(l.unitCostPence * Math.min(q, l.remainingQty)))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            Order total{' '}
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatPence(totalPence)}
            </span>
          </span>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            {isPending ? 'Creating…' : 'Create draft order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

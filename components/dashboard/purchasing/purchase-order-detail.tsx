'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Building2,
  Hammer,
  Mail,
  Plus,
  Send,
  Trash2,
  Truck,
  PackageCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { purchaseOrderStatusMeta } from '@/lib/jobs/purchasing'
import {
  addPurchaseOrderLine,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  markPurchaseOrderSent,
  receivePurchaseOrder,
  removePurchaseOrderLine,
  setPurchaseOrderSupplier,
  updatePurchaseOrderLine,
} from '@/app/(dashboard)/dashboard/purchasing/actions'
import type { PurchaseOrder, PurchaseOrderLine } from '@/lib/types/database'

interface Props {
  po: PurchaseOrder
  suppliers: { id: string; name: string }[]
}

const poundsFromPence = (pence: number) => (pence / 100).toFixed(2)
const penceFromPounds = (pounds: string) => Math.round((Number.parseFloat(pounds) || 0) * 100)

export function PurchaseOrderDetail({ po, suppliers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [receiving, setReceiving] = useState(false)

  const lines = useMemo(() => po.lines ?? [], [po.lines])
  const status = purchaseOrderStatusMeta(po.status)
  const isDraft = po.status === 'draft'
  const canReceive = po.status === 'sent' || po.status === 'part_received'

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(success)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href="/dashboard/purchasing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Purchasing
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight">{po.po_number ?? 'Purchase order'}</h1>
              <Badge variant="secondary" className={cn('capitalize', status.badgeClass)}>
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {po.supplier?.name ?? 'No supplier assigned'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <Button
                  onClick={() => run(() => markPurchaseOrderSent(po.id), 'Order marked as sent')}
                  disabled={isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Mark as sent
                </Button>
                <ConfirmButton
                  trigger={
                    <Button variant="outline" disabled={isPending}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  }
                  title="Delete this draft order?"
                  description="This permanently removes the draft purchase order and its lines."
                  actionLabel="Delete"
                  onConfirm={() =>
                    run(async () => {
                      const res = await deletePurchaseOrder(po.id)
                      if (res.ok) router.push('/dashboard/purchasing')
                      return res
                    }, 'Order deleted')
                  }
                />
              </>
            )}
            {canReceive && (
              <Button onClick={() => setReceiving((r) => !r)} disabled={isPending} variant={receiving ? 'outline' : 'default'}>
                <PackageCheck className="mr-2 h-4 w-4" />
                {receiving ? 'Cancel receiving' : 'Receive'}
              </Button>
            )}
            {po.status !== 'received' && po.status !== 'cancelled' && (
              <ConfirmButton
                trigger={
                  <Button variant="outline" disabled={isPending}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel order
                  </Button>
                }
                title="Cancel this purchase order?"
                description="The order will be marked cancelled and excluded from the job's committed cost."
                actionLabel="Cancel order"
                onConfirm={() => run(() => cancelPurchaseOrder(po.id), 'Order cancelled')}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lines */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {receiving ? 'Record received quantities' : 'Order lines'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lines on this order yet.</p>
              ) : receiving ? (
                <ReceiveLines poId={po.id} lines={lines} isPending={isPending} run={run} onDone={() => setReceiving(false)} />
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      editable={isDraft}
                      isPending={isPending}
                      run={run}
                    />
                  ))}
                </div>
              )}

              {isDraft && !receiving && <AddLineForm poId={po.id} isPending={isPending} run={run} />}

              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Order total (ex-VAT)</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatPence(po.subtotal_pence)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Supplier */}
              <div className="space-y-1.5">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Supplier
                </span>
                {isDraft ? (
                  <Select
                    value={po.supplier_id ?? 'unassigned'}
                    onValueChange={(v) =>
                      run(
                        () => setPurchaseOrderSupplier(po.id, v === 'unassigned' ? null : v),
                        'Supplier updated',
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium text-foreground">{po.supplier?.name ?? '—'}</span>
                )}
              </div>

              {po.order_email && (
                <div className="flex items-start justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Order email
                  </span>
                  <span className="text-right font-medium text-foreground break-all">{po.order_email}</span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Hammer className="h-4 w-4" />
                  Job
                </span>
                {po.job ? (
                  <Link
                    href={`/dashboard/jobs/${po.job.id}`}
                    className="font-medium text-foreground hover:underline text-right"
                  >
                    {po.job.job_number ?? po.job.title ?? 'View job'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-medium text-foreground">{po.branch?.name ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Raised</span>
                <span className="font-medium text-foreground">{formatDateUK(po.created_at)}</span>
              </div>
              {po.sent_at && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="font-medium text-foreground">{formatDateUK(po.sent_at)}</span>
                </div>
              )}
              {po.received_at && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Received</span>
                  <span className="font-medium text-foreground">{formatDateUK(po.received_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => void

function LineRow({
  line,
  editable,
  isPending,
  run,
}: {
  line: PurchaseOrderLine
  editable: boolean
  isPending: boolean
  run: RunFn
}) {
  const [description, setDescription] = useState(line.description)
  const [productCode, setProductCode] = useState(line.product_code ?? '')
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [unitCost, setUnitCost] = useState(poundsFromPence(line.unit_cost_pence))

  if (!editable) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{line.description}</p>
          <p className="text-xs text-muted-foreground">
            {line.product_code ? `${line.product_code} · ` : ''}
            {line.quantity} {line.unit} @ {formatPence(line.unit_cost_pence)}
          </p>
        </div>
        <span className="font-mono text-sm tabular-nums">{formatPence(line.line_total_pence)}</span>
      </div>
    )
  }

  function save(patch: Parameters<typeof updatePurchaseOrderLine>[1]) {
    run(() => updatePurchaseOrderLine(line.id, patch), 'Line updated')
  }

  return (
    <div className="grid grid-cols-12 gap-2 rounded-md border border-border p-3">
      <div className="col-span-12 sm:col-span-6">
        <Label className="sr-only">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== line.description && save({ description })}
          placeholder="Description"
          disabled={isPending}
        />
        <Input
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          onBlur={() => productCode !== (line.product_code ?? '') && save({ productCode })}
          placeholder="Product code"
          className="mt-2 h-8 text-xs"
          disabled={isPending}
        />
      </div>
      <div className="col-span-3 sm:col-span-2">
        <Label className="sr-only">Qty</Label>
        <Input
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => Number(quantity) !== Number(line.quantity) && save({ quantity: Number(quantity) })}
          disabled={isPending}
        />
      </div>
      <div className="col-span-5 sm:col-span-3">
        <Label className="sr-only">Unit cost</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-muted-foreground">£</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            onBlur={() =>
              penceFromPounds(unitCost) !== line.unit_cost_pence &&
              save({ unitCostPence: penceFromPounds(unitCost) })
            }
            className="pl-6"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="col-span-4 flex items-center justify-end sm:col-span-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => run(() => removePurchaseOrderLine(line.id), 'Line removed')}
          disabled={isPending}
          aria-label="Remove line"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function AddLineForm({ poId, isPending, run }: { poId: string; isPending: boolean; run: RunFn }) {
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('0.00')

  function add() {
    if (!description.trim()) {
      toast.error('Enter a description')
      return
    }
    run(async () => {
      const res = await addPurchaseOrderLine(poId, {
        description,
        quantity: Number(quantity),
        unitCostPence: penceFromPounds(unitCost),
      })
      if (res.ok) {
        setDescription('')
        setQuantity('1')
        setUnitCost('0.00')
      }
      return res
    }, 'Line added')
  }

  return (
    <div className="grid grid-cols-12 gap-2 rounded-md border border-dashed border-border p-3">
      <div className="col-span-12 sm:col-span-6">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a line item..."
          disabled={isPending}
        />
      </div>
      <div className="col-span-3 sm:col-span-2">
        <Input
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={isPending}
          aria-label="Quantity"
        />
      </div>
      <div className="col-span-5 sm:col-span-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-muted-foreground">£</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className="pl-6"
            disabled={isPending}
            aria-label="Unit cost"
          />
        </div>
      </div>
      <div className="col-span-4 flex items-center justify-end sm:col-span-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={add} disabled={isPending} aria-label="Add line">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function ReceiveLines({
  poId,
  lines,
  isPending,
  run,
  onDone,
}: {
  poId: string
  lines: PurchaseOrderLine[]
  isPending: boolean
  run: RunFn
  onDone: () => void
}) {
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.quantity_received || l.quantity)])),
  )

  function saveReceipt() {
    const receipts = lines.map((l) => ({
      lineId: l.id,
      quantityReceived: Number(received[l.id] ?? 0),
    }))
    run(async () => {
      const res = await receivePurchaseOrder(poId, receipts)
      if (res.ok) onDone()
      return res
    }, 'Receipt recorded')
  }

  return (
    <div className="space-y-2">
      {lines.map((l) => (
        <div key={l.id} className="grid grid-cols-12 items-center gap-2 rounded-md border border-border p-3">
          <div className="col-span-7 min-w-0">
            <p className="truncate font-medium leading-tight">{l.description}</p>
            <p className="text-xs text-muted-foreground">
              Ordered {l.quantity} {l.unit}
            </p>
          </div>
          <div className="col-span-5">
            <Label className="sr-only">Received quantity</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={received[l.id] ?? ''}
              onChange={(e) => setReceived((r) => ({ ...r, [l.id]: e.target.value }))}
              disabled={isPending}
            />
          </div>
        </div>
      ))}
      <Button onClick={saveReceipt} disabled={isPending} className="w-full">
        <PackageCheck className="mr-2 h-4 w-4" />
        Save receipt
      </Button>
    </div>
  )
}

function ConfirmButton({
  trigger,
  title,
  description,
  actionLabel,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

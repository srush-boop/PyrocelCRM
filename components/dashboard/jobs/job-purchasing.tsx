'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, Sparkles, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { purchaseOrderStatusMeta } from '@/lib/jobs/purchasing'
import { generatePurchaseOrdersForJob } from '@/app/(dashboard)/dashboard/purchasing/actions'
import type { PurchaseOrder } from '@/lib/types/database'

interface Props {
  jobId: string
  pendingSupplierCount: number
  orders: (PurchaseOrder & {
    lines?: { id: string; quantity: number; quantity_received: number }[]
  })[]
}

export function JobPurchasing({ jobId, pendingSupplierCount, orders }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function generate() {
    startTransition(async () => {
      const res = await generatePurchaseOrdersForJob(jobId)
      if (res.ok) {
        toast.success(`${res.created} draft order${res.created === 1 ? '' : 's'} created`)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not generate orders')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          Purchasing
        </CardTitle>
        {pendingSupplierCount > 0 && (
          <Button size="sm" onClick={generate} disabled={isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate {pendingSupplierCount} draft PO{pendingSupplierCount === 1 ? '' : 's'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-pretty">
            {pendingSupplierCount > 0
              ? 'This job has quoted parts ready to order. Generate draft purchase orders grouped by supplier, then review and send them.'
              : 'No orderable parts found on the source quote, and no purchase orders raised yet.'}
          </p>
        ) : (
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
        )}

        {orders.length > 0 && pendingSupplierCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {pendingSupplierCount} more supplier{pendingSupplierCount === 1 ? '' : 's'} on the quote can still be ordered.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

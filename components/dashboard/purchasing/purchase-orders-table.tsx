'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ShoppingCart } from 'lucide-react'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { PURCHASE_ORDER_STATUSES, purchaseOrderStatusMeta } from '@/lib/jobs/purchasing-shared'
import type { PurchaseOrder } from '@/lib/types/database'

export function PurchaseOrdersTable({ orders }: { orders: PurchaseOrder[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [supplier, setSupplier] = useState('all')

  const suppliers = useMemo(() => {
    const map = new Map<string, string>()
    for (const po of orders) {
      if (po.supplier?.id && po.supplier.name) map.set(po.supplier.id, po.supplier.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((po) => {
      if (status !== 'all' && po.status !== status) return false
      if (supplier !== 'all' && po.supplier?.id !== supplier) return false
      if (!q) return true
      return (
        (po.po_number ?? '').toLowerCase().includes(q) ||
        (po.supplier?.name ?? '').toLowerCase().includes(q) ||
        (po.job?.job_number ?? '').toLowerCase().includes(q) ||
        (po.job?.title ?? '').toLowerCase().includes(q)
      )
    })
  }, [orders, search, status, supplier])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PURCHASE_ORDER_STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {suppliers.length > 0 && (
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No purchase orders found</p>
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? 'Generate draft orders from a job to get started.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((po) => {
                const statusMeta = purchaseOrderStatusMeta(po.status)
                return (
                  <TableRow
                    key={po.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/purchasing/${po.id}`)}
                  >
                    <TableCell className="font-medium">{po.po_number ?? '—'}</TableCell>
                    <TableCell>
                      {po.supplier?.name ?? (
                        <span className="text-amber-700 dark:text-amber-300">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {po.job ? (
                        <>
                          <div className="text-sm">{po.job.title ?? 'Job'}</div>
                          <div className="text-xs text-muted-foreground">{po.job.job_number ?? '—'}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(statusMeta.badgeClass)}>
                        {statusMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {po.line_count ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPence(po.subtotal_pence)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateUK(po.created_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

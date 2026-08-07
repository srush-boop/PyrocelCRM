'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ShoppingCart, X } from 'lucide-react'
import { GridSearch } from '@/components/dashboard/grid-header'
import { FilterMultiSelect } from '@/components/dashboard/leave-summary/filter-multi-select'
import { CreatePurchaseOrderDialog } from './create-purchase-order-dialog'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import { PURCHASE_ORDER_STATUSES, purchaseOrderStatusMeta } from '@/lib/jobs/purchasing-shared'
import type { PurchaseOrder } from '@/lib/types/database'

interface Option {
  id: string
  name: string
}

export function PurchaseOrdersTable({
  orders,
  suppliers,
  branches,
  defaultBranchId,
}: {
  orders: PurchaseOrder[]
  suppliers: Option[]
  branches: Option[]
  defaultBranchId: string | null
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const [supplierIds, setSupplierIds] = useState<string[]>([])
  const [jobIds, setJobIds] = useState<string[]>([])
  const [branchIds, setBranchIds] = useState<string[]>([])

  // Filter option lists are derived from the orders actually present, so the
  // facets never offer a value that would return nothing.
  const statusOptions = useMemo<Option[]>(() => {
    const present = new Set(orders.map((o) => o.status))
    return PURCHASE_ORDER_STATUSES.filter((s) => present.has(s.key)).map((s) => ({
      id: s.key,
      name: s.label,
    }))
  }, [orders])

  const supplierOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>()
    for (const po of orders) {
      if (po.supplier?.id && po.supplier.name) map.set(po.supplier.id, po.supplier.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [orders])

  const jobOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>()
    for (const po of orders) {
      if (po.job?.id) {
        map.set(po.job.id, po.job.job_number ?? po.job.title ?? 'Job')
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [orders])

  const branchOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>()
    for (const po of orders) {
      if (po.branch?.id && po.branch.name) map.set(po.branch.id, po.branch.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((po) => {
      if (statuses.length > 0 && !statuses.includes(po.status)) return false
      if (supplierIds.length > 0 && !(po.supplier?.id && supplierIds.includes(po.supplier.id)))
        return false
      if (jobIds.length > 0 && !(po.job?.id && jobIds.includes(po.job.id))) return false
      if (branchIds.length > 0 && !(po.branch?.id && branchIds.includes(po.branch.id))) return false
      if (!q) return true
      // Free-text search spans every visible field.
      const hay = [
        po.po_number,
        po.supplier?.name,
        po.job?.job_number,
        po.job?.title,
        po.branch?.name,
        purchaseOrderStatusMeta(po.status).label,
        po.notes,
        formatPence(po.subtotal_pence),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [orders, search, statuses, supplierIds, jobIds, branchIds])

  const activeFilters =
    statuses.length + supplierIds.length + jobIds.length + branchIds.length + (search ? 1 : 0)

  function clearFilters() {
    setSearch('')
    setStatuses([])
    setSupplierIds([])
    setJobIds([])
    setBranchIds([])
  }

  const showBranchColumn = branchOptions.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <GridSearch
          value={search}
          onChange={setSearch}
          placeholder="Search all fields…"
          className="w-full sm:max-w-xs"
        />
        {statusOptions.length > 0 && (
          <FilterMultiSelect
            label="Status"
            options={statusOptions}
            selected={statuses}
            onChange={setStatuses}
          />
        )}
        {supplierOptions.length > 0 && (
          <FilterMultiSelect
            label="Supplier"
            options={supplierOptions}
            selected={supplierIds}
            onChange={setSupplierIds}
          />
        )}
        {jobOptions.length > 0 && (
          <FilterMultiSelect
            label="Job"
            options={jobOptions}
            selected={jobIds}
            onChange={setJobIds}
          />
        )}
        {branchOptions.length > 0 && (
          <FilterMultiSelect
            label="Branch"
            options={branchOptions}
            selected={branchIds}
            onChange={setBranchIds}
          />
        )}
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
        <div className="ml-auto">
          <CreatePurchaseOrderDialog
            suppliers={suppliers}
            branches={branches}
            defaultBranchId={defaultBranchId}
          />
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No purchase orders found</p>
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? 'Create an order above, or generate draft orders from a job.'
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
                {showBranchColumn && <TableHead>Branch</TableHead>}
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
                          <div className="text-xs text-muted-foreground">
                            {po.job.job_number ?? '—'}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {showBranchColumn && (
                      <TableCell className="text-sm text-muted-foreground">
                        {po.branch?.name ?? '—'}
                      </TableCell>
                    )}
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

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReceiptText } from 'lucide-react'
import type { InvoiceStatus } from '@/lib/types/database'
import { formatPence, INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import type { InvoiceRow } from '@/app/(dashboard)/dashboard/invoices/page'
import { cn } from '@/lib/utils'
import { InvoiceQuickActions } from '@/components/dashboard/invoices/invoice-quick-actions'
import type { Invoice } from '@/lib/types/database'

type Filter = 'all' | InvoiceStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

function statusClasses(status: InvoiceStatus): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'issued':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'void':
      return 'bg-muted text-muted-foreground'
    default:
      return 'bg-amber-100 text-amber-800 border-amber-200'
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function InvoicesTable({
  invoices,
  canEdit,
}: {
  invoices: InvoiceRow[]
  canEdit: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invoices.length, draft: 0, issued: 0, paid: 0, void: 0 }
    for (const inv of invoices) c[inv.status] += 1
    return c
  }, [invoices])

  const rows = useMemo(
    () => (filter === 'all' ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  )

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
              {f.label}
              <span className="text-xs text-muted-foreground">{counts[f.value]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <ReceiptText className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No invoices here yet</p>
          <p className="text-sm text-muted-foreground">
            Raise one from reviewed chargeable calls to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Bill to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="hover:underline">
                      {inv.invoice_number}
                    </Link>
                    {/* Site name as a muted description sub-line. */}
                    {inv.site?.name && (
                      <p className="text-xs font-normal text-muted-foreground">{inv.site.name}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {inv.billing_account?.name || inv.bill_to_name || inv.client?.name || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn('font-medium', statusClasses(inv.status))}
                      >
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                      {inv.sent_at && (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          Sent
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issue_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPence(inv.total_pence)}
                  </TableCell>
                  <TableCell className="text-right">
                    <InvoiceQuickActions invoice={inv as unknown as Invoice} canEdit={canEdit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

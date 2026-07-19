'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { ReceiptText, FileCheck2, Send, Loader2, X } from 'lucide-react'
import type { InvoiceStatus } from '@/lib/types/database'
import { formatPence, INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import type { InvoiceRow } from '@/app/(dashboard)/dashboard/invoices/page'
import { cn } from '@/lib/utils'
import { InvoiceQuickActions } from '@/components/dashboard/invoices/invoice-quick-actions'
import { bulkIssueInvoices, bulkSendInvoices } from '@/lib/actions/invoices'
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

// A draft (non credit-note) invoice can be bulk issued/emailed.
function isSelectable(inv: InvoiceRow): boolean {
  return inv.status === 'draft' && inv.document_type !== 'credit_note'
}

export function InvoicesTable({
  invoices,
  canEdit,
}: {
  invoices: InvoiceRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSend, setConfirmSend] = useState(false)
  const [pending, startTransition] = useTransition()

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invoices.length, draft: 0, issued: 0, paid: 0, void: 0 }
    for (const inv of invoices) c[inv.status] += 1
    return c
  }, [invoices])

  const rows = useMemo(
    () => (filter === 'all' ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  )

  // Only drafts in the current view are eligible for bulk actions.
  const selectableRows = useMemo(() => rows.filter(isSelectable), [rows])
  // Show the select column only when the user can act and drafts are in view.
  const showSelectColumn = canEdit && selectableRows.length > 0

  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id))
  const selectedRows = useMemo(
    () => invoices.filter((i) => selected.has(i.id)),
    [invoices, selected],
  )

  const changeFilter = (v: Filter) => {
    setFilter(v)
    setSelected(new Set())
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected((prev) => {
      if (selectableRows.every((r) => prev.has(r.id))) {
        const next = new Set(prev)
        selectableRows.forEach((r) => next.delete(r.id))
        return next
      }
      const next = new Set(prev)
      selectableRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const runIssue = () => {
    const ids = selectedRows.map((r) => r.id)
    startTransition(async () => {
      const { ok, failures } = await bulkIssueInvoices(ids)
      if (ok > 0) toast.success(`Issued ${ok} invoice${ok === 1 ? '' : 's'}`)
      if (failures.length > 0) {
        toast.error(
          `${failures.length} could not be issued: ${failures[0].error}`,
        )
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  const runSend = () => {
    const ids = selectedRows.map((r) => r.id)
    setConfirmSend(false)
    startTransition(async () => {
      const { ok, failures } = await bulkSendInvoices(ids)
      if (ok > 0) toast.success(`Emailed ${ok} invoice${ok === 1 ? '' : 's'} to clients`)
      if (failures.length > 0) {
        toast.error(`${failures.length} could not be sent: ${failures[0].error}`)
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
              {f.label}
              <span className="text-xs text-muted-foreground">{counts[f.value]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Sticky bulk-action bar, shown once one or more drafts are selected. */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-muted-foreground"
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runIssue} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="mr-2 h-4 w-4" />
              )}
              Issue
            </Button>
            <Button size="sm" onClick={() => setConfirmSend(true)} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Issue &amp; email
            </Button>
          </div>
        </div>
      )}

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
                {showSelectColumn && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all draft invoices"
                    />
                  </TableHead>
                )}
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
                <TableRow key={inv.id} data-state={selected.has(inv.id) ? 'selected' : undefined}>
                  {showSelectColumn && (
                    <TableCell>
                      {isSelectable(inv) ? (
                        <Checkbox
                          checked={selected.has(inv.id)}
                          onCheckedChange={() => toggle(inv.id)}
                          aria-label={`Select invoice ${inv.invoice_number}`}
                        />
                      ) : null}
                    </TableCell>
                  )}
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

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Email {selected.size} invoice{selected.size === 1 ? '' : 's'} to clients?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each draft is issued (assigning issue and due dates) and its PDF emailed to the
              billing account&apos;s invoice email. Once sent, invoices are locked and can no longer
              be edited. Any without an invoice email will be skipped and reported.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                runSend()
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Issue &amp; email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

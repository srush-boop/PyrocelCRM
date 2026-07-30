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
import { ReceiptText, FileCheck2, Send, Loader2, X, FileSpreadsheet } from 'lucide-react'
import type { InvoiceStatus } from '@/lib/types/database'
import { formatPence, INVOICE_STATUS_LABELS } from '@/lib/billing/invoices'
import type { InvoiceRow } from '@/app/(dashboard)/dashboard/invoices/page'
import { cn } from '@/lib/utils'
import { InvoiceQuickActions } from '@/components/dashboard/invoices/invoice-quick-actions'
import {
  InvoicesFilters,
  EMPTY_INVOICE_FILTERS,
  type InvoiceFilterState,
} from '@/components/dashboard/invoices/invoices-filters'
import type { MultiSelectOption } from '@/components/dashboard/calendar/multi-select-filter'
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

// The "Bill to" label used in both the table and free-text search.
function billToLabel(inv: InvoiceRow): string {
  return inv.billing_account?.name || inv.bill_to_name || inv.client?.name || ''
}

// Whether a row satisfies every active filter dimension. Within a dimension the
// selected values are OR-ed; across dimensions they are AND-ed. An empty
// dimension is ignored (no filtering).
function matchesFilters(inv: InvoiceRow, f: InvoiceFilterState): boolean {
  // Free-text search across the fields a user is likely to look up.
  const q = f.search.trim().toLowerCase()
  if (q) {
    const haystack = [
      inv.invoice_number,
      billToLabel(inv),
      inv.bill_to_email,
      inv.site?.name,
      inv.client?.name,
      inv.billing_account?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(q)) return false
  }

  if (f.docTypes.length > 0 && !f.docTypes.includes(inv.document_type)) return false
  if (
    f.financialYears.length > 0 &&
    !f.financialYears.includes(inv.financial_year != null ? String(inv.financial_year) : '')
  ) {
    return false
  }
  if (f.billingAccounts.length > 0) {
    const name = inv.billing_account?.name
    if (!name || !f.billingAccounts.includes(name)) return false
  }
  if (f.sites.length > 0) {
    const name = inv.site?.name
    if (!name || !f.sites.includes(name)) return false
  }
  if (f.clients.length > 0) {
    const name = inv.client?.name
    if (!name || !f.clients.includes(name)) return false
  }
  if (f.flags.length > 0) {
    const satisfies = f.flags.some((flag) => {
      switch (flag) {
        case 'sent':
          return !!inv.sent_at
        case 'unsent':
          return !inv.sent_at
        case 'sage_exported':
          return !!inv.sage_exported_at
        case 'sage_pending':
          return !inv.sage_exported_at
        default:
          return false
      }
    })
    if (!satisfies) return false
  }

  return true
}

// Derive the multi-select option lists (with counts) from the invoice rows.
function buildFilterOptions(invoices: InvoiceRow[]): {
  financialYearOptions: MultiSelectOption[]
  billingAccountOptions: MultiSelectOption[]
  siteOptions: MultiSelectOption[]
  clientOptions: MultiSelectOption[]
} {
  const years = new Map<string, number>()
  const accounts = new Map<string, number>()
  const sites = new Map<string, number>()
  const clients = new Map<string, number>()

  const bump = (m: Map<string, number>, key: string | null | undefined) => {
    if (!key) return
    m.set(key, (m.get(key) ?? 0) + 1)
  }

  for (const inv of invoices) {
    bump(years, inv.financial_year != null ? String(inv.financial_year) : null)
    bump(accounts, inv.billing_account?.name)
    bump(sites, inv.site?.name)
    bump(clients, inv.client?.name)
  }

  const toOptions = (m: Map<string, number>, sortDesc = false): MultiSelectOption[] =>
    [...m.entries()]
      .sort((a, b) => (sortDesc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
      .map(([value, count]) => ({ value, label: value, hint: String(count) }))

  return {
    financialYearOptions: toOptions(years, true),
    billingAccountOptions: toOptions(accounts),
    siteOptions: toOptions(sites),
    clientOptions: toOptions(clients),
  }
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
  const [filters, setFilters] = useState<InvoiceFilterState>(EMPTY_INVOICE_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSend, setConfirmSend] = useState(false)
  const [pending, startTransition] = useTransition()

  // Build the option lists for the multi-select dropdowns from the data, each
  // with a live count as a hint and sorted for easy scanning.
  const { financialYearOptions, billingAccountOptions, siteOptions, clientOptions } = useMemo(
    () => buildFilterOptions(invoices),
    [invoices],
  )

  // Everything except the status tab — used both for the tab counts and as the
  // base set the status tab narrows, so counts reflect the active filters.
  const preStatusRows = useMemo(() => invoices.filter((i) => matchesFilters(i, filters)), [invoices, filters])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: preStatusRows.length,
      draft: 0,
      issued: 0,
      paid: 0,
      void: 0,
    }
    for (const inv of preStatusRows) c[inv.status] += 1
    return c
  }, [preStatusRows])

  const rows = useMemo(
    () => (filter === 'all' ? preStatusRows : preStatusRows.filter((i) => i.status === filter)),
    [preStatusRows, filter],
  )

  const applyFilters = (next: InvoiceFilterState) => {
    setFilters(next)
    setSelected(new Set())
  }

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
      <InvoicesFilters
        value={filters}
        onChange={applyFilters}
        financialYearOptions={financialYearOptions}
        billingAccountOptions={billingAccountOptions}
        siteOptions={siteOptions}
        clientOptions={clientOptions}
        resultCount={rows.length}
        totalCount={invoices.length}
      />

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
          {invoices.length === 0 ? (
            <>
              <p className="font-medium">No invoices here yet</p>
              <p className="text-sm text-muted-foreground">
                Raise one from reviewed chargeable calls to get started.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">No invoices match your filters</p>
              <p className="text-sm text-muted-foreground">
                Try clearing a filter or adjusting your search.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => applyFilters(EMPTY_INVOICE_FILTERS)}
              >
                Clear filters
              </Button>
            </>
          )}
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
                  <TableCell>{billToLabel(inv) || '—'}</TableCell>
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
                      {inv.sage_exported_at && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-teal-200 bg-teal-50 text-teal-700"
                        >
                          <FileSpreadsheet className="h-3 w-3" />
                          Sent to Sage
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

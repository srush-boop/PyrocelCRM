'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { GridViewsBar } from '@/components/dashboard/grid-views-bar'
import type { SavedGridView, SharedGridView } from '@/lib/types/database'
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
import {
  ReceiptText,
  FileCheck2,
  Send,
  Loader2,
  X,
  FileSpreadsheet,
  Undo2,
  Briefcase,
  RefreshCw,
  PenLine,
  Siren,
  ClipboardCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
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

// Any invoice not yet emailed (draft, or issued but unsent) can be bulk sent.
// Credit notes can't be emailed from the CRM.
function isSelectable(inv: InvoiceRow): boolean {
  if (inv.document_type === 'credit_note' || inv.sent_at) return false
  return inv.status === 'draft' || inv.status === 'issued'
}

const SEND_BATCH_SIZE = 10

// The "Bill to" label used in both the table and free-text search.
function billToLabel(inv: InvoiceRow): string {
  return inv.billing_account?.name || inv.bill_to_name || inv.client?.name || ''
}

type InvoiceSource = { key: string; label: string; icon: LucideIcon; className: string }

// Where an invoice was derived from, most specific first.
function invoiceSource(inv: InvoiceRow): InvoiceSource {
  if (inv.document_type === 'credit_note') {
    return { key: 'credit_note', label: 'Credit note', icon: Undo2, className: 'text-muted-foreground' }
  }
  if (inv.job_id) return { key: 'job', label: 'Job', icon: Briefcase, className: 'text-indigo-700' }
  if (inv.origin === 'recurring') {
    return { key: 'recurring', label: 'Recurring charge', icon: RefreshCw, className: 'text-teal-700' }
  }
  const calls = inv.calls ?? []
  if (calls.length === 0) {
    return { key: 'manual', label: 'Manual invoice', icon: PenLine, className: 'text-muted-foreground' }
  }
  const plural = calls.length > 1 ? ` ×${calls.length}` : ''
  if (calls.some((c) => c.is_emergency)) {
    return { key: 'emergency', label: `Emergency call${plural}`, icon: Siren, className: 'text-red-700' }
  }
  if (calls.every((c) => c.site_service_id)) {
    return { key: 'service', label: `Service call${plural}`, icon: ClipboardCheck, className: 'text-blue-700' }
  }
  return { key: 'reactive', label: `Reactive call${plural}`, icon: Wrench, className: 'text-amber-700' }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Issued (unpaid) and past its due date.
function isOverdue(inv: InvoiceRow, today: string): boolean {
  return inv.status === 'issued' && !!inv.due_date && inv.due_date.slice(0, 10) < today
}

// Credit notes reduce the running total.
function signedTotal(inv: InvoiceRow): number {
  return inv.document_type === 'credit_note' ? -Math.abs(inv.total_pence) : inv.total_pence
}

type Preset = { key: string; label: string; status: Filter; filters: Partial<InvoiceFilterState> }

// Preconfigured one-click views; users can save their own on top via Views.
const PRESETS: Preset[] = [
  { key: 'all', label: 'All invoices', status: 'all', filters: {} },
  { key: 'drafts', label: 'Drafts to issue', status: 'draft', filters: {} },
  { key: 'overdue', label: 'Overdue', status: 'all', filters: { flags: ['overdue'] } },
  { key: 'unsent', label: 'Issued, not sent', status: 'issued', filters: { flags: ['unsent'] } },
  { key: 'sage', label: 'Awaiting Sage', status: 'issued', filters: { flags: ['sage_pending'] } },
  { key: 'recurring', label: 'Recurring', status: 'all', filters: { sources: ['recurring'] } },
  {
    key: 'calls',
    label: 'Calls',
    status: 'all',
    filters: { sources: ['emergency', 'service', 'reactive'] },
  },
  { key: 'jobs', label: 'Jobs', status: 'all', filters: { sources: ['job'] } },
]

function presetState(p: Preset): InvoiceFilterState {
  return { ...EMPTY_INVOICE_FILTERS, ...p.filters }
}

// Restore a saved view, tolerating older blobs missing newer keys.
function normaliseSaved(f: Record<string, unknown>): { filters: InvoiceFilterState; status: Filter } {
  const arr = (k: keyof InvoiceFilterState) => (Array.isArray(f[k]) ? (f[k] as string[]) : [])
  const status = FILTERS.some((x) => x.value === f.status) ? (f.status as Filter) : 'all'
  return {
    status,
    filters: {
      search: typeof f.search === 'string' ? f.search : '',
      docTypes: arr('docTypes'),
      financialYears: arr('financialYears'),
      billingAccounts: arr('billingAccounts'),
      sites: arr('sites'),
      clients: arr('clients'),
      flags: arr('flags'),
      sources: arr('sources'),
    },
  }
}

// Whether a row satisfies every active filter dimension. Within a dimension the
// selected values are OR-ed; across dimensions they are AND-ed. An empty
// dimension is ignored (no filtering).
function matchesFilters(inv: InvoiceRow, f: InvoiceFilterState, today: string): boolean {
  if (f.sources.length > 0 && !f.sources.includes(invoiceSource(inv).key)) return false
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
      invoiceSource(inv).label,
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
        case 'overdue':
          return isOverdue(inv, today)
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
  header,
  banner,
  savedViews,
  sharedViews,
  currentUserId,
}: {
  invoices: InvoiceRow[]
  canEdit: boolean
  /** Page title + actions, rendered above the status infographics. */
  header?: ReactNode
  /** Optional callout rendered beneath the infographics. */
  banner?: ReactNode
  savedViews?: SavedGridView[]
  sharedViews?: SharedGridView[]
  currentUserId?: string
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [filters, setFilters] = useState<InvoiceFilterState>(EMPTY_INVOICE_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSend, setConfirmSend] = useState(false)
  // Ids the confirm dialog will send: the selection, or every unsent row in view.
  const [sendTargetIds, setSendTargetIds] = useState<string[]>([])
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const today = todayIso()

  const viewFilters = useMemo(
    () => ({ ...filters, status: filter }) as Record<string, unknown>,
    [filters, filter],
  )
  const isFiltered = filter !== 'all' || JSON.stringify(filters) !== JSON.stringify(EMPTY_INVOICE_FILTERS)
  const applyView = (f: Record<string, unknown>) => {
    const next = normaliseSaved(f)
    setFilters(next.filters)
    setFilter(next.status)
    setSelected(new Set())
  }
  const activePreset = PRESETS.find(
    (p) => p.status === filter && JSON.stringify(presetState(p)) === JSON.stringify(filters),
  )?.key

  // Build the option lists for the multi-select dropdowns from the data, each
  // with a live count as a hint and sorted for easy scanning.
  const { financialYearOptions, billingAccountOptions, siteOptions, clientOptions } = useMemo(
    () => buildFilterOptions(invoices),
    [invoices],
  )

  // Everything except the status tab — used both for the tab counts and as the
  // base set the status tab narrows, so counts reflect the active filters.
  const preStatusRows = useMemo(
    () => invoices.filter((i) => matchesFilters(i, filters, today)),
    [invoices, filters, today],
  )

  // Count + value per status for the header infographics (respects filters).
  const stats = useMemo(() => {
    const blank = () => ({ count: 0, value: 0 })
    const s = {
      all: blank(),
      draft: blank(),
      issued: blank(),
      overdue: blank(),
      paid: blank(),
      void: blank(),
    }
    for (const inv of preStatusRows) {
      const v = signedTotal(inv)
      s[inv.status].count += 1
      s[inv.status].value += v
      if (inv.status !== 'void') {
        s.all.count += 1
        s.all.value += v
      }
      if (isOverdue(inv, today)) {
        s.overdue.count += 1
        s.overdue.value += v
      }
    }
    return s
  }, [preStatusRows, today])

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
    const ids = selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
    if (ids.length === 0) {
      toast.info('No drafts in the selection to issue.')
      return
    }
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

  // Send in small batches so hundreds of invoices don't hit one request's
  // time limit, and so progress can be shown as it goes.
  const runSend = () => {
    const ids = sendTargetIds
    setConfirmSend(false)
    if (ids.length === 0) return
    setSendProgress({ done: 0, total: ids.length })
    startTransition(async () => {
      let ok = 0
      const failures: { invoiceId: string; error: string }[] = []
      for (let i = 0; i < ids.length; i += SEND_BATCH_SIZE) {
        const chunk = ids.slice(i, i + SEND_BATCH_SIZE)
        try {
          const res = await bulkSendInvoices(chunk)
          ok += res.ok
          failures.push(...res.failures)
        } catch {
          chunk.forEach((id) => failures.push({ invoiceId: id, error: 'Request failed' }))
        }
        setSendProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length })
      }
      if (ok > 0) toast.success(`Emailed ${ok} invoice${ok === 1 ? '' : 's'} to clients`)
      if (failures.length > 0) {
        const numberById = new Map(invoices.map((inv) => [inv.id, inv.invoice_number]))
        toast.error(
          `${failures.length} could not be sent. ${numberById.get(failures[0].invoiceId) ?? ''}: ${failures[0].error}`,
          { duration: 10000 },
        )
      }
      setSendProgress(null)
      setSelected(new Set())
      router.refresh()
    })
  }

  const statTiles: {
    key: string
    label: string
    stat: { count: number; value: number }
    tone: string
    bar: string
    onClick: () => void
    active: boolean
  }[] = [
    {
      key: 'all',
      label: 'Total (excl. void)',
      stat: stats.all,
      tone: 'text-foreground',
      bar: 'bg-foreground/70',
      onClick: () => changeFilter('all'),
      active: filter === 'all' && !filters.flags.includes('overdue'),
    },
    {
      key: 'draft',
      label: 'Draft',
      stat: stats.draft,
      tone: 'text-amber-700',
      bar: 'bg-amber-500',
      onClick: () => changeFilter('draft'),
      active: filter === 'draft',
    },
    {
      key: 'issued',
      label: 'Issued',
      stat: stats.issued,
      tone: 'text-blue-700',
      bar: 'bg-blue-500',
      onClick: () => changeFilter('issued'),
      active: filter === 'issued',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      stat: stats.overdue,
      tone: 'text-red-700',
      bar: 'bg-red-500',
      onClick: () => {
        setFilter('all')
        applyFilters({ ...filters, flags: ['overdue'] })
      },
      active: filters.flags.length === 1 && filters.flags[0] === 'overdue',
    },
    {
      key: 'paid',
      label: 'Paid',
      stat: stats.paid,
      tone: 'text-emerald-700',
      bar: 'bg-emerald-500',
      onClick: () => changeFilter('paid'),
      active: filter === 'paid',
    },
  ]
  const valueBase = Math.max(1, Math.abs(stats.all.value))

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {header}
        {/* Status infographics — live against the applied filters. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {statTiles.map((t) => {
            const share = t.key === 'all' ? 100 : Math.min(100, (Math.abs(t.stat.value) / valueBase) * 100)
            return (
              <button
                key={t.key}
                type="button"
                onClick={t.onClick}
                aria-pressed={t.active}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50',
                  t.active && 'border-primary/50 ring-1 ring-primary/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-xs font-medium', t.tone)}>{t.label}</span>
                  <span className="rounded bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {t.stat.count}
                  </span>
                </div>
                <span className="text-lg font-semibold leading-tight tabular-nums">
                  {formatPence(t.stat.value)}
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className={cn('block h-full rounded-full', t.bar)} style={{ width: `${share}%` }} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {banner}

      {/* Preconfigured views + saved/shared views. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick views">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={activePreset === p.key ? 'default' : 'outline'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => {
                setFilter(p.status)
                applyFilters(presetState(p))
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {currentUserId && (
          <div className="ml-auto">
            <GridViewsBar
              gridKey="invoices"
              filters={viewFilters}
              isFiltered={isFiltered}
              onApply={applyView}
              savedViews={savedViews ?? []}
              sharedViews={sharedViews ?? []}
              currentUserId={currentUserId}
            />
          </div>
        )}
      </div>

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

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {canEdit && selectableRows.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setSendTargetIds(selectableRows.map((r) => r.id))
              setConfirmSend(true)
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Send all unsent ({selectableRows.length})
          </Button>
        )}
      </div>

      {sendProgress && (
        <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-2.5" role="status">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending invoices
            </span>
            <span className="tabular-nums text-muted-foreground">
              {sendProgress.done} / {sendProgress.total}
            </span>
          </div>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary transition-all"
              style={{ width: `${(sendProgress.done / Math.max(1, sendProgress.total)) * 100}%` }}
            />
          </span>
        </div>
      )}

      {/* Sticky bulk-action bar, shown once one or more unsent invoices are selected. */}
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
            <Button
              size="sm"
              onClick={() => {
                setSendTargetIds(selectedRows.map((r) => r.id))
                setConfirmSend(true)
              }}
              disabled={pending}
            >
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
                      aria-label="Select all unsent invoices"
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
                <TableRow
                  key={inv.id}
                  data-state={selected.has(inv.id) ? 'selected' : undefined}
                  className="[&>td]:py-1"
                >
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
                  <TableCell className="max-w-72 font-medium">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="text-sm hover:underline">
                      {inv.invoice_number}
                    </Link>
                    {/* Source + site on one muted sub-line. */}
                    {(() => {
                      const source = invoiceSource(inv)
                      const Icon = source.icon
                      return (
                        <p className="flex min-w-0 items-center gap-1 text-xs leading-tight">
                          <span className={cn('flex shrink-0 items-center gap-1 font-medium', source.className)}>
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Source: </span>
                            {source.label}
                          </span>
                          {inv.site?.name && (
                            <span className="truncate font-normal text-muted-foreground">
                              {'· '}
                              {inv.site.name}
                            </span>
                          )}
                        </p>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm">{billToLabel(inv) || '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn('px-1.5 py-0 text-[11px] font-medium', statusClasses(inv.status))}
                      >
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                      {isOverdue(inv, today) && (
                        <Badge
                          variant="outline"
                          className="border-red-200 bg-red-50 px-1.5 py-0 text-[11px] text-red-700"
                        >
                          Overdue
                        </Badge>
                      )}
                      {inv.sent_at && (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[11px] text-emerald-700"
                        >
                          Sent
                        </Badge>
                      )}
                      {inv.sage_exported_at && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-teal-200 bg-teal-50 px-1.5 py-0 text-[11px] text-teal-700"
                          title="Sent to Sage"
                        >
                          <FileSpreadsheet className="h-3 w-3" />
                          Sage
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(inv.issue_date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(inv.due_date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">
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
              Email {sendTargetIds.length} invoice{sendTargetIds.length === 1 ? '' : 's'} to clients?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any drafts are issued first (assigning issue and due dates), then each PDF is emailed
              to the billing account&apos;s invoice email. Once sent, invoices are locked and can be
              pushed to Sage. Any that fail (e.g. no invoice email, missing nominal code) are
              skipped and reported.
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

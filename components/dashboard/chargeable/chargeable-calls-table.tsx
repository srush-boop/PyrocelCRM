'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle,
  Search,
  Coins,
  Wrench,
  ExternalLink,
  Loader2,
  Receipt,
  ChevronDown,
  AlertCircle,
  FileText,
  Clock,
  Pencil,
  Check,
  X,
  ClipboardCheck,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { setChargeReview } from '@/lib/actions/charge-review'
import { PoRequestLog } from '@/components/dashboard/chargeable/po-request-log'
import { ChargeableReviewDialog } from '@/components/dashboard/chargeable/chargeable-review-dialog'
import { GridViewsBar } from '@/components/dashboard/grid-views-bar'
import type { PurchaseOrderRequest, SavedGridView, SharedGridView } from '@/lib/types/database'

export interface ChargeableCall {
  id: string
  referenceNumber: string
  completedAt: string | null
  respondBy: string | null
  chargeReviewStatus: 'none' | 'pending' | 'reviewed'
  chargeReason: string | null
  chargeReviewedAt: string | null
  chargeInvoicedAt: string | null
  chargeable: boolean
  clientRef: string | null
  deadlineFailedReason: string | null
  deadlineFailedNote: string | null
  poNotRequired: boolean
  /** PO auto-imported from the site/system authorised-works authorisation at booking. */
  poAutoAuthorised: boolean
  siteName: string
  clientName: string
  serviceName: string
  systemName: string | null
  panelName: string | null
  engineerName: string
  engineerNotes: string | null
  reviewerName: string | null
  partsCount: number
  partsTotalPence: number
  poRequests: PurchaseOrderRequest[]
  hasContactEmail: boolean
  overdueAfterDays: number
  // Derived review facts (computed server-side; mirrored by computeGates)
  missedDeadline: boolean
  clientRequiresPo: boolean
  poRequired: boolean
  hasAuthorisedPo: boolean
  poReadyToReview: boolean
  followUpLogged: boolean
}

const REASON_LABELS: Record<string, string> = {
  service_default: 'Chargeable service',
  parts_added: 'Parts used',
  manual: 'Manual',
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

function isPoOverdue(call: ChargeableCall, overdueAfterDays: number): boolean {
  const pending = call.poRequests.filter((r) => !r.authorised_at && r.email_sent_at)
  if (pending.length === 0) return false
  const oldest = pending.reduce((a, b) =>
    new Date(a.email_sent_at!).getTime() < new Date(b.email_sent_at!).getTime() ? a : b,
  )
  const days = Math.floor((Date.now() - new Date(oldest.email_sent_at!).getTime()) / 86_400_000)
  return days >= overdueAfterDays
}

/** Has a PO been requested from the client (email sent) but not yet authorised? */
function hasPendingPoRequest(call: ChargeableCall): boolean {
  return call.poRequests.some((r) => !!r.email_sent_at && !r.authorised_at)
}

/** Status keys drive both the coloured badge and the status filter. */
type CallStatusKey =
  | 'awaiting'
  | 'po_requested'
  | 'po_overdue'
  | 'po_received'
  | 'reviewed'
  | 'invoiced'

interface CallStatus {
  key: CallStatusKey
  label: string
  icon: typeof Clock
  /** Tailwind classes for the badge (colour code). */
  className: string
}

/**
 * Single source of truth for a call's lifecycle status. Precedence:
 * invoiced → reviewed → PO received (authorised, ready to review) →
 * PO overdue → PO requested → awaiting review.
 */
function deriveCallStatus(call: ChargeableCall, overdueAfterDays: number): CallStatus {
  if (call.chargeInvoicedAt) {
    return {
      key: 'invoiced',
      label: 'Invoiced',
      icon: Receipt,
      className: 'bg-emerald-600 text-white hover:bg-emerald-600',
    }
  }
  if (call.chargeReviewStatus === 'reviewed') {
    return {
      key: 'reviewed',
      label: 'Reviewed',
      icon: Check,
      className: 'bg-slate-200 text-slate-700 hover:bg-slate-200',
    }
  }
  if (call.poReadyToReview) {
    return {
      key: 'po_received',
      label: 'PO received',
      icon: CheckCircle,
      className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    }
  }
  if (hasPendingPoRequest(call)) {
    if (isPoOverdue(call, overdueAfterDays)) {
      return {
        key: 'po_overdue',
        label: 'PO overdue',
        icon: AlertCircle,
        className: 'bg-red-100 text-red-700 hover:bg-red-100',
      }
    }
    return {
      key: 'po_requested',
      label: 'PO requested',
      icon: FileText,
      className: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
    }
  }
  return {
    key: 'awaiting',
    label: 'Awaiting review',
    icon: Clock,
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  }
}

/** Small inline editor for the client reference field. */
function InlineClientRef({ taskId, value }: { taskId: string; value: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const { error } = await setChargeReview(taskId, { kind: 'set_client_ref', clientRef: draft.trim() || null })
    setSaving(false)
    if (error) {
      toast.error(error)
    } else {
      toast.success('Client ref updated')
      setEditing(false)
      router.refresh()
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value ?? ''); setEditing(true) }}
        className="group inline-flex items-center gap-1.5 text-sm hover:underline"
      >
        <span className={value ? 'font-medium' : 'text-muted-foreground italic'}>
          {value || 'Add client ref…'}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-7 w-40 text-sm"
        placeholder="PO / quote ref"
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)} disabled={saving}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

type StatusFilter = 'pending' | 'po_requested' | 'po_received' | 'reviewed' | 'invoiced' | 'all'

export function ChargeableCallsTable({
  calls,
  overdueAfterDays = 14,
  initialReviewId = null,
  savedViews,
  sharedViews,
  currentUserId,
}: {
  calls: ChargeableCall[]
  overdueAfterDays?: number
  // When set (via ?review=<taskId>), opens the guided review dialog on mount —
  // used to deep-link from a call's report page into its review.
  initialReviewId?: string | null
  savedViews?: SavedGridView[]
  sharedViews?: SharedGridView[]
  currentUserId?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(
    initialReviewId && calls.some((c) => c.id === initialReviewId) ? initialReviewId : null,
  )

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [reasonFilter, setReasonFilter] = useState<string>('all')

  const showViews = !!currentUserId
  const filters = { search, statusFilter, reasonFilter }
  const isFiltered = search.trim() !== '' || statusFilter !== 'pending' || reasonFilter !== 'all'
  function applyFilters(f: Record<string, unknown>) {
    setSearch((f.search as string) ?? '')
    setStatusFilter((f.statusFilter as StatusFilter) ?? 'pending')
    setReasonFilter((f.reasonFilter as string) ?? 'all')
  }
  function handlePrint() {
    setTimeout(() => window.print(), 60)
  }

  const filtered = useMemo(() => {
    const rows = calls.filter((c) => {
      const isOpen = c.chargeReviewStatus === 'pending' && !c.chargeInvoicedAt
      if (statusFilter === 'pending' && !isOpen) return false
      if (statusFilter === 'po_requested' && !(isOpen && hasPendingPoRequest(c))) return false
      if (statusFilter === 'po_received' && !(isOpen && c.poReadyToReview)) return false
      if (statusFilter === 'reviewed' && (c.chargeReviewStatus !== 'reviewed' || !!c.chargeInvoicedAt)) return false
      if (statusFilter === 'invoiced' && !c.chargeInvoicedAt) return false
      if (reasonFilter !== 'all' && c.chargeReason !== reasonFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${c.referenceNumber} ${c.siteName} ${c.clientName} ${c.serviceName} ${c.engineerName} ${c.clientRef ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // Float "PO received — ready to review" calls to the top of the queue.
    return rows.sort((a, b) => Number(b.poReadyToReview) - Number(a.poReadyToReview))
  }, [calls, statusFilter, reasonFilter, search])

  const reviewCall = calls.find((c) => c.id === reviewId) ?? null

  const openCalls = calls.filter((c) => c.chargeReviewStatus === 'pending' && !c.chargeInvoicedAt)
  const pendingCount = openCalls.length
  const poRequestedCount = openCalls.filter((c) => hasPendingPoRequest(c)).length
  const poReceivedCount = openCalls.filter((c) => c.poReadyToReview).length
  const reviewedCount = calls.filter(
    (c) => c.chargeReviewStatus === 'reviewed' && !c.chargeInvoicedAt,
  ).length
  const invoicedCount = calls.filter((c) => !!c.chargeInvoicedAt).length
  const overdueCount = calls.filter((c) => isPoOverdue(c, overdueAfterDays)).length

  const STATUS_OPTIONS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'pending', label: 'Awaiting review', count: pendingCount },
    { value: 'po_requested', label: 'PO requested', count: poRequestedCount },
    { value: 'po_received', label: 'PO received', count: poReceivedCount },
    { value: 'reviewed', label: 'Reviewed', count: reviewedCount },
    { value: 'invoiced', label: 'Invoiced', count: invoicedCount },
    { value: 'all', label: 'All', count: calls.length },
  ]

  const runAction = (
    id: string,
    action:
      | { kind: 'reviewed' }
      | { kind: 'reopen' }
      | { kind: 'invoiced' }
      | { kind: 'uninvoiced' },
  ) => {
    setBusyId(id)
    startTransition(async () => {
      const { error } = await setChargeReview(id, action)
      setBusyId(null)
      if (error) {
        toast.error(error)
      } else {
        const msgs = {
          reviewed: 'Marked as reviewed',
          reopen: 'Review re-opened',
          invoiced: 'Marked as invoiced',
          uninvoiced: 'Invoiced status removed',
        }
        toast.success(msgs[action.kind])
        router.refresh()
      }
    })
  }

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardContent className="flex flex-col gap-4 p-4 md:p-6 print:p-0">
        {showViews && (
          <div className="no-print">
            <GridViewsBar
              gridKey="chargeable"
              filters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              savedViews={savedViews ?? []}
              sharedViews={sharedViews ?? []}
              currentUserId={currentUserId!}
              onPrint={handlePrint}
            />
          </div>
        )}
        {/* Filter row — mirrors defects table layout */}
        <div className="flex flex-col gap-3 no-print sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reference, site, client or service"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-2">
                    {o.label}
                    {o.count > 0 && (
                      <span className="tabular-nums text-muted-foreground text-xs">
                        ({o.count})
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              <SelectItem value="service_default">Chargeable service</SelectItem>
              <SelectItem value="parts_added">Parts used</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* PO overdue notice */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {overdueCount} {overdueCount === 1 ? 'call has' : 'calls have'} an overdue PO request
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Coins className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No chargeable calls found</p>
            <p className="text-sm text-muted-foreground">
              Completed chargeable calls will appear here for review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto no-print">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Reference</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Client Ref</TableHead>
                  <TableHead className="text-right">Parts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const rowBusy = busyId === c.id && isPending
                  const isExpanded = expandedId === c.id
                  const poOverdue = isPoOverdue(c, overdueAfterDays)
                  const hasPos = c.poRequests.length > 0
                  const authorisedPos = c.poRequests.filter((r) => !!r.authorised_at)
                  const status = deriveCallStatus(c, overdueAfterDays)

                  return (
                    <>
                      <TableRow
                        key={c.id}
                        className={
                          c.poReadyToReview
                            ? 'bg-emerald-50/70 hover:bg-emerald-50'
                            : poOverdue
                              ? 'bg-amber-50/60'
                              : isExpanded
                                ? 'bg-muted/30'
                                : undefined
                        }
                      >
                        {/* Expand toggle */}
                        <TableCell className="pr-0">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand PO log'}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </TableCell>

                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/dashboard/tasks/${c.id}`}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              {c.referenceNumber}
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                            {hasPos && (
                              <span
                                title={`${c.poRequests.length} PO request${c.poRequests.length === 1 ? '' : 's'}`}
                                className={`inline-flex items-center gap-0.5 text-xs ${
                                  poOverdue
                                    ? 'text-amber-600'
                                    : authorisedPos.length > 0
                                      ? 'text-emerald-600'
                                      : 'text-blue-500'
                                }`}
                              >
                                <FileText className="h-3 w-3" />
                                {poOverdue && <AlertCircle className="h-3 w-3" />}
                              </span>
                            )}
                          </div>
                          {c.poReadyToReview && (
                            <Badge className="mt-1 gap-1 bg-emerald-600 hover:bg-emerald-600 text-xs">
                              <CheckCircle className="h-3 w-3" />
                              PO received — ready to review
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell>{c.siteName}</TableCell>

                        <TableCell className="text-muted-foreground">
                          {c.clientName || '—'}
                        </TableCell>

                        <TableCell>{c.serviceName}</TableCell>

                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {c.completedAt ? formatDateUK(c.completedAt) : '—'}
                        </TableCell>

                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-sm">
                            {c.chargeReason === 'parts_added' ? (
                              <Wrench className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <Coins className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            {c.chargeReason ? (REASON_LABELS[c.chargeReason] ?? c.chargeReason) : '—'}
                          </span>
                        </TableCell>

                        <TableCell>
                          {c.clientRef ? (
                            <span className="font-medium">{c.clientRef}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right tabular-nums">
                          {c.partsCount > 0 ? (
                            <span>
                              {c.partsCount}
                              <span className="ml-1 text-xs text-muted-foreground">
                                {formatGBP(c.partsTotalPence)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge className={`gap-1 ${status.className}`}>
                            <status.icon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          {rowBusy ? (
                            <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                          ) : c.chargeInvoicedAt ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => runAction(c.id, { kind: 'uninvoiced' })}
                            >
                              Undo invoiced
                            </Button>
                          ) : c.chargeReviewStatus === 'reviewed' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => runAction(c.id, { kind: 'invoiced' })}
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                Mark invoiced
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => setReviewId(c.id)}
                              >
                                Re-review
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setReviewId(c.id)}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Review now
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail: client ref edit + PO log */}
                      {isExpanded && (
                        <TableRow key={`${c.id}-po`} className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={11} className="px-4 pb-4 pt-2">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-muted-foreground">Client ref / PO:</span>
                                <InlineClientRef taskId={c.id} value={c.clientRef} />
                              </div>
                              <PoRequestLog
                                taskId={c.id}
                                requests={c.poRequests}
                                hasContactEmail={c.hasContactEmail}
                                overdueAfterDays={overdueAfterDays}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Print-only view — reflects the current filters. */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">Chargeable calls</h1>
          <p className="mb-4 text-sm">
            {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All'}
            {reasonFilter !== 'all' ? ` · ${REASON_LABELS[reasonFilter] ?? reasonFilter}` : ''}
            {search ? ` · search: “${search}”` : ''} · {filtered.length} call
            {filtered.length === 1 ? '' : 's'}
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-2">Reference</th>
                <th className="py-1 pr-2">Site</th>
                <th className="py-1 pr-2">Client</th>
                <th className="py-1 pr-2">Service</th>
                <th className="py-1 pr-2">Completed</th>
                <th className="py-1 pr-2">Reason</th>
                <th className="py-1 pr-2">Client Ref</th>
                <th className="py-1 pr-2 text-right">Parts</th>
                <th className="py-1 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-1 pr-2 font-medium">{c.referenceNumber}</td>
                  <td className="py-1 pr-2">{c.siteName}</td>
                  <td className="py-1 pr-2">{c.clientName}</td>
                  <td className="py-1 pr-2">{c.serviceName}</td>
                  <td className="py-1 pr-2">
                    {c.completedAt ? formatDateUK(c.completedAt) : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {c.chargeReason ? (REASON_LABELS[c.chargeReason] ?? c.chargeReason) : '—'}
                  </td>
                  <td className="py-1 pr-2">{c.clientRef || '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {c.partsCount > 0 ? formatGBP(c.partsTotalPence) : '—'}
                  </td>
                  <td className="py-1 pr-2">{deriveCallStatus(c, overdueAfterDays).label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      {reviewCall && (
        <ChargeableReviewDialog
          call={reviewCall}
          open={!!reviewId}
          onOpenChange={(o) => {
            if (!o) setReviewId(null)
          }}
        />
      )}
    </Card>
  )
}

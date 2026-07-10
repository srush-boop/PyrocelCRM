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
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { setChargeReview } from '@/lib/actions/charge-review'
import { PoRequestLog } from '@/components/dashboard/chargeable/po-request-log'
import type { PurchaseOrderRequest } from '@/lib/types/database'

export interface ChargeableCall {
  id: string
  referenceNumber: string
  completedAt: string | null
  chargeReviewStatus: 'none' | 'pending' | 'reviewed'
  chargeReason: string | null
  chargeReviewedAt: string | null
  chargeInvoicedAt: string | null
  clientRef: string | null
  siteName: string
  clientName: string
  serviceName: string
  engineerName: string
  reviewerName: string | null
  partsCount: number
  partsTotalPence: number
  poRequests: PurchaseOrderRequest[]
  hasContactEmail: boolean
  overdueAfterDays: number
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

type StatusFilter = 'pending' | 'reviewed' | 'invoiced' | 'all'

export function ChargeableCallsTable({
  calls,
  overdueAfterDays = 14,
}: {
  calls: ChargeableCall[]
  overdueAfterDays?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [reasonFilter, setReasonFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (statusFilter === 'pending' && (c.chargeReviewStatus !== 'pending' || !!c.chargeInvoicedAt)) return false
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
  }, [calls, statusFilter, reasonFilter, search])

  const pendingCount = calls.filter(
    (c) => c.chargeReviewStatus === 'pending' && !c.chargeInvoicedAt,
  ).length
  const reviewedCount = calls.filter(
    (c) => c.chargeReviewStatus === 'reviewed' && !c.chargeInvoicedAt,
  ).length
  const invoicedCount = calls.filter((c) => !!c.chargeInvoicedAt).length
  const overdueCount = calls.filter((c) => isPoOverdue(c, overdueAfterDays)).length

  const STATUS_OPTIONS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'pending', label: 'Awaiting review', count: pendingCount },
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
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:p-6">
        {/* Filter row — mirrors defects table layout */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          <div className="overflow-x-auto">
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

                  return (
                    <>
                      <TableRow
                        key={c.id}
                        className={
                          poOverdue
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
                          {c.chargeInvoicedAt ? (
                            <Badge variant="default" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                              <Receipt className="h-3 w-3" />
                              Invoiced
                            </Badge>
                          ) : c.chargeReviewStatus === 'reviewed' ? (
                            <Badge variant="secondary">
                              Reviewed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Awaiting review
                            </Badge>
                          )}
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
                                onClick={() => runAction(c.id, { kind: 'reopen' })}
                              >
                                Re-open
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => runAction(c.id, { kind: 'reviewed' })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Mark reviewed
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
      </CardContent>
    </Card>
  )
}

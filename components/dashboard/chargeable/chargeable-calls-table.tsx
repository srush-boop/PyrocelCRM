'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
  Filter,
  X,
  FileText,
  Clock,
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
  /** PO requests logged against this call */
  poRequests: PurchaseOrderRequest[]
  /** Whether the site/client has a contact email */
  hasContactEmail: boolean
  /** Days after which a PO request is overdue */
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

type TabValue = 'pending' | 'reviewed' | 'invoiced' | 'all'

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

  // Filters
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabValue>('pending')
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const pendingCount = calls.filter(
    (c) => c.chargeReviewStatus === 'pending' && !c.chargeInvoicedAt,
  ).length
  const reviewedCount = calls.filter(
    (c) => c.chargeReviewStatus === 'reviewed' && !c.chargeInvoicedAt,
  ).length
  const invoicedCount = calls.filter((c) => !!c.chargeInvoicedAt).length
  const overdueCount = calls.filter((c) => isPoOverdue(c, overdueAfterDays)).length

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      // Tab filter
      if (tab === 'pending' && (c.chargeReviewStatus !== 'pending' || !!c.chargeInvoicedAt)) return false
      if (tab === 'reviewed' && (c.chargeReviewStatus !== 'reviewed' || !!c.chargeInvoicedAt)) return false
      if (tab === 'invoiced' && !c.chargeInvoicedAt) return false
      // Reason filter
      if (reasonFilter !== 'all' && c.chargeReason !== reasonFilter) return false
      // Search
      if (search) {
        const q = search.toLowerCase()
        const hay =
          `${c.referenceNumber} ${c.siteName} ${c.clientName} ${c.serviceName} ${c.engineerName} ${c.clientRef ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [calls, tab, search, reasonFilter])

  const hasActiveFilters = reasonFilter !== 'all' || search.length > 0

  const clearFilters = () => {
    setSearch('')
    setReasonFilter('all')
  }

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
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Calls for review</CardTitle>
            <CardDescription>
              {filtered.length} {filtered.length === 1 ? 'call' : 'calls'}
              {overdueCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {overdueCount} PO overdue
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search calls..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge className="ml-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center">
                  !
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Expandable filter row */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap items-end gap-4 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-xs">Charge reason</Label>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="h-8 text-sm">
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
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground h-8"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="pt-2">
          <TabsList>
            <TabsTrigger value="pending">
              Awaiting review
              {pendingCount > 0 && (
                <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs px-1.5">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed
              {reviewedCount > 0 && (
                <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs px-1.5">
                  {reviewedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoiced">
              Invoiced
              {invoicedCount > 0 && (
                <Badge className="ml-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs px-1.5">
                  {invoicedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All ({calls.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Coins className="h-8 w-8" />
            <p className="text-sm">
              No chargeable calls {tab === 'pending' ? 'awaiting review' : tab === 'invoiced' ? 'invoiced yet' : 'to show'}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Reference</TableHead>
                  <TableHead>Site / Client</TableHead>
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
                          poOverdue ? 'bg-amber-50/60' : isExpanded ? 'bg-muted/30' : undefined
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

                        <TableCell>
                          <div className="font-medium">{c.siteName}</div>
                          {c.clientName && (
                            <div className="text-xs text-muted-foreground">{c.clientName}</div>
                          )}
                        </TableCell>

                        <TableCell className="text-sm">{c.serviceName}</TableCell>

                        <TableCell className="tabular-nums text-sm">
                          {c.completedAt ? formatDateUK(c.completedAt) : '-'}
                        </TableCell>

                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-sm">
                            {c.chargeReason === 'parts_added' ? (
                              <Wrench className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <Coins className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            {c.chargeReason ? REASON_LABELS[c.chargeReason] ?? c.chargeReason : '-'}
                          </span>
                        </TableCell>

                        <TableCell className="text-sm">
                          {c.clientRef ? (
                            <span className="font-medium text-foreground">{c.clientRef}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
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
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {c.chargeInvoicedAt ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                              <Receipt className="h-3 w-3" />
                              Invoiced
                            </Badge>
                          ) : c.chargeReviewStatus === 'reviewed' ? (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Reviewed
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
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

                      {/* Expanded PO request log row */}
                      {isExpanded && (
                        <TableRow key={`${c.id}-po`} className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={10} className="px-4 pb-4 pt-2">
                            <PoRequestLog
                              taskId={c.id}
                              requests={c.poRequests}
                              hasContactEmail={c.hasContactEmail}
                              overdueAfterDays={overdueAfterDays}
                            />
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

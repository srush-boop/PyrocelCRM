'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Package,
  ShoppingCart,
  Sparkles,
  User,
  Wrench,
  XCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { GridHeader, GridToolbar, GridSearch } from '@/components/dashboard/grid-header'
import { GridViewsBar } from '@/components/dashboard/grid-views-bar'
import { cn } from '@/lib/utils'
import { fixAttemptLabel } from '@/lib/follow-up'
import type { SavedGridView, SharedGridView } from '@/lib/types/database'
import {
  approveFollowUp,
  rejectFollowUp,
  reserveFollowUpPart,
  orderFollowUpPart,
  clearFollowUpPartAction,
} from '@/lib/actions/follow-up'

export interface PartStock {
  locationId: string
  locationName: string
  kind: string
  quantity: number
}

export interface HistoryEntry {
  taskId: string
  reference: string | null
  date: string | null
  engineer: string
  serviceName: string
  outcome: string | null
  notes: string | null
  fixAttempt: number
}

interface PartRow {
  id: string
  partId: string | null
  name: string
  sku: string | null
  description: string | null
  quantity: number
  action: 'none' | 'reserve' | 'order'
  locationId: string | null
  locationName: string | null
  reservationStatus: 'pending' | 'confirmed' | null
  locationRef: string | null
  stock: PartStock[]
}

export interface FollowUpReviewRow {
  id: string
  fixAttempt: number
  issueSummary: string
  /** AI brief of the works required, carried onto the created call's notes. */
  aiSummary: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  escalated: boolean
  resolvedAt: string | null
  createdAt: string
  proposedDate: string | null
  assignedEngineerId: string | null
  createdTaskId: string | null
  siteName: string
  requestedByName: string
  originalRef: string | null
  originalServiceName: string
  originalCompletedAt: string | null
  isEmergency: boolean
  history: HistoryEntry[]
  parts: PartRow[]
}

interface Props {
  rows: FollowUpReviewRow[]
  engineers: { id: string; name: string }[]
  locations: { id: string; name: string; kind: string }[]
  savedViews: SavedGridView[]
  sharedViews: SharedGridView[]
  currentUserId: string
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending review' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

interface FollowUpFilters {
  search: string
  status: string
}

const EMPTY_FILTERS: FollowUpFilters = { search: '', status: 'all' }

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusBadge(row: FollowUpReviewRow) {
  if (row.escalated && row.status === 'pending') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> Escalated
      </Badge>
    )
  }
  if (row.status === 'pending') {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending review</Badge>
  }
  return (
    <Badge variant="outline" className="capitalize">
      {row.status}
    </Badge>
  )
}

export function FollowUpsReview({
  rows,
  engineers,
  locations,
  savedViews,
  sharedViews,
  currentUserId,
}: Props) {
  const searchParams = useSearchParams()
  const preselect = searchParams.get('id')

  const [filters, setFilters] = useState<FollowUpFilters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(preselect ?? null)
  const [printMode, setPrintMode] = useState<'summary' | 'detailed'>('summary')

  useEffect(() => {
    if (preselect) setSelectedId(preselect)
  }, [preselect])

  const isFiltered = filters.search.trim() !== '' || filters.status !== 'all'

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filters.status === 'escalated') {
        if (!(r.escalated && r.status === 'pending')) return false
      } else if (filters.status !== 'all' && r.status !== filters.status) {
        return false
      }
      if (!q) return true
      return (
        r.siteName.toLowerCase().includes(q) ||
        r.issueSummary.toLowerCase().includes(q) ||
        r.requestedByName.toLowerCase().includes(q) ||
        (r.originalRef ?? '').toLowerCase().includes(q) ||
        r.originalServiceName.toLowerCase().includes(q)
      )
    })
  }, [rows, filters])

  const pendingCount = rows.filter((r) => r.status === 'pending').length
  const selected = rows.find((r) => r.id === selectedId) ?? null

  function handlePrint(mode: string) {
    setPrintMode(mode === 'detailed' ? 'detailed' : 'summary')
    setTimeout(() => window.print(), 60)
  }

  return (
    <div className="space-y-4">
      <GridHeader
        title="Follow-ups"
        description={
          pendingCount > 0
            ? `${pendingCount} awaiting review`
            : 'Review works flagged by engineers as unresolved.'
        }
        actions={
          <GridViewsBar
            gridKey="follow-ups"
            filters={filters as unknown as Record<string, unknown>}
            isFiltered={isFiltered}
            onApply={(f) => setFilters({ ...EMPTY_FILTERS, ...(f as Partial<FollowUpFilters>) })}
            savedViews={savedViews}
            sharedViews={sharedViews}
            currentUserId={currentUserId}
            onPrint={handlePrint}
            printModes={[
              { key: 'summary', label: 'Print summary table' },
              { key: 'detailed', label: 'Print detailed (with parts & history)' },
            ]}
          />
        }
      />

      <GridToolbar
        meta={`${filtered.length} of ${rows.length}`}
        className="no-print"
      >
        <GridSearch
          value={filters.search}
          onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Search site, issue, engineer or reference..."
        />
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </GridToolbar>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No follow-ups to review</p>
            <p className="text-sm text-muted-foreground">
              When an engineer flags further works required, it will appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="no-print">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    'cursor-pointer',
                    r.escalated && r.status === 'pending' && 'bg-destructive/5',
                  )}
                  onClick={() => setSelectedId(r.id)}
                >
                  <TableCell className="font-medium">{r.siteName}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.issueSummary}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.requestedByName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{fixAttemptLabel(r.fixAttempt)}</Badge>
                  </TableCell>
                  <TableCell>{statusBadge(r)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No follow-ups match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review follow-up</DialogTitle>
          </DialogHeader>
          {selected && (
            <FollowUpDetail
              row={selected}
              engineers={engineers}
              locations={locations}
              onDone={() => setSelectedId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Print-only view */}
      <FollowUpsPrintView rows={filtered} mode={printMode} filters={filters} />
    </div>
  )
}

/** Print-only markup (hidden on screen, shown by @media print). */
function FollowUpsPrintView({
  rows,
  mode,
  filters,
}: {
  rows: FollowUpReviewRow[]
  mode: 'summary' | 'detailed'
  filters: FollowUpFilters
}) {
  const statusLabel = STATUS_FILTERS.find((s) => s.value === filters.status)?.label ?? 'All'
  return (
    <div className="hidden print:block">
      <h1 className="text-xl font-bold">Follow-ups</h1>
      <p className="mb-4 text-sm">
        {statusLabel}
        {filters.search ? ` · search: “${filters.search}”` : ''} · {rows.length} record
        {rows.length === 1 ? '' : 's'}
      </p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2">Site</th>
            <th className="py-1 pr-2">Issue</th>
            <th className="py-1 pr-2">Raised by</th>
            <th className="py-1 pr-2">Attempt</th>
            <th className="py-1 pr-2">Status</th>
            <th className="py-1 pr-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b align-top">
              <td className="py-1 pr-2 font-medium">{r.siteName}</td>
              <td className="py-1 pr-2">
                {mode === 'detailed' ? r.issueSummary : r.issueSummary.slice(0, 80)}
                {mode === 'detailed' && r.parts.length > 0 && (
                  <div className="mt-1">
                    <strong>Parts:</strong>{' '}
                    {r.parts.map((p) => `${p.name} ×${p.quantity}`).join(', ')}
                  </div>
                )}
                {mode === 'detailed' && r.history.length > 0 && (
                  <div className="mt-1">
                    <strong>History:</strong>{' '}
                    {r.history
                      .map((h) => `${fixAttemptLabel(h.fixAttempt)} ${formatDate(h.date)}`)
                      .join(' → ')}
                  </div>
                )}
              </td>
              <td className="py-1 pr-2">{r.requestedByName}</td>
              <td className="py-1 pr-2">{fixAttemptLabel(r.fixAttempt)}</td>
              <td className="py-1 pr-2">
                {r.escalated && r.status === 'pending' ? 'Escalated' : r.status}
              </td>
              <td className="py-1 pr-2">{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function outcomeBadge(outcome: string | null) {
  if (outcome === 'pass') return <Badge className="bg-green-600 text-white hover:bg-green-600">Pass</Badge>
  if (outcome === 'fail') return <Badge variant="destructive">Fail</Badge>
  if (outcome === 'partial') return <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">Partial</Badge>
  return null
}

function FollowUpDetail({
  row,
  engineers,
  locations,
  onDone,
}: {
  row: FollowUpReviewRow
  engineers: { id: string; name: string }[]
  locations: { id: string; name: string; kind: string }[]
  onDone?: () => void
}) {
  const readOnly = row.status !== 'pending'
  const [date, setDate] = useState(row.proposedDate ?? '')
  const [engineerId, setEngineerId] = useState(row.assignedEngineerId ?? 'unassigned')
  const [pending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleApprove() {
    setError(null)
    if (!date) {
      setError('Choose a date for the follow-up call.')
      return
    }
    startTransition(async () => {
      const res = await approveFollowUp(row.id, {
        scheduledDate: date,
        assignedEngineerId: engineerId === 'unassigned' ? null : engineerId,
      })
      if (!res.ok) setError(res.error ?? 'Could not approve.')
      else onDone?.()
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectFollowUp(row.id, rejectReason)
      setRejectOpen(false)
      onDone?.()
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={cn(row.escalated && !readOnly && 'border-destructive')}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{row.siteName}</h2>
            <Badge variant="secondary">{fixAttemptLabel(row.fixAttempt)}</Badge>
            {row.isEmergency && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> First-time fix: NO
              </Badge>
            )}
            {row.escalated && !readOnly && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Escalated to Service Manager
              </Badge>
            )}
            {readOnly && (
              <Badge variant="outline" className="capitalize">
                {row.status}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Raised by {row.requestedByName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Original: {row.originalRef ?? row.originalServiceName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {formatDate(row.createdAt)}
            </span>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding issue</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{row.issueSummary}</p>
          </div>
          {row.aiSummary?.trim() && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI brief &mdash; passed to the call
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{row.aiSummary}</p>
            </div>
          )}
          {readOnly && row.createdTaskId && (
            <Link
              href={`/dashboard/tasks/${row.createdTaskId}`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View the follow-up call <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Issue history */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> Issue history
          </p>
          <ol className="relative space-y-4 border-l pl-5">
            {row.history.map((h) => (
              <li key={h.taskId} className="relative">
                <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{fixAttemptLabel(h.fixAttempt)}</span>
                  <span className="text-xs text-muted-foreground">{h.serviceName}</span>
                  {outcomeBadge(h.outcome)}
                  {h.reference && <span className="text-xs text-muted-foreground">{h.reference}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(h.date)} · {h.engineer}
                </p>
                {h.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{h.notes}</p>}
              </li>
            ))}
            {row.history.length === 0 && (
              <li className="text-sm text-muted-foreground">No prior visit detail available.</li>
            )}
          </ol>
        </CardContent>
      </Card>

      {/* Suggested parts */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4" /> Suggested parts
          </p>
          {row.parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parts were suggested by the engineer.</p>
          ) : (
            <ul className="space-y-3">
              {row.parts.map((p) => (
                <PartLineControl key={p.id} part={p} locations={locations} readOnly={readOnly} pending={pending} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Review actions */}
      {!readOnly && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="text-sm font-semibold">Approve &amp; book the follow-up call</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fu-date" className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Proposed date
                </Label>
                <Input id="fu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Assign engineer
                </Label>
                <Select value={engineerId} onValueChange={setEngineerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {engineers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleApprove} disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve &amp; create Planned Call
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={pending}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject follow-up</AlertDialogTitle>
            <AlertDialogDescription>
              Give a brief reason. The follow-up will be closed without creating a call.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejecting..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={pending}>
              Reject follow-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PartLineControl({
  part,
  locations,
  readOnly,
  pending,
}: {
  part: PartRow
  locations: { id: string; name: string; kind: string }[]
  readOnly: boolean
  pending: boolean
}) {
  const [locId, setLocId] = useState(part.locationId ?? '')
  const [busy, startTransition] = useTransition()
  const disabled = readOnly || busy || pending

  const totalStock = part.stock.reduce((sum, s) => sum + s.quantity, 0)

  function reserve() {
    if (!locId) return
    startTransition(async () => {
      await reserveFollowUpPart(part.id, locId)
    })
  }
  function order() {
    startTransition(async () => {
      await orderFollowUpPart(part.id)
    })
  }
  function clear() {
    startTransition(async () => {
      await clearFollowUpPartAction(part.id)
    })
  }

  return (
    <li className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {part.name} <span className="text-muted-foreground">× {part.quantity}</span>
          </p>
          {part.sku && <p className="text-xs text-muted-foreground">{part.sku}</p>}
          {part.partId ? (
            <p className="mt-1 text-xs">
              {totalStock > 0 ? (
                <span className="text-green-600">In stock: {totalStock}</span>
              ) : (
                <span className="text-destructive">No stock on hand</span>
              )}
            </p>
          ) : (
            <Badge variant="outline" className="mt-1 text-[10px]">
              Free text
            </Badge>
          )}
        </div>
        {part.action === 'reserve' && (
          <Badge
            className={cn(
              'gap-1',
              part.reservationStatus === 'confirmed'
                ? 'bg-green-600 text-white hover:bg-green-600'
                : 'bg-blue-600 text-white hover:bg-blue-600',
            )}
          >
            <MapPin className="h-3 w-3" />
            {part.reservationStatus === 'confirmed' ? 'Reserved' : 'Reserving'}
          </Badge>
        )}
        {part.action === 'order' && (
          <Badge className="gap-1 bg-amber-600 text-white hover:bg-amber-600">
            <ShoppingCart className="h-3 w-3" /> On order
          </Badge>
        )}
      </div>

      {/* Reservation detail / stores confirmation */}
      {part.action === 'reserve' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {part.locationName ? `Location: ${part.locationName}. ` : ''}
          {part.reservationStatus === 'confirmed' && part.locationRef
            ? `Held at: ${part.locationRef}`
            : 'Awaiting stores confirmation of location.'}
        </p>
      )}

      {/* Controls */}
      {!readOnly && part.partId && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {part.action === 'none' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Reserve from</Label>
                <Select value={locId} onValueChange={setLocId}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue placeholder="Choose location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => {
                      const s = part.stock.find((x) => x.locationId === l.id)
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} {s ? `(${s.quantity})` : '(0)'}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={reserve} disabled={disabled || !locId}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                Reserve
              </Button>
              <Button size="sm" variant="outline" onClick={order} disabled={disabled}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Order
              </Button>
            </>
          )}
          {part.action !== 'none' && (
            <Button size="sm" variant="ghost" onClick={clear} disabled={disabled}>
              Reset
            </Button>
          )}
        </div>
      )}
      {/* Free-text parts can only be ordered (no stock record). */}
      {!readOnly && !part.partId && part.action === 'none' && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={order} disabled={disabled}>
            <ShoppingCart className="mr-2 h-4 w-4" /> Order
          </Button>
        </div>
      )}
    </li>
  )
}

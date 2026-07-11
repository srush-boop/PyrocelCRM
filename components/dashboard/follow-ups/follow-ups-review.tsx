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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { fixAttemptLabel } from '@/lib/follow-up'
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
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function FollowUpsReview({ rows, engineers, locations }: Props) {
  const searchParams = useSearchParams()
  const preselect = searchParams.get('id')

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const resolved = useMemo(() => rows.filter((r) => r.status !== 'pending'), [rows])

  const [selectedId, setSelectedId] = useState<string | null>(
    preselect ?? pending[0]?.id ?? rows[0]?.id ?? null,
  )
  useEffect(() => {
    if (preselect) setSelectedId(preselect)
  }, [preselect])

  const selected = rows.find((r) => r.id === selectedId) ?? null

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No follow-ups to review</p>
          <p className="text-sm text-muted-foreground">
            When an engineer flags further works required, it will appear here for review.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Master list */}
      <div className="flex flex-col gap-2">
        {pending.length > 0 && (
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending review ({pending.length})
          </p>
        )}
        {pending.map((r) => (
          <ListItem key={r.id} row={r} active={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
        ))}
        {resolved.length > 0 && (
          <p className="mt-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reviewed
          </p>
        )}
        {resolved.map((r) => (
          <ListItem key={r.id} row={r} active={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
        ))}
      </div>

      {/* Detail */}
      <div>
        {selected ? (
          <FollowUpDetail row={selected} engineers={engineers} locations={locations} />
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Select a follow-up to review.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ListItem({ row, active, onClick }: { row: FollowUpReviewRow; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50',
        active && 'border-primary ring-1 ring-primary',
        row.escalated && row.status === 'pending' && 'border-destructive',
        row.status !== 'pending' && 'opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{row.siteName}</span>
        {row.escalated && row.status === 'pending' ? (
          <Badge variant="destructive" className="shrink-0 gap-1">
            <AlertTriangle className="h-3 w-3" /> Escalated
          </Badge>
        ) : row.status === 'pending' ? (
          <Badge variant="secondary" className="shrink-0">
            {fixAttemptLabel(row.fixAttempt)}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 capitalize">
            {row.status}
          </Badge>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.issueSummary}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <User className="h-3 w-3" />
        <span className="truncate">{row.requestedByName}</span>
        <span>·</span>
        <span>{formatDate(row.createdAt)}</span>
      </div>
    </button>
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
}: {
  row: FollowUpReviewRow
  engineers: { id: string; name: string }[]
  locations: { id: string; name: string; kind: string }[]
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
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectFollowUp(row.id, rejectReason)
      setRejectOpen(false)
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

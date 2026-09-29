'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight, PackageCheck, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  cancelPartRequest,
  collectPartRequest,
  declinePartRequest,
} from '@/lib/actions/part-requests'
import type { PartRequestQueueItem } from '@/lib/part-requests'

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: 'Waiting', variant: 'secondary' },
  approved: { label: 'Part collected', variant: 'default' },
  collected: { label: 'Collected', variant: 'outline' },
  declined: { label: 'Declined', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

type Mode = { kind: 'collect' | 'decline'; item: PartRequestQueueItem } | null

export function PartRequestsQueue({
  requests,
  currentUserId,
  isManager,
}: {
  requests: PartRequestQueueItem[]
  currentUserId: string
  isManager: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'open' | 'recent'>('open')
  const [mode, setMode] = useState<Mode>(null)
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const open = useMemo(
    () => requests.filter((r) => r.status === 'pending' || r.status === 'approved'),
    [requests],
  )
  const recent = useMemo(
    () => requests.filter((r) => r.status !== 'pending' && r.status !== 'approved'),
    [requests],
  )
  const shown = tab === 'open' ? open : recent

  function openCollect(item: PartRequestQueueItem) {
    const remaining = item.quantity - item.collectedQty
    setQty(String(Math.max(1, Math.min(remaining, item.availableAtSource || remaining))))
    setMode({ kind: 'collect', item })
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const res = await action()
      if (!res.ok) {
        toast.error(res.error || 'Something went wrong')
        return
      }
      toast.success(res.message || 'Done')
      setMode(null)
      setReason('')
      router.refresh()
    })
  }

  const remaining = mode ? mode.item.quantity - mode.item.collectedQty : 0
  const qtyNum = Number(qty)
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= remaining

  return (
    <Card id="part-requests" className="scroll-mt-20">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" aria-hidden />
            Part requests
            {open.length > 0 && <Badge>{open.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Reservations and requests from engineers. Marking a request collected moves the stock
            into the requester&apos;s van automatically.
          </CardDescription>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'open' | 'recent')}>
          <TabsList>
            <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
            <TabsTrigger value="recent">Recent ({recent.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-6 w-6" aria-hidden />
            {tab === 'open' ? 'No open part requests' : 'Nothing closed in the last 14 days'}
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {shown.map((r) => {
              const left = r.quantity - r.collectedQty
              const isOpen = r.status === 'pending' || r.status === 'approved'
              const canCollect =
                isOpen && (isManager || r.locationOwnerId === currentUserId || r.requesterId === currentUserId)
              const canDecline = isOpen && (isManager || r.locationOwnerId === currentUserId)
              const canCancel = isOpen && r.requesterId === currentUserId
              const short = isOpen && r.availableAtSource < left
              const meta = STATUS_META[r.status] ?? { label: r.status, variant: 'outline' as const }

              return (
                <li key={r.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant}>
                        {r.status === 'approved' ? `${r.collectedQty} of ${r.quantity} collected` : meta.label}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">{r.quantity}×</span>
                      <span className="line-clamp-1 text-sm font-medium" title={r.partName}>
                        {r.partName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {r.partSku && <span className="font-mono">{r.partSku}</span>}
                      <span className="flex items-center gap-1">
                        {r.locationName}
                        <ArrowRight className="h-3 w-3" aria-label="to" />
                        {r.requesterName}
                      </span>
                      <span>{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                      {isOpen && (
                        <span className={short ? 'font-medium text-destructive' : undefined}>
                          {r.availableAtSource} in stock
                        </span>
                      )}
                    </div>
                    {r.message && <p className="text-xs text-muted-foreground text-pretty">{r.message}</p>}
                    {r.resolutionNote && (
                      <p className="text-xs text-destructive text-pretty">Reason: {r.resolutionNote}</p>
                    )}
                  </div>
                  {isOpen && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => cancelPartRequest(r.id))}
                        >
                          Cancel
                        </Button>
                      )}
                      {canDecline && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setReason('')
                            setMode({ kind: 'decline', item: r })
                          }}
                        >
                          Decline
                        </Button>
                      )}
                      {canCollect && (
                        <Button
                          size="sm"
                          disabled={pending || r.availableAtSource < 1}
                          onClick={() => openCollect(r)}
                        >
                          Mark collected
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          {mode?.kind === 'collect' && (
            <>
              <DialogHeader>
                <DialogTitle>Mark as collected</DialogTitle>
                <DialogDescription className="text-pretty">
                  {mode.item.partName}. Stock is taken out of {mode.item.locationName} and added to{' '}
                  {mode.item.requesterName}&apos;s van.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="collect-qty">Quantity collected</Label>
                <Input
                  id="collect-qty"
                  type="number"
                  min={1}
                  max={remaining}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {remaining} still to collect · {mode.item.availableAtSource} in stock at{' '}
                  {mode.item.locationName}. Collect fewer to leave the rest open.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                  Close
                </Button>
                <Button
                  disabled={pending || !qtyValid || qtyNum > mode.item.availableAtSource}
                  onClick={() =>
                    run(() => collectPartRequest({ requestId: mode.item.id, quantity: qtyNum }))
                  }
                >
                  {pending ? 'Updating stock…' : 'Confirm collected'}
                </Button>
              </DialogFooter>
            </>
          )}
          {mode?.kind === 'decline' && (
            <>
              <DialogHeader>
                <DialogTitle>Decline request</DialogTitle>
                <DialogDescription>
                  {mode.item.requesterName} will be notified with your reason.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="decline-reason">Reason</Label>
                <Textarea
                  id="decline-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Out of stock — ordered, due Friday"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                  Close
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => run(() => declinePartRequest({ requestId: mode.item.id, reason }))}
                >
                  Decline
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

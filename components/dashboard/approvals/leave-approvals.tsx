'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CalendarDays, Check, X, Clock, CheckCircle2 } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { LeaveRequestRow } from '@/lib/leave-approvals'

interface Props {
  pending: LeaveRequestRow[]
  decided: LeaveRequestRow[]
}

// Formats an inclusive leave date span, e.g. "3 Jul – 7 Jul 2026".
function formatSpan(startAt: string, endAt: string): string {
  const start = formatDateUK(startAt)
  const end = formatDateUK(endAt)
  return start === end ? start : `${start} – ${end}`
}

export function LeaveApprovals({ pending, decided }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // The request currently being rejected (opens the reason dialog).
  const [rejecting, setRejecting] = useState<LeaveRequestRow | null>(null)
  const [reason, setReason] = useState('')
  // Id of the request whose action is in flight, to disable its buttons.
  const [busyId, setBusyId] = useState<string | null>(null)

  async function decide(id: string, action: 'approve' | 'reject', rejectionReason?: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejectionReason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      toast.success(action === 'approve' ? 'Leave approved' : 'Leave declined')
      setRejecting(null)
      setReason('')
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update request')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            To Be Approved
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Approved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />}
              text="No leave requests waiting for approval."
            />
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.userName}</span>
                        {r.departmentName && (
                          <Badge variant="outline" className="font-normal">
                            {r.departmentName}
                          </Badge>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        {formatSpan(r.startAt, r.endAt)}
                        <span className="text-foreground">
                          · {r.workingDays} working day{r.workingDays === 1 ? '' : 's'}
                        </span>
                      </p>
                      {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id || isPending}
                        onClick={() => {
                          setRejecting(r)
                          setReason('')
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === r.id || isPending}
                        onClick={() => decide(r.id, 'approve')}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved">
          {decided.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-10 w-10 text-muted-foreground/40" />}
              text="No decided requests yet."
            />
          ) : (
            <div className="space-y-3">
              {decided.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.userName}</span>
                        {r.status === 'approved' ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Declined</Badge>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        {formatSpan(r.startAt, r.endAt)}
                        <span className="text-foreground">
                          · {r.workingDays} working day{r.workingDays === 1 ? '' : 's'}
                        </span>
                      </p>
                      {r.status === 'rejected' && r.rejectionReason && (
                        <p className="text-sm text-destructive">Reason: {r.rejectionReason}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {r.approverName && <div>by {r.approverName}</div>}
                      {r.approvedAt && <div>{formatDateUK(r.approvedAt)}</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline leave request</DialogTitle>
            <DialogDescription>
              {rejecting && `${rejecting.userName} · ${formatSpan(rejecting.startAt, rejecting.endAt)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let the requester know why…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!busyId}
              onClick={() => rejecting && decide(rejecting.id, 'reject', reason.trim() || undefined)}
            >
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3">{icon}</div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}

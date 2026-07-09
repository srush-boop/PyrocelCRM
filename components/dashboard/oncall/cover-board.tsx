'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { LifeBuoy, Plus, Send, Check, X } from 'lucide-react'
import { formatDateTimeUK } from '@/lib/utils'
import {
  acceptCoverRequest,
  cancelCoverRequest,
  sendCoverMessage,
} from '@/lib/oncall/actions'
import {
  COVER_KIND_META,
  formatShiftDate,
  type CoverRequest,
  type CoverStatus,
  type OncallShift,
} from '@/lib/oncall/types'
import { CoverRequestDialog } from './cover-request-dialog'

interface CoverBoardProps {
  requests: CoverRequest[]
  shifts: OncallShift[]
  isManager: boolean
  currentUserId: string
  currentUserBranchId: string | null
}

const STATUS_VARIANT: Record<CoverStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  accepted: 'secondary',
  cancelled: 'outline',
  declined: 'outline',
}

export function CoverBoard({
  requests,
  shifts,
  isManager,
  currentUserId,
  currentUserBranchId,
}: CoverBoardProps) {
  const [pending, startTransition] = useTransition()
  const [requestOpen, setRequestOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const myShifts = shifts.filter((s) => s.engineerId === currentUserId)
  const canRaise = isManager || !!currentUserBranchId

  const open = requests.filter((r) => r.status === 'open')
  const resolved = requests.filter((r) => r.status !== 'open')

  const doAccept = (id: string) => {
    startTransition(async () => {
      const res = await acceptCoverRequest(id)
      if (res.ok) toast.success('You are now covering this shift')
      else toast.error(res.error ?? 'Could not accept')
    })
  }

  const doCancel = (id: string) => {
    startTransition(async () => {
      const res = await cancelCoverRequest(id)
      if (res.ok) toast.success('Request cancelled')
      else toast.error(res.error ?? 'Could not cancel')
    })
  }

  const doSend = (id: string) => {
    const body = (drafts[id] ?? '').trim()
    if (!body) return
    startTransition(async () => {
      const res = await sendCoverMessage(id, body)
      if (res.ok) {
        setDrafts((d) => ({ ...d, [id]: '' }))
      } else {
        toast.error(res.error ?? 'Could not send message')
      }
    })
  }

  const renderRequest = (r: CoverRequest) => {
    const mine = r.requesterId === currentUserId
    return (
      <Card key={r.id}>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
                  {r.status}
                </Badge>
                <span className="text-sm font-medium">{COVER_KIND_META[r.kind].label}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {r.requesterName ?? 'Engineer'} · {r.branchName}
                {r.shiftDate && ` · ${formatShiftDate(r.shiftDate)}`}
                {r.dateFrom && r.dateTo && ` · ${formatShiftDate(r.dateFrom)}–${formatShiftDate(r.dateTo)}`}
              </p>
              {r.message && <p className="text-sm">{r.message}</p>}
              {r.status === 'accepted' && r.acceptedByName && (
                <p className="text-xs text-muted-foreground">Covered by {r.acceptedByName}</p>
              )}
            </div>
            {r.status === 'open' && (
              <div className="flex items-center gap-2">
                {!mine && (
                  <Button size="sm" onClick={() => doAccept(r.id)} disabled={pending} className="gap-1">
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                )}
                {(mine || isManager) && (
                  <Button size="sm" variant="outline" onClick={() => doCancel(r.id)} disabled={pending} className="gap-1">
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Message thread */}
          {r.messages.length > 0 && (
            <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
              {r.messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="font-medium">{m.senderName ?? 'User'}: </span>
                  <span>{m.body}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{formatDateTimeUK(m.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {r.status === 'open' && (
            <div className="flex items-center gap-2">
              <Input
                value={drafts[r.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                placeholder="Send a message…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    doSend(r.id)
                  }
                }}
              />
              <Button size="icon" variant="secondary" onClick={() => doSend(r.id)} disabled={pending} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <LifeBuoy className="h-5 w-5" />
          Cover board
        </h2>
        {canRaise && (
          <Button onClick={() => setRequestOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Request cover
          </Button>
        )}
      </div>

      {open.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No open cover requests.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">{open.map(renderRequest)}</div>
      )}

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Recently resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-72">
              <div className="space-y-3 pr-2">{resolved.map(renderRequest)}</div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <CoverRequestDialog open={requestOpen} onOpenChange={setRequestOpen} myShifts={myShifts} />
    </div>
  )
}

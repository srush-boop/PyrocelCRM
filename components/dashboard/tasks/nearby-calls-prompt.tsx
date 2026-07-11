'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Navigation, Loader2, Check, AlertTriangle, Clock } from 'lucide-react'
import { claimNearbyCall, type NearbyOverdueCall } from '@/app/(dashboard)/dashboard/nearby/actions'
import { cn } from '@/lib/utils'

interface NearbyCallsPromptProps {
  open: boolean
  calls: NearbyOverdueCall[]
  /** Called when the engineer is finished with the prompt (skip or after claiming). */
  onClose: () => void
}

/**
 * Shown after an engineer completes an inspection when there are overdue or
 * due-soon calls at other nearby sites. Lets them take ownership on the spot so
 * a second engineer isn't dispatched to the same area later.
 */
export function NearbyCallsPrompt({ open, calls, onClose }: NearbyCallsPromptProps) {
  // Track per-call claim state so each row shows its own spinner / taken state.
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleClaim = async (taskId: string) => {
    setClaiming(taskId)
    setError(null)
    const res = await claimNearbyCall({ taskId })
    setClaiming(null)
    if (res.ok) {
      setClaimed((prev) => new Set(prev).add(taskId))
    } else {
      setError(res.error ?? 'Could not take this call.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Calls near you
          </DialogTitle>
          <DialogDescription>
            {calls.length} outstanding call{calls.length === 1 ? '' : 's'} at other sites near where
            you are. Take ownership now to save a return trip.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto px-5 py-4">
          {calls.map((call) => {
            const isClaimed = claimed.has(call.taskId)
            const isClaiming = claiming === call.taskId
            return (
              <div
                key={call.taskId}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-lg border p-3',
                  isClaimed && 'border-primary/40 bg-primary/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{call.siteName}</span>
                    {call.urgency === 'overdue' ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-destructive/30 bg-destructive/10 text-xs text-destructive"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-400/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300"
                      >
                        <Clock className="h-3 w-3" />
                        Due soon
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {[call.serviceTypeName, call.systemTypeName].filter(Boolean).join(' · ') ||
                      'Call'}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Navigation className="h-3 w-3" />
                      {call.distanceMiles} mi away
                    </span>
                    {call.postcode && <span>{call.postcode}</span>}
                    <span>
                      {call.assignedEngineerName
                        ? `Assigned: ${call.assignedEngineerName}`
                        : 'Unassigned'}
                    </span>
                  </p>
                </div>
                {isClaimed ? (
                  <span className="flex shrink-0 items-center gap-1 py-1.5 text-sm font-medium text-primary">
                    <Check className="h-4 w-4" />
                    Taken
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => handleClaim(call.taskId)}
                    disabled={isClaiming}
                  >
                    {isClaiming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Take call'
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <p className="px-5 pb-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {claimed.size > 0 ? 'Done' : 'No thanks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

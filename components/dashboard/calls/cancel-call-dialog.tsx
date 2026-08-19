'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cancelCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'

/**
 * Cancel-call control with a FORCED reason. Renders a destructive trigger button
 * that opens a confirmation dialog requiring a non-empty reason before the
 * cancellation can go through. Office/admin only (also enforced server-side).
 *
 * Pass a custom `trigger` to place it inside another menu/toolbar; otherwise a
 * default outline "Cancel call" button is rendered.
 */
export function CancelCallDialog({
  taskId,
  referenceNumber = null,
  trigger,
  onCancelled,
}: {
  taskId: string
  referenceNumber?: string | null
  trigger?: React.ReactNode
  /** Called after a successful cancellation (e.g. to refresh a list/snapshot). */
  onCancelled?: (reason: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 3 && !pending

  const handleConfirm = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await cancelCall({ taskId, reason: trimmed })
      if (res.ok) {
        toast.success('Call cancelled')
        setOpen(false)
        setReason('')
        onCancelled?.(trimmed)
      } else {
        toast.error(res.error ?? 'Failed to cancel the call.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) setReason('')
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive">
            <XCircle className="h-4 w-4" />
            Cancel call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this call?</DialogTitle>
          <DialogDescription>
            Cancelling stops the call from being worked or reported.
            {referenceNumber ? ` (${referenceNumber})` : ''} A reason is required and kept on the
            record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">
            Reason for cancelling <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client cancelled the visit / access not available / duplicate call"
            rows={4}
            autoFocus
            aria-required="true"
          />
          <p className="text-xs text-muted-foreground">
            This is stored against the call so everyone can see why it was cancelled.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep call
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                Cancel call
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

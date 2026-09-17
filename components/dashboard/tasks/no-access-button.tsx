'use client'

import { useState } from 'react'
import { DoorClosed, Loader2 } from 'lucide-react'
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
} from '@/components/ui/dialog'

interface NoAccessButtonProps {
  /** Runs the completion cascade with the given reason. Reason is trimmed. */
  onConfirm: (reason: string) => Promise<void> | void
  /** Disables the trigger + confirm while a submission is running. */
  submitting?: boolean
  className?: string
}

/**
 * Shared "No access" outcome control used across every call execution flow. The
 * engineer attended but couldn't get in — a required reason is captured (the
 * office needs it to contact the client) and the call is completed as no-access.
 */
export function NoAccessButton({ onConfirm, submitting, className }: NoAccessButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const canConfirm = reason.trim().length >= 3 && !submitting

  const handleConfirm = async () => {
    if (!canConfirm) return
    await onConfirm(reason)
    setOpen(false)
    setReason('')
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={submitting}
        className={className}
      >
        <DoorClosed className="mr-2 h-4 w-4" />
        No Access
      </Button>

      <Dialog open={open} onOpenChange={(v) => (submitting ? null : setOpen(v))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record no access</DialogTitle>
            <DialogDescription>
              Mark this call as no access — you attended but couldn&apos;t get in. The office
              will be prompted to contact the client and rearrange. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="no-access-reason">Reason for no access</Label>
            <Textarea
              id="no-access-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. No answer at the door, gate locked, key holder not present..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canConfirm}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm no access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

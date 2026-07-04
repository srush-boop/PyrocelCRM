'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckCircle2, XCircle } from 'lucide-react'
import { respondToApproval } from '@/lib/rams/approval-actions'
import type { ApprovalStatus } from '@/lib/rams/types'

interface ApprovalResponseProps {
  token: string
  alreadyResponded: boolean
  initialStatus: ApprovalStatus
}

export function ApprovalResponse({
  token,
  alreadyResponded,
  initialStatus,
}: ApprovalResponseProps) {
  const [status, setStatus] = useState(initialStatus)
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(alreadyResponded)

  async function respond(decision: 'approved' | 'rejected') {
    setBusy(true)
    setError(null)
    const res = await respondToApproval(token, decision, comments.trim() || null)
    setBusy(false)
    if (!res.success) {
      setError(res.error ?? 'Something went wrong')
      return
    }
    setStatus(decision)
    setDone(true)
  }

  if (done) {
    const approved = status === 'approved'
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
        {approved ? (
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        ) : (
          <XCircle className="h-10 w-10 text-destructive" />
        )}
        <p className="text-lg font-medium">
          {approved ? 'RAMS approved' : 'RAMS rejected'}
        </p>
        <p className="text-sm text-muted-foreground">
          Your response has been recorded. Thank you.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="comments">Comments (optional)</Label>
        <Textarea
          id="comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Add any comments or conditions of approval…"
          rows={4}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => respond('approved')}
          disabled={busy}
          className="flex-1"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Approve
        </Button>
        <Button
          onClick={() => respond('rejected')}
          disabled={busy}
          variant="destructive"
          className="flex-1"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Reject
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X, CircleCheck } from 'lucide-react'
import { SignaturePad } from './signature-pad'
import { respondToPublicQuote } from '@/app/quote/[token]/actions'
import { formatDateUK } from '@/lib/utils'
import type { Quote } from '@/lib/types/database'

// Client-facing approve/decline panel shown beneath the public quote document.
export function PublicQuoteApproval({ quote, token }: { quote: Quote; token: string }) {
  const [mode, setMode] = useState<'idle' | 'approve' | 'decline'>('idle')
  const [poNumber, setPoNumber] = useState('')
  const [note, setNote] = useState('')
  const [sigName, setSigName] = useState('')
  const [sigData, setSigData] = useState<string | null>(null)
  const [done, setDone] = useState<null | 'accepted' | 'rejected'>(null)
  const [isPending, startTransition] = useTransition()

  const requiresSignature = quote.require_signature

  // Already-decided quotes show a read-only summary.
  if (quote.status === 'accepted' || quote.status === 'rejected' || done) {
    const status = done ?? quote.status
    const accepted = status === 'accepted'
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              accepted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {accepted ? <CircleCheck className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </div>
          <div>
            <p className="font-medium">
              {accepted ? 'This quote has been approved' : 'This quote has been declined'}
            </p>
            <p className="text-sm text-muted-foreground">
              {accepted
                ? 'Thank you. Our team has been notified and will be in touch.'
                : 'Thank you for letting us know.'}
              {quote.decided_at ? ` (${formatDateUK(quote.decided_at)})` : ''}
            </p>
            {accepted && quote.po_number && (
              <p className="mt-1 text-sm text-muted-foreground">PO number: {quote.po_number}</p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  function submit(decision: 'accepted' | 'rejected') {
    if (decision === 'accepted' && requiresSignature && (!sigName.trim() || !sigData)) {
      toast.error('Please type your name and sign to approve this quote.')
      return
    }
    startTransition(async () => {
      const res = await respondToPublicQuote({
        token,
        decision,
        poNumber: poNumber || undefined,
        decisionNote: note || undefined,
        signatureName: sigName || undefined,
        signatureDataUrl: sigData || undefined,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong. Please try again.')
        return
      }
      setDone(decision)
      toast.success(decision === 'accepted' ? 'Quote approved' : 'Quote declined')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Respond to this quote</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {mode === 'idle' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="flex-1 bg-green-600 text-white hover:bg-green-700"
              onClick={() => setMode('approve')}
            >
              <Check className="mr-2 h-5 w-5" />
              Approve quote
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setMode('decline')}
            >
              <X className="mr-2 h-5 w-5" />
              Decline
            </Button>
          </div>
        )}

        {mode === 'approve' && (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="po">PO number (optional)</Label>
              <Input
                id="po"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-12345"
                disabled={isPending}
              />
            </div>

            {requiresSignature && (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="signame">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="signame"
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    placeholder="Your full name"
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>
                    Signature <span className="text-destructive">*</span>
                  </Label>
                  <SignaturePad onChange={setSigData} disabled={isPending} />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-600 text-white hover:bg-green-700"
                onClick={() => submit('accepted')}
                disabled={isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                {isPending ? 'Submitting...' : 'Confirm approval'}
              </Button>
              <Button variant="ghost" onClick={() => setMode('idle')} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === 'decline' && (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="note">Reason (optional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Let us know why, if you'd like"
                rows={3}
                disabled={isPending}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => submit('rejected')}
                disabled={isPending}
              >
                <X className="mr-2 h-4 w-4" />
                {isPending ? 'Submitting...' : 'Confirm decline'}
              </Button>
              <Button variant="ghost" onClick={() => setMode('idle')} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

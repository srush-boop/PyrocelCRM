'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateUK } from '@/lib/utils'
import { formatPence } from '@/lib/sales'
import type { Quote } from '@/lib/types/database'
import { respondToQuote } from '@/app/portal/quotes/actions'

export function PortalQuoteActions({ quote }: { quote: Quote }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<null | 'accepted' | 'rejected'>(null)
  const [note, setNote] = useState('')

  function submit() {
    if (!dialog) return
    const decision = dialog
    startTransition(async () => {
      const res = await respondToQuote(quote.id, decision, note)
      if (res.ok) {
        toast.success(decision === 'accepted' ? 'Quote accepted' : 'Quote declined')
        setDialog(null)
        setNote('')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not record your response')
      }
    })
  }

  // Already decided — show a confirmation banner instead of buttons.
  if (quote.status === 'accepted' || quote.status === 'rejected') {
    const accepted = quote.status === 'accepted'
    return (
      <Card className={accepted ? 'border-green-500/40' : 'border-red-500/40'}>
        <CardContent className="flex items-center gap-3 py-4">
          {accepted ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <div>
            <p className="font-medium">
              You {accepted ? 'accepted' : 'declined'} this quote
              {quote.decided_at ? ` on ${formatDateUK(quote.decided_at)}` : ''}.
            </p>
            {quote.decision_note && (
              <p className="text-sm text-muted-foreground">{quote.decision_note}</p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Expired or anything not open for response.
  if (quote.status !== 'sent') {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          This quote is not currently open for a response. Please contact Pyrocel if you have any
          questions.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">This quote is awaiting your response</p>
            <p className="text-sm text-muted-foreground">
              Total {formatPence(quote.total_pence, quote.currency)}
              {quote.valid_until ? ` · valid until ${formatDateUK(quote.valid_until)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setDialog('accepted')}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
            <Button variant="outline" onClick={() => setDialog('rejected')}>
              <X className="mr-2 h-4 w-4" />
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'accepted' ? 'Accept this quote?' : 'Decline this quote?'}</DialogTitle>
            <DialogDescription>
              {dialog === 'accepted'
                ? 'Pyrocel will be notified that you have accepted this quote and will be in touch to proceed.'
                : 'Let Pyrocel know this quote has been declined. You can add an optional reason below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="q-note">{dialog === 'accepted' ? 'Note (optional)' : 'Reason (optional)'}</Label>
            <Textarea
              id="q-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={dialog === 'accepted' ? 'Anything we should know?' : 'Why are you declining?'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={isPending}
              className={
                dialog === 'accepted' ? 'bg-green-600 text-white hover:bg-green-700' : undefined
              }
              variant={dialog === 'rejected' ? 'destructive' : 'default'}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog === 'accepted' ? 'Accept quote' : 'Decline quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

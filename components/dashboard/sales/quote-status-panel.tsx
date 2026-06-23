'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Printer, Send, Check, X, RotateCcw, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import { QUOTE_STATUS_META } from '@/lib/sales'
import type { Quote, QuoteStatus } from '@/lib/types/database'
import { setQuoteStatus } from '@/app/(dashboard)/dashboard/sales/actions'

export function QuoteStatusPanel({ quote }: { quote: Quote }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function update(status: QuoteStatus) {
    startTransition(async () => {
      const res = await setQuoteStatus(quote.id, status)
      if (res.ok) {
        toast.success(`Quote marked as ${QUOTE_STATUS_META[status].label.toLowerCase()}`)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not update status')
      }
    })
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className={cn('text-sm', QUOTE_STATUS_META[quote.status].badgeClass)}>
          {QUOTE_STATUS_META[quote.status].label}
        </Badge>
        <div className="text-sm text-muted-foreground">
          {quote.sent_at && <span>Sent {formatDateUK(quote.sent_at)}. </span>}
          {quote.decided_at && quote.status === 'accepted' && (
            <span>Accepted {formatDateUK(quote.decided_at)}.</span>
          )}
          {quote.decided_at && quote.status === 'rejected' && (
            <span>Declined {formatDateUK(quote.decided_at)}.</span>
          )}
          {quote.status === 'draft' && <span>Not yet sent to the client.</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/sales/${quote.id}/print`} target="_blank">
            <Printer className="mr-2 h-4 w-4" />
            View / PDF
          </Link>
        </Button>

        {quote.status === 'draft' && (
          <Button size="sm" onClick={() => update('sent')} disabled={isPending}>
            <Send className="mr-2 h-4 w-4" />
            Mark as Sent
          </Button>
        )}

        {quote.status === 'sent' && (
          <>
            <Button
              size="sm"
              onClick={() => update('accepted')}
              disabled={isPending}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="mr-2 h-4 w-4" />
              Accepted
            </Button>
            <Button size="sm" variant="outline" onClick={() => update('rejected')} disabled={isPending}>
              <X className="mr-2 h-4 w-4" />
              Declined
            </Button>
            <Button size="sm" variant="outline" onClick={() => update('expired')} disabled={isPending}>
              <Clock className="mr-2 h-4 w-4" />
              Expired
            </Button>
          </>
        )}

        {quote.status !== 'draft' && (
          <Button size="sm" variant="ghost" onClick={() => update('draft')} disabled={isPending}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Back to Draft
          </Button>
        )}
      </div>
    </Card>
  )
}

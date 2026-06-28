'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Printer, Send, Check, X, RotateCcw, Clock, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatDateUK } from '@/lib/utils'
import { QUOTE_STATUS_META } from '@/lib/sales'
import type { Quote, QuoteStatus } from '@/lib/types/database'
import { setQuoteStatus } from '@/app/(dashboard)/dashboard/sales/actions'
import { SendQuoteDialog } from './send-quote-dialog'

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
          {quote.status === 'accepted' && (quote.po_number || quote.signature_name) && (
            <div className="mt-1 flex flex-col gap-1 text-foreground">
              {quote.po_number && (
                <span>
                  PO number: <span className="font-medium">{quote.po_number}</span>
                </span>
              )}
              {quote.signature_name && (
                <span className="flex items-center gap-2">
                  Signed by <span className="font-medium">{quote.signature_name}</span>
                  {quote.signature_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={quote.signature_image_url || '/placeholder.svg'}
                      alt={`Signature of ${quote.signature_name}`}
                      className="h-10 rounded border bg-white"
                    />
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/sales/${quote.id}/print`}>
            <Printer className="mr-2 h-4 w-4" />
            View / PDF
          </Link>
        </Button>

        {/* Staff can always generate the full equipment specification (part
            numbers + standard descriptions + spec detail) for the client. */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/sales/${quote.id}/spec`}>
            <FileText className="mr-2 h-4 w-4" />
            Equipment spec
          </Link>
        </Button>

        {quote.status === 'draft' && <SendQuoteDialog quote={quote} />}

        {quote.status === 'sent' && (
          <>
            <SendQuoteDialog
              quote={quote}
              label="Resend"
              trigger={
                <Button size="sm" variant="outline" disabled={isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Resend
                </Button>
              }
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => update('accepted')}
              disabled={isPending}
              className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
            >
              <Check className="mr-2 h-4 w-4" />
              Mark accepted
            </Button>
            <Button size="sm" variant="outline" onClick={() => update('rejected')} disabled={isPending}>
              <X className="mr-2 h-4 w-4" />
              Mark declined
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

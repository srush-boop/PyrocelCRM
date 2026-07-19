import Link from 'next/link'
import { Wrench, FileText, ClipboardCheck, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface RemedialCallPanelProps {
  quote: {
    id: string
    quote_number: string | null
    reference: string | null
    total_pence: number | null
  } | null
  /** The inspection call the originating defect was found on, if resolvable. */
  originCall: { id: string; reference_number: string | null } | null
  /** Office/admin can open the source quote; the sales pages are staff-only. */
  canOpenQuote: boolean
}

/**
 * Shown at the top of a remedial call. Ties the call back to the accepted quote
 * it was raised from and to the original inspection call where the defect was
 * found, so the attending engineer/office has the full trail. The quoted works
 * and charges themselves live in the call notes.
 */
export function RemedialCallPanel({ quote, originCall, canOpenQuote }: RemedialCallPanelProps) {
  if (!quote && !originCall) return null

  const quoteRef = quote?.reference ?? quote?.quote_number ?? 'quote'
  const quotedTotal =
    typeof quote?.total_pence === 'number' ? `£${(quote.total_pence / 100).toFixed(2)}` : null

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-primary" />
            Remedial works{quote ? ` — quote ${quoteRef}` : ''}
          </CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Raised from an accepted remedial quote. Quoted works and charges are in the call notes below.
          </p>
        </div>
        {quote && canOpenQuote ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/sales/${quote.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open quote
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {quotedTotal ? (
          <div className="flex flex-col text-sm">
            <span className="text-muted-foreground">Quoted total</span>
            <span className="font-medium text-foreground">{quotedTotal}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {quote && canOpenQuote ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/sales/${quote.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                View quote {quoteRef}
              </Link>
            </Button>
          ) : null}
          {originCall ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/tasks/${originCall.id}`}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Originating call{originCall.reference_number ? ` ${originCall.reference_number}` : ''}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

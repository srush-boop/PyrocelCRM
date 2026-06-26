import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, FileText } from 'lucide-react'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence, quoteTypeLabel, QUOTE_STATUS_META } from '@/lib/sales'
import type { Quote } from '@/lib/types/database'

export default async function PortalQuotesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // RLS limits these to quotes for the client's permitted sites that have been
  // sent (draft quotes are never visible).
  const { data } = await supabase
    .from('quotes')
    .select('*, site:sites(id, name)')
    .order('created_at', { ascending: false })

  const quotes = (data ?? []) as Quote[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
        <p className="text-muted-foreground">Review quotes from Pyrocel and accept or decline them.</p>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You have no quotes to review at the moment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {quotes.map((quote) => (
            <Link key={quote.id} href={`/portal/quotes/${quote.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{quote.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {quote.quote_number ?? ''} · {quoteTypeLabel(quote.quote_type)}
                      {quote.site?.name ? ` · ${quote.site.name}` : ''}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="font-semibold tabular-nums">
                      {formatPence(quote.total_pence, quote.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {quote.valid_until ? `Valid until ${formatDateUK(quote.valid_until)}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn('shrink-0', QUOTE_STATUS_META[quote.status].badgeClass)}
                  >
                    {QUOTE_STATUS_META[quote.status].label}
                  </Badge>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

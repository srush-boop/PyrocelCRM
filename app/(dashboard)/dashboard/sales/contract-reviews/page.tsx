import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, ArrowRight, FileCheck2, XCircle } from 'lucide-react'
import { formatPence } from '@/lib/sales'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'Contract Reviews | Pyrocel',
  description: 'Review accepted maintenance quotes and commit them to live records.',
}

interface ReviewRow {
  id: string
  status: string
  created_at: string
  committed_at: string | null
  quote: { id: string; title: string; reference: string | null; quote_number: string | null } | null
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  committed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

export default async function ContractReviewsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: reviewsData } = await supabase
    .from('contract_reviews')
    .select('id, status, created_at, committed_at, quote:quotes(id, title, reference, quote_number)')
    .order('created_at', { ascending: false })
  const reviews = (reviewsData ?? []) as unknown as ReviewRow[]

  // Aggregate item counts + draft value per review.
  const ids = reviews.map((r) => r.id)
  const countsByReview = new Map<string, { items: number; valuePence: number }>()
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('contract_review_items')
      .select('review_id, entity_type, payload')
      .in('review_id', ids)
    for (const it of items ?? []) {
      const agg = countsByReview.get(it.review_id as string) ?? { items: 0, valuePence: 0 }
      agg.items += 1
      if (it.entity_type === 'charge') {
        const price = (it.payload as { unit_price_pence?: number })?.unit_price_pence ?? 0
        agg.valuePence += typeof price === 'number' ? price : 0
      }
      countsByReview.set(it.review_id as string, agg)
    }
  }

  const drafts = reviews.filter((r) => r.status === 'draft')
  const others = reviews.filter((r) => r.status !== 'draft')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contract Reviews</h1>
        <p className="text-muted-foreground">
          Accepted Routine Maintenance quotes prepared as draft records. Review, amend anomalies,
          then commit to create live client, site, system, service and charge records.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold">Awaiting review ({drafts.length})</h2>
        </div>
        {drafts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No contract reviews are awaiting review.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {drafts.map((r) => (
              <ReviewCard key={r.id} review={r} agg={countsByReview.get(r.id)} />
            ))}
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Recently processed</h2>
          <div className="grid gap-3">
            {others.map((r) => (
              <ReviewCard key={r.id} review={r} agg={countsByReview.get(r.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ReviewCard({
  review,
  agg,
}: {
  review: ReviewRow
  agg?: { items: number; valuePence: number }
}) {
  const ref = review.quote?.reference || review.quote?.quote_number || 'No reference'
  return (
    <Link href={`/dashboard/sales/contract-reviews/${review.id}`} className="block">
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            {review.status === 'committed' ? (
              <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : review.status === 'cancelled' ? (
              <XCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="font-medium">{review.quote?.title || 'Maintenance contract'}</p>
              <p className="text-sm text-muted-foreground">
                {ref}
                {agg ? ` • ${agg.items} draft records` : ''}
                {agg && agg.valuePence > 0 ? ` • ${formatPence(agg.valuePence)} / yr` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={STATUS_TONE[review.status] ?? ''}>
              {review.status}
            </Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

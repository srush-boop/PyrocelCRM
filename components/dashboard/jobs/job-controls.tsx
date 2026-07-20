'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateUK } from '@/lib/utils'
import { markContractReviewed } from '@/app/(dashboard)/dashboard/jobs/actions'

export function JobContractReview({
  jobId,
  contractReviewedAt,
  reviewerName,
}: {
  jobId: string
  contractReviewedAt: string | null
  reviewerName: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [checks, setChecks] = useState({ scope: false, price: false, terms: false })
  const allChecked = checks.scope && checks.price && checks.terms

  function markReviewed() {
    startTransition(async () => {
      const res = await markContractReviewed(jobId)
      if (res.ok) {
        toast.success('Contract review recorded')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not record the review')
      }
    })
  }

  const items: { key: keyof typeof checks; label: string }[] = [
    { key: 'scope', label: 'Scope of works confirmed against the accepted quote' },
    { key: 'price', label: 'Contract value, costs and margin verified' },
    { key: 'terms', label: 'Payment terms, programme and customer PO confirmed' },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Contract review</CardTitle>
        {contractReviewedAt ? (
          <Badge variant="secondary" className="gap-1 bg-chart-4/15 text-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Reviewed
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
            Pending
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {contractReviewedAt ? (
          <p className="text-sm text-muted-foreground">
            Signed off{reviewerName ? ` by ${reviewerName}` : ''} on {formatDateUK(contractReviewedAt)}.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checks[item.key]}
                      onChange={(e) => setChecks((c) => ({ ...c, [item.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button onClick={markReviewed} disabled={isPending || !allChecked}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Mark contract reviewed
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

import type { Metadata } from 'next'
import { History, Trophy } from 'lucide-react'
import { requireTenderAccess } from '@/lib/tender/access'
import { getWinningResponses } from '@/lib/tender/data'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Previous Responses | Tender AI' }

export default async function PreviousResponsesPage() {
  await requireTenderAccess()
  const responses = await getWinningResponses()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Previous Responses</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Your library of winning answers. These are indexed and reused by the AI when drafting
          answers to similar questions.
        </p>
      </div>

      {responses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <History className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No winning responses yet</p>
              <p className="text-sm text-muted-foreground text-pretty">
                Mark strong answers as winning responses inside a tender to build this library.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {responses.map((r) => (
            <Card key={r.id}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug text-pretty">{r.question}</p>
                  <Badge className="shrink-0 bg-chart-2/20 text-foreground" variant="secondary">
                    <Trophy className="size-3" />
                    Winning
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {r.answer}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

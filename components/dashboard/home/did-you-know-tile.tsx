import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Lightbulb } from 'lucide-react'
import { getDailyFact } from '@/lib/system-facts'

// Shared "Did you know?" daily-fact tile. Used on both the engineer home and the
// office/admin dashboard so everyone gets the same rotating system fact.
export function DidYouKnowTile() {
  const fact = getDailyFact(new Date())
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-primary" />
          Did you know?
        </CardTitle>
        <CardDescription>A daily fact about the systems we service</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-pretty leading-relaxed">{fact}</p>
      </CardContent>
    </Card>
  )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Crown, TrendingUp, Target } from 'lucide-react'
import type { EngineerEngagementStats } from '@/lib/engagement-stats'

/** "1st", "2nd", "3rd", "4th"… */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function EngineerStandingCard({ stats }: { stats: EngineerEngagementStats }) {
  const { productivity, firstTimeFix, departmentName, isLeader } = stats

  return (
    <Card className={isLeader ? 'border-primary/40 bg-primary/5' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isLeader ? (
            <Crown className="h-5 w-5 text-primary" />
          ) : (
            <TrendingUp className="h-5 w-5 text-primary" />
          )}
          Your standing
        </CardTitle>
        <CardDescription>
          {isLeader
            ? `You're leading ${departmentName} right now — keep it up!`
            : `How you're doing in ${departmentName} over the last 90 days`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Productivity position */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {isLeader ? <Crown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{ordinal(productivity.position)}</span>
                <span className="text-sm text-muted-foreground">
                  of {productivity.total}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Productivity · {productivity.completed} call
                {productivity.completed === 1 ? '' : 's'} completed
              </p>
            </div>
          </div>

          {/* First-time fix rating */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              {firstTimeFix.ratingPct !== null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold">{firstTimeFix.ratingPct}%</span>
                    {firstTimeFix.position !== null && (
                      <span className="text-sm text-muted-foreground">
                        {ordinal(firstTimeFix.position)} of {firstTimeFix.total}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    First-time fix · {firstTimeFix.sampleSize} call
                    {firstTimeFix.sampleSize === 1 ? '' : 's'}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                  <p className="text-xs text-muted-foreground">
                    First-time fix · not enough calls yet
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

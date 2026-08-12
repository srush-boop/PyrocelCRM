import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, ChevronRight, ListChecks, TriangleAlert, User } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { OtherSiteCall } from '@/lib/site-open-calls'

/**
 * "Also at this site" — shown directly beneath the Start Task action. Lists the
 * OTHER open calls at the same site that are overdue or due soon, so the
 * attending engineer can see what else could be done in the same visit. Renders
 * nothing when there are none. Each row links through to that call.
 */
export function OtherSiteCallsCard({
  calls,
  currentUserId,
}: {
  calls: OtherSiteCall[]
  currentUserId: string
}) {
  if (calls.length === 0) return null

  const overdueCount = calls.filter((c) => c.overdue).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <span className="text-pretty">Also at this site</span>
          <span className="text-xs font-normal text-muted-foreground">({calls.length})</span>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">
              {overdueCount} overdue
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {calls.map((call) => {
            const label =
              [call.serviceName, call.systemName].filter(Boolean).join(' · ') || 'Call'
            const mine = call.assignedEngineerId === currentUserId
            const dateNode = call.overdue ? (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <TriangleAlert className="h-3 w-3 shrink-0" />
                Overdue
                {call.targetDate ? ` — was due ${formatDateUK(call.targetDate)}` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <CalendarClock className="h-3 w-3 shrink-0" />
                Due {call.scheduledDate ? formatDateUK(call.scheduledDate) : 'soon'}
              </span>
            )

            return (
              <li key={call.id}>
                <Link
                  href={`/dashboard/tasks/${call.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                      {label}
                      {call.isEmergency && (
                        <Badge variant="destructive" className="text-[10px]">
                          Emergency
                        </Badge>
                      )}
                      {call.status === 'in_progress' && (
                        <Badge variant="secondary" className="text-[10px]">
                          In progress
                        </Badge>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      {dateNode}
                      {call.reference && (
                        <span className="font-mono text-muted-foreground">{call.reference}</span>
                      )}
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {mine
                          ? 'Assigned to you'
                          : call.assignedEngineerName ?? 'Unassigned'}
                      </span>
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

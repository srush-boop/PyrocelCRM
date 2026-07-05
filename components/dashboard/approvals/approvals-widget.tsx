import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, CheckCircle2, ChevronRight, CalendarDays } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'

// Dashboard card summarising leave requests awaiting the current user's
// approval. Renders nothing when the user has no pending items to action, so it
// only appears for managers/accounts/admins who actually have work to do.
export async function ApprovalsWidget() {
  const { pending } = await getVisibleLeaveRequests()
  if (pending.length === 0) return null

  const top = pending.slice(0, 4)

  return (
    <Card className="border-amber-300/60 dark:border-amber-900/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Leave Approvals
            <Badge variant="secondary">{pending.length}</Badge>
          </CardTitle>
          <CardDescription>Requests waiting for your decision</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/approvals">
            Review all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {top.map((r) => (
            <Link
              key={r.id}
              href="/dashboard/approvals"
              className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">{r.userName}</p>
                <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {formatDateUK(r.startAt)}
                  {r.startAt.slice(0, 10) !== r.endAt.slice(0, 10) &&
                    ` – ${formatDateUK(r.endAt)}`}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {r.workingDays} day{r.workingDays === 1 ? '' : 's'}
              </Badge>
            </Link>
          ))}
        </div>
        {pending.length > top.length && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            {pending.length - top.length} more awaiting approval
          </p>
        )}
      </CardContent>
    </Card>
  )
}

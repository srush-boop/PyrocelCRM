import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOutstandingTasks } from '@/lib/actions/internal-tasks'

// Home-screen tile summarising the signed-in user's outstanding internal tasks
// with a count + soonest deadline. Rendered on every user's home. Server
// component — generates + reads the user's own instances via the action.
export async function YourTasksTile() {
  const result = await getOutstandingTasks()
  const instances = result.instances ?? []

  const now = Date.now()
  const overdue = instances.filter((i) => new Date(i.due_at).getTime() < now)
  const soonest = instances
    .slice()
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0]

  const hasOverdue = overdue.length > 0
  const count = instances.length

  return (
    <Link href="/dashboard/my-tasks" className="block">
      <Card
        className={cn(
          'transition-colors hover:bg-muted/50',
          hasOverdue && 'border-destructive/50',
        )}
      >
        <CardContent className="flex items-center gap-4 py-4">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              count === 0
                ? 'bg-primary/10 text-primary'
                : hasOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-500/10 text-amber-600',
            )}
          >
            {hasOverdue ? (
              <AlertTriangle className="size-5" />
            ) : (
              <ClipboardCheck className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">Your Tasks</p>
              {count > 0 ? (
                <Badge variant={hasOverdue ? 'destructive' : 'secondary'}>
                  {count} outstanding
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {count === 0
                ? 'All internal tasks complete — nice work.'
                : hasOverdue
                  ? `${overdue.length} overdue · ${soonest?.template?.name ?? ''}`
                  : `Next: ${soonest?.template?.name ?? ''} due ${
                      soonest
                        ? new Date(soonest.due_at).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })
                        : ''
                    }`}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

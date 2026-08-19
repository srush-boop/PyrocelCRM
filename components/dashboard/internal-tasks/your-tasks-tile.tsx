import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOutstandingTasks } from '@/lib/actions/internal-tasks'
import { getMyAssetChecks } from '@/lib/asset-checks'

// Home-screen tile summarising the signed-in user's outstanding work — their
// recurring internal tasks plus any due/overdue asset checks they're
// responsible for — with a count + soonest deadline. Rendered on every user's
// home. Server component.
export async function YourTasksTile() {
  const [result, assetChecks] = await Promise.all([getOutstandingTasks(), getMyAssetChecks()])
  const instances = result.instances ?? []

  const now = Date.now()
  // Merge tasks + asset checks into one list of {name, dueMs} so the tile
  // summarises both in a single count and "next due" line.
  const items = [
    ...instances.map((i) => ({
      name: i.template?.name ?? 'Task',
      dueMs: new Date(i.due_at ?? 0).getTime(),
    })),
    ...assetChecks.map((c) => ({
      name: c.asset?.name ?? 'Asset check',
      dueMs: c.next_due_date ? new Date(c.next_due_date + 'T00:00:00Z').getTime() : 0,
    })),
  ]

  const overdue = items.filter((i) => i.dueMs < now)
  const soonest = items.slice().sort((a, b) => a.dueMs - b.dueMs)[0]

  const hasOverdue = overdue.length > 0
  const count = items.length

  return (
    <Link href="/dashboard/my-tasks" className="block h-full">
      <Card
        className={cn(
          'h-full transition-colors hover:bg-muted/50',
          hasOverdue && 'border-destructive/50',
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              count === 0
                ? 'bg-primary/10 text-primary'
                : hasOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-500/10 text-amber-600',
            )}
          >
            {hasOverdue ? (
              <AlertTriangle className="size-4" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold leading-tight">Tasks &amp; Forms</p>
              {count > 0 ? (
                <Badge
                  variant={hasOverdue ? 'destructive' : 'secondary'}
                  className="px-1.5 py-0 text-[11px]"
                >
                  {count}
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {count === 0
                ? 'All complete — nice work.'
                : hasOverdue
                  ? `${overdue.length} overdue · ${soonest?.name ?? ''}`
                  : `Next: ${soonest?.name ?? ''} due ${
                      soonest?.dueMs
                        ? new Date(soonest.dueMs).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })
                        : ''
                    }`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </div>
      </Card>
    </Link>
  )
}

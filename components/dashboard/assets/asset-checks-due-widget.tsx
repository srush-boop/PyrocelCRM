import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { CHECK_TYPE_LABELS, daysUntil, dueStatus } from '@/lib/assets'
import type { AssetCheckSchedule } from '@/lib/types/database'

export type ScheduleWithAsset = AssetCheckSchedule & {
  asset: { id: string; urn: string; name: string; status: string; assigned_to: string | null } | null
}

interface AssetChecksDueWidgetProps {
  schedules: ScheduleWithAsset[]
}

/** Lists overdue + due-soon checks (next 14 days), most urgent first. */
export function AssetChecksDueWidget({ schedules }: AssetChecksDueWidgetProps) {
  const relevant = schedules
    .filter((s) => s.asset && s.asset.status === 'active')
    .filter((s) => {
      const st = dueStatus(s.next_due_date)
      return st === 'overdue' || st === 'due_soon'
    })
    .slice(0, 8)

  if (relevant.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            Checks due
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No checks are due in the next 14 days.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5" />
          Checks due
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {relevant.map((s) => {
          const overdue = dueStatus(s.next_due_date) === 'overdue'
          const diff = daysUntil(s.next_due_date)
          return (
            <Link
              key={s.id}
              href={`/dashboard/assets/${s.asset!.urn}`}
              className="flex items-center justify-between gap-3 rounded-md border p-2 hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.asset!.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {CHECK_TYPE_LABELS[s.check_type]}: {s.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Badge variant={overdue ? 'destructive' : 'secondary'}>
                  {overdue
                    ? `${Math.abs(diff ?? 0)}d overdue`
                    : diff === 0
                      ? 'Due today'
                      : `in ${diff}d`}
                </Badge>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {s.next_due_date ? formatDateUK(s.next_due_date) : ''}
                </p>
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

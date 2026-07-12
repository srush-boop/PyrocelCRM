'use client'

import { Home, Car, Building2, UtensilsCrossed, TriangleAlert } from 'lucide-react'
import { formatDuration } from '@/lib/task-duration'
import { formatClock, type DayPlan, type TimelineRow } from '@/lib/routes/day-plan'
import { cn } from '@/lib/utils'

function RowIcon({ kind }: { kind: TimelineRow['kind'] }) {
  const base = 'h-4 w-4'
  switch (kind) {
    case 'leave-home':
    case 'return-home':
      return <Home className={cn(base, 'text-foreground')} />
    case 'travel':
      return <Car className={cn(base, 'text-muted-foreground')} />
    case 'lunch':
      return <UtensilsCrossed className={cn(base, 'text-amber-600')} />
    default:
      return <Building2 className={cn(base, 'text-primary')} />
  }
}

export function RouteDayTimeline({ plan }: { plan: DayPlan | null }) {
  if (!plan) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a CDO with a home postcode to model the day&apos;s arrival times.
      </p>
    )
  }

  return (
    <ol className="space-y-1.5">
      {plan.rows.map((row, i) => {
        if (row.kind === 'leave-home' || row.kind === 'return-home') {
          return (
            <li key={i} className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
              <RowIcon kind={row.kind} />
              <span className="text-sm font-medium">
                {row.kind === 'leave-home' ? 'Leave home' : 'Arrive home'}
              </span>
              <span className="ml-auto font-mono text-sm tabular-nums">
                {formatClock(row.kind === 'leave-home' ? row.startMin : row.endMin)}
              </span>
            </li>
          )
        }

        if (row.kind === 'travel') {
          return (
            <li key={i} className="flex items-center gap-3 px-3 py-1 text-muted-foreground">
              <RowIcon kind={row.kind} />
              <span className="text-xs">
                Drive {formatDuration(row.driveMinutes ?? 0)}
                {row.miles != null ? ` · ${row.miles} mi` : ''}
                {row.approximate ? ' (approx.)' : ''}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums">
                {formatClock(row.startMin)}–{formatClock(row.endMin)}
              </span>
            </li>
          )
        }

        if (row.kind === 'lunch') {
          return (
            <li
              key={i}
              className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
            >
              <RowIcon kind={row.kind} />
              <span className="text-sm font-medium">Lunch</span>
              <span className="ml-auto font-mono text-sm tabular-nums">
                {formatClock(row.startMin)}–{formatClock(row.endMin)}
              </span>
            </li>
          )
        }

        // site
        return (
          <li key={i} className="rounded-md border bg-card px-3 py-2">
            <div className="flex items-center gap-3">
              <RowIcon kind={row.kind} />
              <span className="text-sm font-semibold">{row.stopName}</span>
              {row.postcode && (
                <span className="text-xs text-muted-foreground">{row.postcode}</span>
              )}
              <span className="ml-auto font-mono text-sm tabular-nums">
                {formatClock(row.startMin)}–{formatClock(row.endMin)}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5 pl-7">
              {(row.services ?? []).map((svc) => (
                <li key={svc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{svc.label}</span>
                  <span className="ml-auto whitespace-nowrap tabular-nums">
                    {formatDuration(svc.minutes)}
                    {svc.learned ? (
                      <span className="text-muted-foreground/70"> · avg of {svc.sampleSize}</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-amber-600">
                        {' '}
                        <TriangleAlert className="h-3 w-3" /> est.
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

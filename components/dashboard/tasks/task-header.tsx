'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SystemIcon } from '@/lib/system-types'
import { useBackNavigation } from '@/hooks/use-back-navigation'
import { formatDateUK, formatTimeUK, cn } from '@/lib/utils'
import {
  ArrowLeft,
  MapPin,
  Navigation,
  CalendarClock,
  Clock,
} from 'lucide-react'
import type { TaskWithDetails, TaskStatus } from '@/lib/types/database'

// Visual treatment for each task status so the banner is scannable at a glance.
const STATUS_STYLES: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'border-border bg-muted text-foreground' },
  in_progress: { label: 'In progress', className: 'border-transparent bg-amber-500 text-white' },
  completed: { label: 'Completed', className: 'border-transparent bg-emerald-600 text-white' },
  cancelled: { label: 'Cancelled', className: 'border-transparent bg-destructive text-white' },
}

// Days between today and a YYYY-MM-DD date string (positive = in the future).
function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(`${dateStr}T00:00:00`)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

/**
 * Shared banner shown at the top of every task-execution flow. Leads with the
 * site, service and complete-by date, colour-codes urgency/status, exposes the
 * postcode, and links out to an interactive map with distance/travel time.
 */
export function TaskHeader({
  task,
  status,
}: {
  task: TaskWithDetails
  status: TaskStatus
}) {
  const handleBack = useBackNavigation('/dashboard/schedule')

  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const systemType = serviceType?.system_type
  const visitName = task.visit_type?.name
  const postcode = site?.postcode?.trim() || null
  const address = site?.address?.trim() || null

  // Compute urgency on the client only, so SSR/client markup matches (the
  // colour depends on "today", which the server can't know reliably).
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])

  const isClosed = status === 'completed' || status === 'cancelled'
  const diff = now ? daysUntil(task.scheduled_date, now) : null

  let dueClass = 'text-muted-foreground'
  let dueHint: string | null = null
  if (diff !== null && !isClosed) {
    if (diff < 0) {
      dueClass = 'text-destructive font-semibold'
      dueHint = `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`
    } else if (diff === 0) {
      dueClass = 'text-amber-600 dark:text-amber-400 font-semibold'
      dueHint = 'Due today'
    } else if (diff <= 7) {
      dueClass = 'text-amber-600 dark:text-amber-400 font-medium'
      dueHint = `Due in ${diff} day${diff === 1 ? '' : 's'}`
    } else {
      dueHint = `Due in ${diff} days`
    }
  }

  // Directions to the site. Google Maps shows live distance and travel time
  // from the user's current location once opened.
  const destination = [site?.name, address, postcode].filter(Boolean).join(', ')
  const directionsUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null

  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.pending

  return (
    <div className="space-y-3">
      {/* Row 1: back + status, always reachable at the top on mobile */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="-ml-2 gap-1.5 text-muted-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Badge className={cn('capitalize', statusStyle.className)}>{statusStyle.label}</Badge>
      </div>

      {/* Row 2: site identity */}
      <div className="flex items-start gap-3">
        {systemType && <SystemIcon system={systemType} boxed boxClassName="h-9 w-9 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-xl font-bold leading-tight sm:text-2xl">
            {site?.name ?? 'Call'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{serviceType?.name ?? 'Service'}</span>
            {visitName && <span>· {visitName}</span>}
          </p>
        </div>
      </div>

      {/* Row 3: address (tap for directions) */}
      {(address || postcode) &&
        (directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {address}
              {address && postcode ? ', ' : ''}
              {postcode && <span className="font-medium text-foreground">{postcode}</span>}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-primary">
              <Navigation className="h-4 w-4" />
              <span className="hidden sm:inline">Directions</span>
            </span>
          </a>
        ) : (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {address}
              {address && postcode ? ', ' : ''}
              {postcode}
            </span>
          </p>
        ))}

      {/* Row 4: due date + commenced, compact single line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm">
        <span className={cn('inline-flex items-center gap-1.5', dueClass)}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          Complete by {formatDateUK(task.scheduled_date)}
          {dueHint && <span className="font-normal opacity-90">({dueHint})</span>}
        </span>
        {task.started_at && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Commenced {formatTimeUK(task.started_at)}
          </span>
        )}
      </div>
    </div>
  )
}

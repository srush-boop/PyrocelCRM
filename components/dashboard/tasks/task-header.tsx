'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SystemIcon, SystemBadge } from '@/lib/system-types'
import { useBackNavigation } from '@/hooks/use-back-navigation'
import { formatDateUK, formatTimeUK, cn } from '@/lib/utils'
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Wrench,
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
    <div className="flex items-start gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="mt-0.5 shrink-0"
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-0 flex-1 space-y-3">
        {/* Status + classification badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn('capitalize', statusStyle.className)}>{statusStyle.label}</Badge>
          {systemType?.name ? (
            <SystemBadge system={systemType} />
          ) : (
            serviceType?.name && <Badge variant="outline">{serviceType.name}</Badge>
          )}
          {visitName && <Badge variant="secondary">{visitName}</Badge>}
        </div>

        {/* Site name */}
        <div className="flex items-start gap-3">
          {systemType && <SystemIcon system={systemType} boxed boxClassName="h-10 w-10 shrink-0" />}
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-bold leading-tight">{site?.name ?? 'Call'}</h1>
            {(address || postcode) && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {address}
                  {address && postcode ? ', ' : ''}
                  {postcode && <span className="font-medium text-foreground">{postcode}</span>}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Key facts: service + complete-by date */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{serviceType?.name ?? 'Service'}</span>
            {visitName && <span className="text-muted-foreground">· {visitName}</span>}
          </span>
          <span className={cn('inline-flex items-center gap-2 text-sm', dueClass)}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              Complete by {formatDateUK(task.scheduled_date)}
              {dueHint && <span className="ml-1 font-normal opacity-90">({dueHint})</span>}
            </span>
          </span>
        </div>

        {/* Commenced timestamp + directions link */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {task.started_at && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Commenced {formatDateUK(task.started_at)} at {formatTimeUK(task.started_at)}
            </span>
          )}
          {directionsUrl && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4" />
                Directions &amp; travel time
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

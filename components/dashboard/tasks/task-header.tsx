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
  User,
} from 'lucide-react'
import type { TaskWithDetails, TaskStatus } from '@/lib/types/database'
import { CreateDocumentButton } from '@/components/documents/create-document-dialog'
import { RespondByCountdown } from '@/components/dashboard/tasks/respond-by-countdown'
import { getCallTargetDate } from '@/lib/kpi'

// Visual treatment for each task status so the banner is scannable at a glance.
const STATUS_STYLES: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'border-border bg-muted text-foreground' },
  in_progress: { label: 'In progress', className: 'border-transparent bg-amber-500 text-white' },
  paused: { label: 'Paused', className: 'border-transparent bg-orange-400 text-white' },
  completed: { label: 'Completed', className: 'border-transparent bg-emerald-600 text-white' },
  cancelled: { label: 'Cancelled', className: 'border-transparent bg-destructive text-white' },
}

// Whole days between today and a target date (positive = in the future).
function daysUntilDate(target: Date, now: Date): number {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((t.getTime() - start.getTime()) / 86_400_000)
}

/**
 * Shared banner shown at the top of every task-execution flow. Leads with the
 * site, service and complete-by date, colour-codes urgency/status, exposes the
 * postcode, and links out to an interactive map with distance/travel time.
 */
export function TaskHeader({
  task,
  status,
  canCreateDocument = false,
  referenceNumber = null,
}: {
  task: TaskWithDetails
  status: TaskStatus
  // Office/admin only: exposes the "Create document" action for this call.
  canCreateDocument?: boolean
  // Call reference (from the task result, e.g. "PYR-2026-000121"). Shown to
  // everyone — incl. engineers — once a result row exists for the call.
  referenceNumber?: string | null
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

  // "Complete by" is the client KPI target date (visit date + tolerance, or the
  // due week/month for weekly/monthly recurring PPM) — not the raw visit date.
  const targetDate = getCallTargetDate({
    scheduledDate: task.scheduled_date,
    status,
    isRecurring: serviceType?.is_recurring,
    frequencyValue: task.site_service?.frequency_value,
    frequencyUnit: task.site_service?.frequency_unit,
    clientToleranceValue: task.site_service?.client_tolerance_value,
    clientToleranceUnit: task.site_service?.client_tolerance_unit,
    regulatoryToleranceValue: serviceType?.regulatory_tolerance_value,
    regulatoryToleranceUnit: serviceType?.regulatory_tolerance_unit,
  })
  const completeBy = targetDate ?? new Date(`${task.scheduled_date}T00:00:00`)
  // Show the visit date alongside when it differs from the complete-by date.
  const showVisitDate =
    formatDateUK(completeBy) !== formatDateUK(task.scheduled_date)

  const diff = now ? daysUntilDate(completeBy, now) : null

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

  // Attribution: prefer the live assigned engineer, else the name snapshotted
  // when the call was completed (survives the engineer's account being deleted).
  const engineerName =
    task.assigned_engineer?.full_name ||
    task.assigned_engineer?.email ||
    task.completed_engineer_name ||
    null

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
        <div className="flex items-center gap-2">
          {referenceNumber && (
            <span className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              {referenceNumber}
            </span>
          )}
          {canCreateDocument && (
            <CreateDocumentButton
              ownerType="task"
              ownerId={task.id}
              entityLabel={`Call — ${site?.name ?? 'Site'}`}
              revalidatePath={`/dashboard/tasks/${task.id}`}
            />
          )}
          <Badge className={cn('capitalize', statusStyle.className)}>{statusStyle.label}</Badge>
        </div>
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
          Complete by {formatDateUK(completeBy)}
          {dueHint && <span className="font-normal opacity-90">({dueHint})</span>}
        </span>
        {showVisitDate && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            Visit {formatDateUK(task.scheduled_date)}
          </span>
        )}
        {task.started_at && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Commenced {formatTimeUK(task.started_at)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" />
          {engineerName ? (
            <>
              Engineer <span className="font-medium text-foreground">{engineerName}</span>
            </>
          ) : (
            <span className="italic">Unassigned</span>
          )}
        </span>
      </div>

      {/* Respond-by countdown — shown for all users when the call has a KPI deadline */}
      {task.respond_by && (
        <RespondByCountdown
          respondBy={task.respond_by}
          isCompleted={isClosed}
          deadlineFailedReason={task.deadline_failed_reason ?? null}
        />
      )}
    </div>
  )
}

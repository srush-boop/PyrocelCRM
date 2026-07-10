'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface RespondByCountdownProps {
  /** ISO timestamp of the deadline (respond_by) */
  respondBy: string
  /** If the task is already completed, show a different state */
  isCompleted?: boolean
  /** Whether a deadline-failed reason has been recorded */
  deadlineFailedReason?: string | null
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  return `${minutes}m ${seconds}s`
}

export function RespondByCountdown({
  respondBy,
  isCompleted = false,
  deadlineFailedReason,
}: RespondByCountdownProps) {
  const deadline = new Date(respondBy).getTime()

  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    // Update every second while the deadline hasn't passed; slow to every minute after.
    const remaining = deadline - Date.now()
    const interval = remaining > 0 ? 1000 : 60_000
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [deadline])

  const remaining = deadline - now
  const overdue = remaining < 0
  const criticalThreshold = 60 * 60 * 1000 // 1 hour
  const warningThreshold = 4 * 60 * 60 * 1000 // 4 hours

  if (isCompleted) {
    const metDeadline = !overdue
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
          metDeadline
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-amber-300 bg-amber-50 text-amber-800',
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Response KPI:{' '}
          {metDeadline
            ? 'Met — completed within the deadline'
            : `Deadline missed — was due by ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(respondBy))}`}
          {!metDeadline && deadlineFailedReason && (
            <span className="ml-2 text-xs opacity-80">({deadlineFailedReason})</span>
          )}
        </span>
      </div>
    )
  }

  if (overdue) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
          deadlineFailedReason
            ? 'border-amber-300 bg-amber-50 text-amber-800'
            : 'border-destructive bg-destructive/10 text-destructive animate-pulse',
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {deadlineFailedReason
            ? `Deadline missed — ${deadlineFailedReason}`
            : `Deadline passed ${formatDuration(Math.abs(remaining))} ago — log a reason below`}
        </span>
      </div>
    )
  }

  const colorClass =
    remaining < criticalThreshold
      ? 'border-destructive bg-destructive/10 text-destructive'
      : remaining < warningThreshold
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-blue-300 bg-blue-50 text-blue-800'

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
        colorClass,
      )}
      role="timer"
      aria-live="polite"
      aria-label={`Respond by deadline: ${formatDuration(remaining)} remaining`}
    >
      <Clock className="h-4 w-4 shrink-0 animate-pulse" />
      <span>
        Respond within{' '}
        <span className="font-bold tabular-nums">{formatDuration(remaining)}</span>
        <span className="ml-2 text-xs font-normal opacity-70">
          (by{' '}
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(respondBy))}
          )
        </span>
      </span>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CircleCheck,
  CircleAlert,
  Moon,
  Phone,
  Plane,
  Clock,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimesheetSummary } from '@/lib/timesheets/compute'
import type { Timesheet } from '@/lib/types/database'
import { approveTimesheet, rejectTimesheet } from '@/lib/actions/timesheets'

type ReviewRow = Timesheet & { user_name: string | null }

function hm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function dateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function TimesheetReview({ initialQueue }: { initialQueue: ReviewRow[] }) {
  const [queue] = useState(initialQueue)

  if (queue.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <CircleCheck className="h-10 w-10 text-chart-2" />
          <p className="text-lg font-medium">All caught up</p>
          <p className="text-muted-foreground">No timesheets are waiting for review.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {queue.map((row) => (
        <ReviewCard key={row.id} row={row} />
      ))}
    </div>
  )
}

function ReviewCard({ row }: { row: ReviewRow }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const summary = row.summary as TimesheetSummary | null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{row.user_name ?? 'Unknown'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Week ending {dateLabel(row.week_ending)}
              {row.submitted_at &&
                ` · submitted ${new Date(row.submitted_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {row.late && (
              <Badge className="gap-1 bg-destructive/15 text-destructive">
                <CircleAlert className="h-3 w-3" /> Late
              </Badge>
            )}
            <Badge className="capitalize">{row.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Three OT totals */}
        <div className="grid gap-3 sm:grid-cols-3">
          <OtStat label="Mon–Fri" value={hm(summary?.weekdayOtMinutes ?? 0)} />
          <OtStat label="Saturday" value={hm(summary?.saturdayOtMinutes ?? 0)} />
          <OtStat label="Sunday" value={hm(summary?.sundayOtMinutes ?? 0)} />
        </div>

        {/* Secondary chips */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="flex items-center gap-1 rounded-md border px-2 py-1">
            <Moon className="h-3.5 w-3.5 text-chart-3" /> {summary?.nightShiftCount ?? 0} night
          </span>
          <span className="flex items-center gap-1 rounded-md border px-2 py-1">
            <Phone className="h-3.5 w-3.5 text-chart-2" /> {summary?.oncallCount ?? 0} on-call
          </span>
          <span className="flex items-center gap-1 rounded-md border px-2 py-1">
            <Clock className="h-3.5 w-3.5" /> {hm(summary?.totalWorkedMinutes ?? 0)} worked
          </span>
          {(summary?.leave.length ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-md border px-2 py-1">
              <Plane className="h-3.5 w-3.5 text-chart-4" />
              {summary?.leave.map((l) => l.type).join(', ')}
            </span>
          )}
        </div>

        {row.toolbox_reference && (
          <p className="text-sm text-muted-foreground">
            Toolbox talk reference:{' '}
            <span className="font-medium text-foreground">{row.toolbox_reference}</span>
          </p>
        )}

        {/* Daily detail (collapsible) */}
        {summary && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Hide' : 'Show'} daily breakdown
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {summary.days
                  .filter((d) => d.entries.length > 0 || d.shiftStart)
                  .map((d) => (
                    <div
                      key={d.date}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {d.dayName} {dateLabel(d.date)}
                      </span>
                      <span className="text-muted-foreground">
                        {d.shiftStart
                          ? `${new Date(d.shiftStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${d.shiftEnd ? new Date(d.shiftEnd).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--'}`
                          : 'No shift'}
                        {d.weekdayOtMinutes + d.weekendOtMinutes > 0 &&
                          ` · OT ${hm(d.weekdayOtMinutes + d.weekendOtMinutes)}`}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={pending}
          >
            Return for changes
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                await approveTimesheet(row.id)
                router.refresh()
              })
            }
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleCheck className="mr-2 h-4 w-4" />
            )}
            Approve
          </Button>
        </div>
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return timesheet for changes</DialogTitle>
            <DialogDescription>
              Let {row.user_name ?? 'the team member'} know what needs correcting.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for returning this timesheet"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  await rejectTimesheet(row.id, reason.trim() || undefined)
                  setRejectOpen(false)
                  router.refresh()
                })
              }
              disabled={pending}
            >
              Return for changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function OtStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">Overtime · {label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ClipboardList,
  FileClock,
  CalendarClock,
  CalendarCheck,
  ArrowRight,
  Loader2,
  CalendarIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatDateUK, formatBookedSlot, cn } from '@/lib/utils'
import { SystemIcon, getSystemColors } from '@/lib/system-types'
import { bookExistingCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'

export interface UpcomingVisit {
  /** Stable list key (task id for created calls, synthetic for forecasts). */
  key: string
  /** Task id when the call already exists; null for a forecast occurrence. */
  taskId: string | null
  /** 'created' = a task row exists; 'forecast' = due to be generated. */
  status: 'created' | 'forecast'
  serviceName: string
  systemName: string | null
  systemColor: string | null
  systemCode: string | null
  scheduledDate: string
  bookedStartTime: string | null
  bookedEndTime: string | null
  /** Weekly recurring PPM calls can't be booked as an individual appointment. */
  isWeeklyRecurring: boolean
}

interface SiteCallsOverviewCardProps {
  siteId: string
  openCallsCount: number
  awaitingPoCount: number
  upcomingVisits: UpcomingVisit[]
}

// ─── Inline "Book now" popover ──────────────────────────────────────────────

function BookNowPopover({ visit }: { visit: UpcomingVisit }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<Date>(new Date(`${visit.scheduledDate}T12:00:00`))
  const [start, setStart] = useState((visit.bookedStartTime ?? '').slice(0, 5))
  const [end, setEnd] = useState((visit.bookedEndTime ?? '').slice(0, 5))
  const [sendConfirmation, setSendConfirmation] = useState(!visit.bookedStartTime)
  const [saving, setSaving] = useState(false)

  const alreadyBooked = !!visit.bookedStartTime

  const save = async () => {
    setSaving(true)
    const res = await bookExistingCall({
      taskId: visit.taskId as string,
      scheduledDate: format(date, 'yyyy-MM-dd'),
      bookedStartTime: start || null,
      bookedEndTime: end || null,
      sendConfirmation,
    })
    setSaving(false)
    if (res.ok) {
      toast.success(alreadyBooked ? 'Booking updated' : 'Call booked')
      setOpen(false)
      router.refresh()
    } else {
      toast.error(res.error ?? 'Could not save the booking.')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={alreadyBooked ? 'outline' : 'default'} className="shrink-0">
          {alreadyBooked ? (
            <>
              <CalendarCheck className="h-4 w-4" />
              Booked
            </>
          ) : (
            <>
              <CalendarClock className="h-4 w-4" />
              Book now
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-sm font-medium">
          {alreadyBooked ? 'Update appointment' : 'Book appointment'}
        </p>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-start text-left font-normal"
                size="sm"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={`start-${visit.key}`} className="text-xs text-muted-foreground">
              Start time
            </label>
            <Input
              id={`start-${visit.key}`}
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`end-${visit.key}`} className="text-xs text-muted-foreground">
              End time
            </label>
            <Input
              id={`end-${visit.key}`}
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={sendConfirmation}
            onCheckedChange={(c) => setSendConfirmation(c === true)}
          />
          Email the site &amp; client a booking confirmation
        </label>
        <Button size="sm" className="w-full" disabled={saving || !start} onClick={save}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {alreadyBooked ? 'Update booking' : 'Book call'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

// ─── Main tile ──────────────────────────────────────────────────────────────

export function SiteCallsOverviewCard({
  siteId,
  openCallsCount,
  awaitingPoCount,
  upcomingVisits,
}: SiteCallsOverviewCardProps) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Calls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stat tiles */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/dashboard/sites/${siteId}?tab=calls`}
            className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">Open calls</span>
            </div>
            <span className="text-2xl font-bold tabular-nums">{openCallsCount}</span>
          </Link>

          <Link
            href={`/dashboard/sites/${siteId}?tab=calls`}
            className={cn(
              'flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50',
              awaitingPoCount > 0 && 'border-amber-500/50 bg-amber-500/5',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md',
                  awaitingPoCount > 0
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <FileClock className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">Awaiting PO</span>
            </div>
            <span
              className={cn(
                'text-2xl font-bold tabular-nums',
                awaitingPoCount > 0 && 'text-amber-600 dark:text-amber-400',
              )}
            >
              {awaitingPoCount}
            </span>
          </Link>
        </div>

        {/* Upcoming visits */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Expected in the next 6 months</p>
            {upcomingVisits.length > 0 && (
              <Badge variant="secondary">{upcomingVisits.length}</Badge>
            )}
          </div>

          {upcomingVisits.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              No service calls scheduled in the next 6 months.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {upcomingVisits.map((visit) => {
                const colors = getSystemColors(visit.systemColor)
                const bookedSlot = formatBookedSlot(
                  visit.bookedStartTime,
                  visit.bookedEndTime,
                )
                return (
                  <li
                    key={visit.key}
                    className="flex items-center gap-3 p-3 border-l-4"
                    style={{ borderLeftColor: colors.solid }}
                  >
                    <SystemIcon
                      system={{
                        name: visit.systemName ?? visit.serviceName,
                        code: visit.systemCode ?? undefined,
                        color: visit.systemColor ?? undefined,
                      }}
                      boxed
                      boxClassName="h-8 w-8 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {visit.systemName
                          ? `${visit.systemName} · ${visit.serviceName}`
                          : visit.serviceName}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {formatDateUK(visit.scheduledDate)}
                        </span>
                        {bookedSlot && (
                          <>
                            <span aria-hidden>•</span>
                            <span className="text-primary">{bookedSlot}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {visit.isWeeklyRecurring ? (
                      <Badge variant="outline" className="shrink-0 text-xs font-normal">
                        Weekly PPM
                      </Badge>
                    ) : visit.status === 'forecast' ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-1 text-xs font-normal text-muted-foreground"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Not yet generated
                      </Badge>
                    ) : (
                      <BookNowPopover visit={visit} />
                    )}
                    {visit.taskId && (
                      <Button variant="ghost" size="icon" asChild className="shrink-0">
                        <Link href={`/dashboard/tasks/${visit.taskId}`} aria-label="View call">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Send,
  CircleCheck,
  CircleAlert,
  Moon,
  Phone,
  Plane,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimesheetSummary } from '@/lib/timesheets/compute'
import type { Timesheet, TimesheetManualEntry, InternalTaskInstance } from '@/lib/types/database'
import {
  getOrBuildTimesheet,
  addManualEntry,
  deleteManualEntry,
  submitTimesheet,
  setNightShiftDates,
} from '@/lib/actions/timesheets'

interface Props {
  initial: {
    timesheet: Timesheet
    summary: TimesheetSummary
    manualEntries: TimesheetManualEntry[]
    deadline: string
    isLocked: boolean
    canEdit: boolean
  }
  outstandingTasks: InternalTaskInstance[]
}

function hm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function timeLabel(iso: string | null): string {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function dateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-chart-4/15 text-chart-4',
  approved: 'bg-chart-2/15 text-chart-2',
  rejected: 'bg-destructive/15 text-destructive',
}

export function TimesheetView({ initial, outstandingTasks }: Props) {
  const router = useRouter()
  const [view, setView] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { timesheet, summary, manualEntries, deadline, canEdit } = view

  const requiredOutstanding = useMemo(
    () => outstandingTasks.filter((t) => t.template?.requires_reference),
    [outstandingTasks],
  )
  const toolboxTask = requiredOutstanding[0] ?? null

  async function reload(weekEnding: string) {
    const res = await getOrBuildTimesheet(weekEnding)
    if (res.ok) {
      setView({
        timesheet: res.timesheet,
        summary: res.summary,
        manualEntries: res.manualEntries,
        deadline: res.deadline,
        isLocked: res.isLocked,
        canEdit: res.canEdit,
      })
    }
  }

  function shiftWeek(deltaDays: number) {
    const [y, m, d] = summary.weekEnding.split('-').map(Number)
    const base = new Date(y, (m || 1) - 1, d || 1)
    base.setDate(base.getDate() + deltaDays)
    const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
    startTransition(() => {
      void reload(iso)
    })
  }

  // Toggle a single day's night-shift confirmation. Builds the explicit set of
  // ticked dates from the current summary (so the first tick also "locks in" the
  // rest as not-night, ending any auto-suggestion), flips the target day, saves,
  // then reloads so the summary + night count recompute.
  function toggleNightShift(date: string, checked: boolean) {
    const current = summary.days.filter((d) => d.isNightShift).map((d) => d.date)
    const next = checked
      ? Array.from(new Set([...current, date]))
      : current.filter((d) => d !== date)
    startTransition(async () => {
      const res = await setNightShiftDates({ timesheetId: timesheet.id, dates: next })
      if (!res.ok) {
        setError(res.error ?? 'Could not update night shift.')
        return
      }
      await reload(summary.weekEnding)
    })
  }

  const deadlineDate = new Date(deadline)
  const deadlinePassed = Date.now() > deadlineDate.getTime()

  return (
    <div className="space-y-6">
      {/* Header: week nav + status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(-7)}
            disabled={pending}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-52 text-center">
            <p className="text-sm text-muted-foreground">Week ending</p>
            <p className="text-lg font-semibold">{dateLabel(summary.weekEnding)}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(7)}
            disabled={pending}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={cn('capitalize', STATUS_TONE[timesheet.status])}>
            {timesheet.status}
          </Badge>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Deadline</p>
            <p className={cn('font-medium', deadlinePassed && timesheet.status === 'draft' && 'text-destructive')}>
              {deadlineDate.toLocaleString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>

      {timesheet.status === 'rejected' && timesheet.rejection_reason && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Returned for changes: {timesheet.rejection_reason}</span>
        </div>
      )}

      {/* Overtime summary: three totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat label="Overtime Mon–Fri" value={hm(summary.weekdayOtMinutes)} accent="chart-1" />
        <SummaryStat label="Overtime Saturday" value={hm(summary.saturdayOtMinutes)} accent="chart-4" />
        <SummaryStat label="Overtime Sunday" value={hm(summary.sundayOtMinutes)} accent="chart-5" />
      </div>

      {/* Secondary summary: night shifts, on-call, leave */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Moon className="h-4 w-4 text-chart-3" />
              Night shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.nightShiftCount}</p>
            <p className="text-xs text-muted-foreground">
              {summary.nightShiftCount === 0
                ? 'None this week'
                : `${summary.nightRateLabel} — ${summary.nightShiftDays.map(dateLabel).join(', ')}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-chart-2" />
              On-call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.oncallCount}</p>
            <p className="text-xs text-muted-foreground">
              {summary.oncallCount === 0
                ? 'No on-call shifts'
                : summary.oncall
                    .map((o) => `${o.dayName}${o.band ? ` (${o.band})` : ''}`)
                    .join(', ')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Plane className="h-4 w-4 text-chart-4" />
              Leave &amp; absence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.leave.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {summary.leave.map((l) => (
                  <li key={l.type}>
                    <span className="font-medium">{l.type}:</span>{' '}
                    {l.dates.map(dateLabel).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Daily breakdown</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add entry
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.days.map((day) => {
            const ot = day.weekdayOtMinutes + day.weekendOtMinutes
            return (
              <div key={day.date} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{day.dayName}</span>
                    <span className="text-sm text-muted-foreground">{dateLabel(day.date)}</span>
                    {canEdit ? (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={day.isNightShift}
                          onCheckedChange={(v) => toggleNightShift(day.date, v === true)}
                          disabled={pending}
                          aria-label={`Confirm ${day.dayName} as night shift`}
                        />
                        <Moon className="h-3 w-3" /> Night shift
                        {!day.isNightShift && day.nightAutoSuggested && (
                          <span className="text-chart-3">(suggested)</span>
                        )}
                      </label>
                    ) : (
                      day.isNightShift && (
                        <Badge variant="outline" className="gap-1 text-chart-3">
                          <Moon className="h-3 w-3" /> Night
                        </Badge>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {day.shiftStart && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {timeLabel(day.shiftStart)}–{timeLabel(day.shiftEnd)}
                      </span>
                    )}
                    {ot > 0 && (
                      <Badge className="bg-chart-1/15 text-chart-1">OT {hm(ot)}</Badge>
                    )}
                  </div>
                </div>
                {day.entries.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {day.entries.map((e, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-sm text-muted-foreground"
                      >
                        <span className="flex items-center gap-2">
                          {e.isLeave && <Plane className="h-3.5 w-3.5" />}
                          {e.label}
                        </span>
                        <span>
                          {e.allDay
                            ? 'All day'
                            : `${timeLabel(e.start)}–${timeLabel(e.end)} · ${hm(e.minutes)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {day.entries.length === 0 && !day.shiftStart && (
                  <p className="mt-2 border-t pt-2 text-sm text-muted-foreground">
                    No activity recorded
                  </p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Manual entries list (deletable while editable) */}
      {manualEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Manual entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {manualEntries.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{dateLabel(m.entry_date)}</span>{' '}
                  <span className="text-muted-foreground">
                    {timeLabel(m.start_at)}–{timeLabel(m.end_at)}
                  </span>
                  {m.description && (
                    <span className="text-muted-foreground"> · {m.description}</span>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteManualEntry(m.id)
                        await reload(summary.weekEnding)
                      })
                    }
                    aria-label="Delete manual entry"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setSubmitOpen(true)} disabled={pending}>
            <Send className="mr-2 h-4 w-4" />
            Confirm &amp; submit
          </Button>
        </div>
      )}

      <AddManualEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        timesheetId={timesheet.id}
        weekEnding={summary.weekEnding}
        onSaved={() => {
          setAddOpen(false)
          startTransition(() => reload(summary.weekEnding))
        }}
      />

      <SubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        timesheetId={timesheet.id}
        deadlinePassed={deadlinePassed}
        outstandingTasks={outstandingTasks}
        toolboxTask={toolboxTask}
        error={error}
        onSubmit={(confirmedIds, reference) =>
          startTransition(async () => {
            setError(null)
            const res = await submitTimesheet({
              id: timesheet.id,
              confirmedTaskInstanceIds: confirmedIds,
              toolboxReference: reference,
            })
            if (res.ok) {
              setSubmitOpen(false)
              router.refresh()
              await reload(summary.weekEnding)
            } else {
              setError(res.error ?? 'Could not submit')
            }
          })
        }
        pending={pending}
      />
    </div>
  )
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-3xl font-semibold', `text-${accent}`)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function AddManualEntryDialog({
  open,
  onOpenChange,
  timesheetId,
  weekEnding,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  timesheetId: string
  weekEnding: string
  onSaved: () => void
}) {
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Constrain the date picker to the timesheet week (Mon–Sun).
  const [wy, wm, wd] = weekEnding.split('-').map(Number)
  const sunday = new Date(wy, (wm || 1) - 1, wd || 1)
  const monday = new Date(sunday)
  monday.setDate(sunday.getDate() - 6)
  const minDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

  async function save() {
    if (!date || !start || !end) {
      setErr('Date, start and end are required.')
      return
    }
    const startAt = new Date(`${date}T${start}`)
    const endAt = new Date(`${date}T${end}`)
    if (endAt <= startAt) {
      setErr('End time must be after start time.')
      return
    }
    setSaving(true)
    setErr(null)
    const res = await addManualEntry({
      timesheetId,
      entryDate: date,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      description: description.trim() || undefined,
    })
    setSaving(false)
    if (res.ok) {
      setDate('')
      setStart('')
      setEnd('')
      setDescription('')
      onSaved()
    } else {
      setErr(res.error ?? 'Could not add entry')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add manual entry</DialogTitle>
          <DialogDescription>
            Record time not captured by a call — for example when you worked
            alongside another engineer who owned the job.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="me-date">Date</Label>
            <Input
              id="me-date"
              type="date"
              value={date}
              min={minDate}
              max={weekEnding}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="me-start">Start</Label>
              <Input id="me-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="me-end">End</Label>
              <Input id="me-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="me-desc">Description</Label>
            <Textarea
              id="me-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What were you doing?"
              rows={2}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SubmitDialog({
  open,
  onOpenChange,
  deadlinePassed,
  outstandingTasks,
  toolboxTask,
  error,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  timesheetId: string
  deadlinePassed: boolean
  outstandingTasks: InternalTaskInstance[]
  toolboxTask: InternalTaskInstance | null
  error: string | null
  onSubmit: (confirmedIds: string[], reference?: string) => void
  pending: boolean
}) {
  const [confirmedTasks, setConfirmedTasks] = useState(false)
  const [reference, setReference] = useState('')
  const [confirmAccurate, setConfirmAccurate] = useState(false)

  const needsReference = !!toolboxTask
  const canSubmit =
    confirmAccurate &&
    (outstandingTasks.length === 0 || confirmedTasks) &&
    (!needsReference || reference.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm &amp; submit timesheet</DialogTitle>
          <DialogDescription>
            {deadlinePassed
              ? 'The Monday 09:00 deadline has passed — this will be flagged as a late submission.'
              : 'Once submitted, your manager will review and approve your timesheet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {outstandingTasks.length > 0 && (
            <div className="space-y-3 rounded-lg border border-chart-4/30 bg-chart-4/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4" />
                Recurring internal tasks
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {outstandingTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <CircleAlert className="h-3.5 w-3.5 text-chart-4" />
                    {t.template?.name ?? 'Task'}
                  </li>
                ))}
              </ul>
              {needsReference && (
                <div className="space-y-2">
                  <Label htmlFor="tbt-ref">
                    {toolboxTask?.template?.reference_label ?? 'Toolbox talk reference number'}
                  </Label>
                  <Input
                    id="tbt-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. TBT-2026-03"
                  />
                </div>
              )}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={confirmedTasks}
                  onCheckedChange={(v) => setConfirmedTasks(v === true)}
                  className="mt-0.5"
                />
                <span>
                  I confirm I have completed the recurring internal tasks listed above
                  {needsReference ? ', including reading the weekly toolbox talk.' : '.'}
                </span>
              </label>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmAccurate}
              onCheckedChange={(v) => setConfirmAccurate(v === true)}
              className="mt-0.5"
            />
            <span>I confirm the hours recorded on this timesheet are accurate.</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit(
                outstandingTasks.map((t) => t.id),
                needsReference ? reference.trim() : undefined,
              )
            }
            disabled={!canSubmit || pending}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleCheck className="mr-2 h-4 w-4" />
            )}
            Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

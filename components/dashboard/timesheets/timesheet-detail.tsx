'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Moon, Phone, Plane, Clock, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimesheetSummary } from '@/lib/timesheets/compute'

// Read-only full breakdown of a computed/frozen timesheet summary. Mirrors the
// engineer's own "Daily breakdown" + night/on-call/leave cards, but with no edit
// controls — used by approvers/admin to drill into a submitted sheet.

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

function timeLabel(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function TimesheetDetail({ summary }: { summary: TimesheetSummary }) {
  return (
    <div className="space-y-4">
      {/* Leave-vs-shift conflict warning (advisory — does not change totals) */}
      {summary.conflicts.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-chart-4" />
          <div className="space-y-1">
            <p className="font-medium text-chart-4">
              Booked off but worked — {summary.conflicts.length === 1 ? '1 day' : `${summary.conflicts.length} days`} to check
            </p>
            <ul className="space-y-0.5 text-muted-foreground">
              {summary.conflicts.map((c) => (
                <li key={c.date}>
                  <span className="font-medium text-foreground">{dateLabel(c.date)}</span>: recorded{' '}
                  {hm(c.workedMinutes)} of work while on {c.leaveTypes.join(' & ').toLowerCase()}.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Secondary summary: night shifts, on-call, leave */}
      <div className="grid gap-3 md:grid-cols-3">
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

      {/* Daily breakdown with full per-entry detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.days.map((day) => {
            const ot = day.weekdayOtMinutes + day.weekendOtMinutes
            return (
              <div
                key={day.date}
                className={cn(
                  'rounded-lg border p-3',
                  day.leaveConflict && 'border-chart-4/50 bg-chart-4/5',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{day.dayName}</span>
                    <span className="text-sm text-muted-foreground">{dateLabel(day.date)}</span>
                    {day.leaveConflict && (
                      <Badge variant="outline" className="gap-1 border-chart-4/40 text-chart-4">
                        <TriangleAlert className="h-3 w-3" />
                        Worked on {day.conflictLeaveTypes.join(' & ').toLowerCase()}
                      </Badge>
                    )}
                    {day.isNightShift && (
                      <Badge variant="outline" className="gap-1 text-chart-3">
                        <Moon className="h-3 w-3" /> Night
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {day.shiftStart && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {timeLabel(day.shiftStart)}–{timeLabel(day.shiftEnd)}
                      </span>
                    )}
                    {ot > 0 && <Badge className="bg-chart-1/15 text-chart-1">OT {hm(ot)}</Badge>}
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
    </div>
  )
}

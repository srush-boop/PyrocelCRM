'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ClipboardCheck,
  Search,
  Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimesheetSummary } from '@/lib/timesheets/compute'
import type { Timesheet } from '@/lib/types/database'
import {
  approveTimesheet,
  rejectTimesheet,
  setProcessed,
} from '@/lib/actions/timesheets'
import { TimesheetDetail } from './timesheet-detail'

type ReviewRow = Timesheet & { user_name: string | null }
type CardMode = 'approve' | 'process'
type SectionFilter = 'all' | 'approve' | 'process' | 'processed'

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

export function TimesheetReview({
  approveQueue,
  processQueue,
}: {
  approveQueue: ReviewRow[]
  processQueue: ReviewRow[]
}) {
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<SectionFilter>('all')
  const [lateOnly, setLateOnly] = useState(false)

  // The processing queue carries both unprocessed and already-processed sheets;
  // splitting here means a sheet moves from "To process" to "Processed" as soon
  // as it is ticked (router.refresh re-fetches and re-partitions).
  const toProcess = useMemo(() => processQueue.filter((r) => !r.processed), [processQueue])
  const processed = useMemo(() => processQueue.filter((r) => r.processed), [processQueue])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (r: ReviewRow) => {
      if (q && !(r.user_name ?? '').toLowerCase().includes(q)) return false
      if (lateOnly && !r.late) return false
      return true
    }
  }, [search, lateOnly])

  const showApprove = section === 'all' || section === 'approve'
  const showProcess = section === 'all' || section === 'process'
  const showProcessed = section === 'all' || section === 'processed'

  const fApprove = showApprove ? approveQueue.filter(matches) : []
  const fToProcess = showProcess ? toProcess.filter(matches) : []
  const fProcessed = showProcessed ? processed.filter(matches) : []

  const bothEmpty = approveQueue.length === 0 && processQueue.length === 0
  const filteredEmpty = fApprove.length === 0 && fToProcess.length === 0 && fProcessed.length === 0

  // Flat list (with a stage label) backing the print-only summary table.
  const printRows: Array<{ stage: string; row: ReviewRow }> = [
    ...fApprove.map((row) => ({ stage: 'To approve', row })),
    ...fToProcess.map((row) => ({ stage: 'To process', row })),
    ...fProcessed.map((row) => ({ stage: 'Processed', row })),
  ]

  if (bothEmpty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <CircleCheck className="h-10 w-10 text-chart-2" />
          <p className="text-lg font-medium">All caught up</p>
          <p className="text-muted-foreground">
            No timesheets are waiting to approve or process.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter + print toolbar (excluded from print output) */}
      <div className="no-print flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="ts-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="ts-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Employee name"
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">Stage</Label>
          <Select value={section} onValueChange={(v) => setSection(v as SectionFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              <SelectItem value="approve">To approve</SelectItem>
              <SelectItem value="process">To process</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox
            checked={lateOnly}
            onCheckedChange={(v) => setLateOnly(v === true)}
          />
          Late only
        </label>
        <Button
          type="button"
          variant="outline"
          className="ml-auto"
          onClick={() => window.print()}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Print-only summary grid honouring the current filters */}
      <PrintSummaryTable rows={printRows} />

      {filteredEmpty ? (
        <p className="no-print py-8 text-center text-sm text-muted-foreground">
          No timesheets match the current filters.
        </p>
      ) : (
        <div className="print:hidden space-y-8">
          {showApprove && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">To approve</h2>
                <Badge variant="secondary">{fApprove.length}</Badge>
              </div>
              {fApprove.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing awaiting approval.</p>
              ) : (
                fApprove.map((row) => <ReviewCard key={row.id} row={row} mode="approve" />)
              )}
            </section>
          )}

          {showProcess && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">To process</h2>
                <Badge variant="secondary">{fToProcess.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Approved timesheets ready for payroll processing. Tick when processed.
              </p>
              {fToProcess.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing awaiting processing.</p>
              ) : (
                fToProcess.map((row) => <ReviewCard key={row.id} row={row} mode="process" />)
              )}
            </section>
          )}

          {showProcessed && fProcessed.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">Processed</h2>
                <Badge variant="secondary">{fProcessed.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Completed for payroll. Untick to move a sheet back to processing.
              </p>
              {fProcessed.map((row) => (
                <ReviewCard key={row.id} row={row} mode="process" />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function PrintSummaryTable({
  rows,
}: {
  rows: Array<{ stage: string; row: ReviewRow }>
}) {
  if (rows.length === 0) return null
  return (
    <div className="hidden print:block">
      <h2 className="mb-1 text-lg font-semibold">Timesheets</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {rows.length} timesheet{rows.length === 1 ? '' : 's'} ·{' '}
        {new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-2 font-medium">Employee</th>
            <th className="py-1 pr-2 font-medium">Week ending</th>
            <th className="py-1 pr-2 font-medium">Stage</th>
            <th className="py-1 pr-2 font-medium">Late</th>
            <th className="py-1 pr-2 text-right font-medium">Mon–Fri OT</th>
            <th className="py-1 pr-2 text-right font-medium">Sat OT</th>
            <th className="py-1 pr-2 text-right font-medium">Sun OT</th>
            <th className="py-1 pr-2 text-right font-medium">Night</th>
            <th className="py-1 pr-2 text-right font-medium">On-call</th>
            <th className="py-1 pr-2 text-right font-medium">Worked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ stage, row }) => {
            const s = row.summary as TimesheetSummary | null
            return (
              <tr key={row.id} className="avoid-break border-b">
                <td className="py-1 pr-2">{row.user_name ?? 'Unknown'}</td>
                <td className="py-1 pr-2">{dateLabel(row.week_ending)}</td>
                <td className="py-1 pr-2">{stage}</td>
                <td className="py-1 pr-2">{row.late ? 'Yes' : '—'}</td>
                <td className="py-1 pr-2 text-right">{hm(s?.weekdayOtMinutes ?? 0)}</td>
                <td className="py-1 pr-2 text-right">{hm(s?.saturdayOtMinutes ?? 0)}</td>
                <td className="py-1 pr-2 text-right">{hm(s?.sundayOtMinutes ?? 0)}</td>
                <td className="py-1 pr-2 text-right">{s?.nightShiftCount ?? 0}</td>
                <td className="py-1 pr-2 text-right">{s?.oncallCount ?? 0}</td>
                <td className="py-1 pr-2 text-right">{hm(s?.totalWorkedMinutes ?? 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReviewCard({ row, mode }: { row: ReviewRow; mode: CardMode }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const summary = row.summary as TimesheetSummary | null

  // Once a timesheet has been processed the work is done, so the tile collapses
  // to a compact one-line row to keep the processed list tidy. It can be
  // re-opened on demand, and the un-tick control stays reachable.
  const isProcessed = mode === 'process' && row.processed
  const [showFull, setShowFull] = useState(false)

  if (isProcessed && !showFull) {
    return (
      <Card className="border-chart-2/30 bg-chart-2/5">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-chart-2" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.user_name ?? 'Unknown'}</p>
            <p className="truncate text-xs text-muted-foreground">
              Week ending {dateLabel(row.week_ending)}
              {row.processed_at &&
                ` · processed ${new Date(row.processed_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
            </p>
          </div>
          {row.late && (
            <Badge className="gap-1 bg-destructive/15 text-destructive">
              <CircleAlert className="h-3 w-3" /> Late
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFull(true)}
            className="text-muted-foreground"
          >
            <ChevronDown className="mr-1 h-4 w-4" />
            Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setProcessed(row.id, false)
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Untick
          </Button>
        </CardContent>
      </Card>
    )
  }

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
            {mode === 'process' && row.processed ? (
              <Badge className="gap-1 bg-chart-2/15 text-chart-2">
                <ClipboardCheck className="h-3 w-3" /> Processed
              </Badge>
            ) : (
              <Badge className="capitalize">{row.status}</Badge>
            )}
            {isProcessed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFull(false)}
                className="text-muted-foreground"
              >
                Collapse
              </Button>
            )}
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
              {expanded ? 'Hide' : 'View'} full timesheet
            </button>
            {expanded && (
              <div className="mt-3">
                <TimesheetDetail summary={summary} />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {mode === 'approve' ? (
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={pending}>
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
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={row.processed}
                disabled={pending}
                onCheckedChange={(v) =>
                  startTransition(async () => {
                    await setProcessed(row.id, v === true)
                    router.refresh()
                  })
                }
              />
              Mark as processed
            </label>
            {row.processed && row.processed_at && (
              <span className="text-xs text-muted-foreground">
                Processed{' '}
                {new Date(row.processed_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        )}
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

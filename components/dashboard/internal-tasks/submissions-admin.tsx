'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronRight,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ClipboardList,
  AlertCircle,
  Check,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { InternalTaskInstance } from '@/lib/types/database'
import type { CompletionReport } from '@/lib/internal-tasks/completion-report'
import {
  getAllSubmissions,
  getMonthlyCompletionReport,
  sendCompletionReport,
  revokeAssignedInstance,
  revokeOutstandingForTemplate,
  type SubmissionFilters,
} from '@/lib/actions/internal-tasks'
import { InternalTaskSheet } from './internal-task-sheet'

interface Props {
  initialInstances: InternalTaskInstance[]
  templates: { id: string; name: string }[]
  users: { id: string; name: string }[]
  initialReport: CompletionReport | null
}

const ALL = '__all__'

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function SubmissionsAdmin({ initialInstances, templates, users, initialReport }: Props) {
  const [instances, setInstances] = useState(initialInstances)
  const [filters, setFilters] = useState<SubmissionFilters>({ status: 'all' })
  const [loading, startLoad] = useTransition()

  const [active, setActive] = useState<InternalTaskInstance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [month, setMonth] = useState(currentMonth())
  const [reportTemplateId, setReportTemplateId] = useState<string>(ALL)
  const [report, setReport] = useState<CompletionReport | null>(initialReport)
  const [reportLoading, startReport] = useTransition()
  const [sending, startSend] = useTransition()
  const [sentMsg, setSentMsg] = useState<string | null>(null)

  // Row-level + bulk revoke of outstanding assignments.
  const [revoking, startRevoke] = useTransition()

  function updateFilter(patch: Partial<SubmissionFilters>) {
    const next = { ...filters, ...patch }
    setFilters(next)
    startLoad(async () => {
      const res = await getAllSubmissions(next)
      if (res.ok) setInstances(res.instances ?? [])
    })
  }

  function reloadSubmissions() {
    startLoad(async () => {
      const res = await getAllSubmissions(filters)
      if (res.ok) setInstances(res.instances ?? [])
    })
  }

  function revokeOne(instanceId: string) {
    startRevoke(async () => {
      const res = await revokeAssignedInstance(instanceId)
      if (res.ok) setInstances((list) => list.filter((i) => i.id !== instanceId))
    })
  }

  function revokeAllForTemplate(templateId: string) {
    startRevoke(async () => {
      const res = await revokeOutstandingForTemplate(templateId)
      if (res.ok) reloadSubmissions()
    })
  }

  function openReview(inst: InternalTaskInstance) {
    setActive(inst)
    setSheetOpen(true)
  }

  // Deep link from a flagged-issue notification: /…/submissions?instance=<id>
  // opens that submission straight away. Read from the URL on mount (client
  // only) to avoid the useSearchParams Suspense requirement.
  const deepLinkedRef = useRef(false)
  useEffect(() => {
    if (deepLinkedRef.current) return
    const target = new URLSearchParams(window.location.search).get('instance')
    if (!target) return
    deepLinkedRef.current = true
    const found = instances.find((i) => i.id === target)
    if (found) {
      openReview(found)
      return
    }
    // Not in the current list (e.g. filtered out) — fetch it directly.
    startLoad(async () => {
      const res = await getAllSubmissions({ status: 'all' })
      if (res.ok) {
        const match = (res.instances ?? []).find((i) => i.id === target)
        if (match) openReview(match)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refreshReport(m: string, tid: string = reportTemplateId) {
    setMonth(m)
    setReportTemplateId(tid)
    setSentMsg(null)
    startReport(async () => {
      const res = await getMonthlyCompletionReport(m, tid === ALL ? undefined : tid)
      if (res.ok) setReport(res.report ?? null)
    })
  }

  function emailReport() {
    setSentMsg(null)
    startSend(async () => {
      const res = await sendCompletionReport({
        month,
        templateId: reportTemplateId === ALL ? undefined : reportTemplateId,
      })
      setSentMsg(res.ok ? `Report emailed (${res.sent ?? 0} recipient(s)).` : res.error ?? 'Failed.')
    })
  }

  return (
    <>
      <Tabs defaultValue="submissions">
        <TabsList>
          <TabsTrigger value="submissions" className="gap-1.5">
            <ClipboardList className="size-4" />
            Submissions
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <Mail className="size-4" />
            Completion report
          </TabsTrigger>
        </TabsList>

        {/* Submissions ------------------------------------------------------ */}
        <TabsContent value="submissions" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <Label className="text-xs">Task / form</Label>
              <Select
                value={filters.templateId ?? ALL}
                onValueChange={(v) => updateFilter({ templateId: v === ALL ? undefined : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tasks &amp; forms</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Person</Label>
              <Select
                value={filters.userId ?? ALL}
                onValueChange={(v) => updateFilter({ userId: v === ALL ? undefined : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={filters.status ?? 'all'}
                onValueChange={(v) => updateFilter({ status: v as SubmissionFilters['status'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Outstanding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="from">
                Completed from
              </Label>
              <Input
                id="from"
                type="date"
                value={filters.from ?? ''}
                onChange={(e) => updateFilter({ from: e.target.value || undefined })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="to">
                Completed to
              </Label>
              <Input
                id="to"
                type="date"
                value={filters.to ?? ''}
                onChange={(e) => updateFilter({ to: e.target.value || undefined })}
              />
            </div>
          </div>

          {/* Bulk revoke: only when narrowed to one task/form's outstanding rows. */}
          {filters.status === 'pending' && filters.templateId && instances.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5">
              <p className="text-sm text-muted-foreground text-pretty">
                Remove every outstanding assignment for this task/form (e.g. it was sent to the
                wrong people).
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={revoking}>
                    {revoking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Remove all outstanding
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove all outstanding assignments?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes every outstanding (not yet completed) copy of this task/form
                      from all users. Completed submissions are not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revokeAllForTemplate(filters.templateId!)}>
                      Remove all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : instances.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No submissions match these filters.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {instances.map((inst) => (
                <div
                  key={inst.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => openReview(inst)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {inst.template?.name ?? 'Task'}
                      </p>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {inst.template?.task_kind === 'on_demand' ? 'Form' : 'Task'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inst.user?.full_name ?? 'Unknown'}
                      {' · '}
                      {inst.status === 'completed'
                        ? `Completed ${
                            inst.completed_at
                              ? new Date(inst.completed_at).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : ''
                          }`
                        : 'Outstanding'}
                      {inst.reference_number ? ` · Ref ${inst.reference_number}` : ''}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {inst.status !== 'completed' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={revoking}
                            title="Remove this assignment"
                          >
                            <Trash2 className="size-4 text-destructive" />
                            <span className="sr-only">Remove assignment</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this assignment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the outstanding &ldquo;{inst.template?.name ?? 'task'}
                              &rdquo; from {inst.user?.full_name ?? 'this user'}. They will no
                              longer need to complete it. Completed submissions are not affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revokeOne(inst.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completion report ----------------------------------------------- */}
        <TabsContent value="report" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs" htmlFor="report-month">
                Month
              </Label>
              <Input
                id="report-month"
                type="month"
                value={month}
                onChange={(e) => refreshReport(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={reportTemplateId}
                onValueChange={(v) => refreshReport(month, v)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tasks &amp; forms</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => refreshReport(month)}
              disabled={reportLoading}
            >
              {reportLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
            <Button onClick={emailReport} disabled={sending || !report}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Email this report to me
            </Button>
            {sentMsg ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4 text-primary" />
                {sentMsg}
              </span>
            ) : null}
          </div>

          {report ? <ReportView report={report} /> : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No report data for this month.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {active ? (
        <InternalTaskSheet
          instance={active}
          open={sheetOpen}
          reviewMode
          submitterName={active.user?.full_name ?? null}
          onOpenChange={(v) => {
            setSheetOpen(v)
            if (!v) setActive(null)
          }}
        />
      ) : null}
    </>
  )
}

function ReportView({ report }: { report: CompletionReport }) {
  const pct =
    report.totalAllocated > 0
      ? Math.round((report.totalCompleted / report.totalAllocated) * 100)
      : 100
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Completed" value={`${report.totalCompleted}/${report.totalAllocated}`} sub={`${pct}%`} />
        <StatCard label="People with outstanding tasks" value={String(report.nonCompleters.length)} />
        <StatCard label="Flagged items" value={String(report.flags.length)} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-medium">Outstanding by person</h3>
        {report.nonCompleters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone is up to date.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {report.nonCompleters.map((u) => (
              <div key={u.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-medium">{u.name}</span>
                <span className="text-right text-xs text-muted-foreground">
                  {u.missing.join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">By task</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 text-center font-medium">Completed</th>
                <th className="px-4 py-2 font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {report.templates.map((t) => (
                <tr key={t.templateId} className="border-b last:border-0">
                  <td className="px-4 py-2">{t.templateName}</td>
                  <td className="px-4 py-2 text-center tabular-nums">
                    {t.completed}/{t.allocated}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {t.missing.length ? t.missing.map((u) => u.name).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Flagged items ({report.flags.length})</h3>
        {report.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items were flagged this month.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {report.flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                <AlertCircle
                  className={
                    f.state === 'Fail'
                      ? 'mt-0.5 size-4 shrink-0 text-destructive'
                      : 'mt-0.5 size-4 shrink-0 text-amber-600'
                  }
                />
                <div>
                  <p>
                    <span className="font-medium">{f.templateName}</span>: {f.label}
                    {f.answer ? ` [${f.answer}]` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.state} · {f.userName}
                  </p>
                  {f.note ? (
                    <p className="mt-1 text-xs italic text-muted-foreground text-pretty">
                      &ldquo;{f.note}&rdquo;
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground text-pretty">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value}
          {sub ? <span className="ml-2 text-sm font-normal text-muted-foreground">{sub}</span> : null}
        </p>
      </CardContent>
    </Card>
  )
}

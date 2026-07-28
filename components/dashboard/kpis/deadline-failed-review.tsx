'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { classifyKpiTask, type ComplianceTier, type KpiTask, type ToleranceLookup } from '@/lib/kpi'
import { setDeadlineFailedReason } from '@/lib/actions/deadline'

interface DeadlineFailedReviewProps {
  tasks: KpiTask[]
  tolerances: ToleranceLookup
  tier: ComplianceTier
  reasons: string[]
  excludedReasons: string[]
  canEdit: boolean
}

const NO_REASON = '__none__'

// Lists every KPI miss (late/overdue, including excused) for the current tier
// so office/admin can assign or change each call's deadline-failed reason.
// Assigning an excludable reason excuses the miss from the compliance rate.
export function DeadlineFailedReview({
  tasks,
  tolerances,
  tier,
  reasons,
  excludedReasons,
  canEdit,
}: DeadlineFailedReviewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)
  const excludedSet = useMemo(() => new Set(excludedReasons), [excludedReasons])

  // Misses = late, overdue, or already-excused calls for the active tier.
  const misses = useMemo(() => {
    return tasks
      .map((t) => ({ task: t, status: classifyKpiTask(t, tolerances, tier) }))
      .filter(
        (r) => r.status === 'late' || r.status === 'overdue' || r.status === 'excluded',
      )
      .sort((a, b) => {
        // Most recent due date first.
        const da = a.task.dueDate ? new Date(a.task.dueDate).getTime() : 0
        const db = b.task.dueDate ? new Date(b.task.dueDate).getTime() : 0
        return db - da
      })
  }, [tasks, tolerances, tier])

  const handleChange = (taskId: string, reason: string) => {
    const value = reason === NO_REASON ? '' : reason
    if (!value) return // clearing is not supported by the action (reason required)
    setSavingId(taskId)
    startTransition(async () => {
      const { error } = await setDeadlineFailedReason(taskId, value, null)
      setSavingId(null)
      if (error) {
        toast.error(error)
      } else {
        toast.success(
          excludedSet.has(value)
            ? 'Reason saved — this miss is now excused from KPI'
            : 'Reason saved',
        )
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Deadline failed calls
        </CardTitle>
        <CardDescription>
          Every {tier === 'regulatory' ? 'regulatory' : 'client'} KPI miss (late or overdue) for
          the current filters. Assign a reason to explain the miss; reasons flagged as excluded
          from KPI excuse the call from the compliance rate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[16rem]">Reason</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {misses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No deadline failures for the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                misses.map(({ task, status }) => {
                  const currentReason = task.deadlineFailedReason ?? ''
                  // A saved reason no longer in the configured list still shows.
                  const options = currentReason && !reasons.includes(currentReason)
                    ? [...reasons, currentReason]
                    : reasons
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">
                        {task.referenceNumber ?? '—'}
                      </TableCell>
                      <TableCell>{task.siteName}</TableCell>
                      <TableCell>{task.serviceTypeName}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {status === 'excluded' ? (
                          <Badge variant="secondary">Excused</Badge>
                        ) : status === 'overdue' ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : (
                          <Badge variant="outline">Late</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Select
                            value={currentReason || NO_REASON}
                            onValueChange={(v) => handleChange(task.id, v)}
                            disabled={isPending && savingId === task.id}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Set a reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_REASON} disabled>
                                Set a reason…
                              </SelectItem>
                              {options.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                  {excludedSet.has(r) ? ' (excused)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {currentReason || '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {savingId === task.id && isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <Link
                            href={`/dashboard/tasks/${task.id}`}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Open call"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

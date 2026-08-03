import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ClipboardCheck,
  CheckCircle2,
  ChevronRight,
  CalendarDays,
  FileCheck,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { formatLeaveLength } from '@/lib/leave-utils'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { getPendingApprovals } from '@/lib/actions/internal-tasks'

// Dashboard card summarising everything awaiting the current user's approval:
// annual leave requests plus form & task submissions. Renders nothing when
// there is no pending work, so it only appears for managers/approvers who
// actually have decisions to make.
export async function ApprovalsWidget() {
  const [{ pending }, formResult] = await Promise.all([
    getVisibleLeaveRequests(),
    getPendingApprovals(),
  ])
  const forms = formResult.ok ? formResult.instances ?? [] : []
  const totalPending = pending.length + forms.length
  if (totalPending === 0) return null

  // Show up to 4 items total, leave first then forms/tasks.
  const topLeave = pending.slice(0, 4)
  const topForms = forms.slice(0, Math.max(0, 4 - topLeave.length))
  const shown = topLeave.length + topForms.length

  return (
    <Card className="w-full border-amber-300/60 dark:border-amber-900/60 lg:flex-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Approvals
            <Badge variant="secondary">{totalPending}</Badge>
          </CardTitle>
          <CardDescription>
            Leave, forms &amp; tasks waiting for your decision
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/approvals">
            Review all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topLeave.map((r) => (
            <Link
              key={r.id}
              href="/dashboard/approvals"
              className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">{r.userName}</p>
                <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {formatDateUK(r.startAt)}
                  {r.startAt.slice(0, 10) !== r.endAt.slice(0, 10) &&
                    ` – ${formatDateUK(r.endAt)}`}
                </p>
              </div>
                <Badge variant="outline" className="shrink-0">
                  {formatLeaveLength(r.workingDays, r.workingHours, {
                    hourly: r.startPortion === 'hours' || r.endPortion === 'hours',
                  })}
                </Badge>
            </Link>
          ))}
          {topForms.map((f) => (
            <Link
              key={f.id}
              href="/dashboard/approvals"
              className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">
                  {f.user?.full_name ?? 'A team member'}
                </p>
                <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  {f.template?.name ?? 'Form submission'}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                Form
              </Badge>
            </Link>
          ))}
        </div>
        {totalPending > shown && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            {totalPending - shown} more awaiting approval
          </p>
        )}
      </CardContent>
    </Card>
  )
}

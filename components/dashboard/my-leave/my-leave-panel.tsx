import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CalendarDays, Clock, CheckCircle2, Hourglass } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { formatLeaveLength, formatPortionNote } from '@/lib/leave'
import type { MyLeaveData } from '@/lib/my-leave'

// Formats an inclusive leave span for display.
function formatSpan(startAt: string, endAt: string): string {
  const start = formatDateUK(startAt)
  const end = formatDateUK(endAt)
  return start === end ? start : `${start} – ${end}`
}

// Rounds hours to at most 1 decimal place for display.
function fmtHours(h: number): string {
  return (Math.round(h * 10) / 10).toString()
}

export function MyLeavePanel({ data }: { data: MyLeaveData }) {
  const { balance, requests } = data

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          label="Days Remaining"
          value={balance?.remainingDays ?? null}
          hint={
            balance?.entitlementDays != null
              ? `of ${balance.entitlementDays} days`
              : 'No day entitlement set'
          }
          icon={CalendarDays}
          progress={
            balance?.entitlementDays
              ? ((balance.remainingDays ?? 0) / balance.entitlementDays) * 100
              : null
          }
        />
        <BalanceCard
          label="Hours Remaining"
          value={balance?.remainingHours != null ? Number(fmtHours(balance.remainingHours)) : null}
          hint={
            balance?.entitlementHours != null
              ? `of ${fmtHours(balance.entitlementHours)} hours`
              : 'No hour entitlement set'
          }
          icon={Clock}
          progress={
            balance?.entitlementHours
              ? ((balance.remainingHours ?? 0) / balance.entitlementHours) * 100
              : null
          }
        />
        <StatCard
          label="Days Taken"
          value={balance?.takenDays ?? 0}
          hint="Approved this year"
          icon={CheckCircle2}
        />
        <StatCard
          label="Hours Taken"
          value={balance ? Number(fmtHours(balance.takenHours)) : 0}
          hint="Approved this year"
          icon={Hourglass}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>Your annual leave requests and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No leave requests yet. Add annual leave from the calendar to request time off.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {formatSpan(r.startAt, r.endAt)}
                      <span className="text-sm font-normal text-muted-foreground">
                        ·{' '}
                        {formatLeaveLength(r.workingDays, r.workingHours, {
                          hourly: r.startPortion === 'hours' || r.endPortion === 'hours',
                        })}
                      </span>
                      {(() => {
                        const note = formatPortionNote(
                          r.startPortion,
                          r.endPortion,
                          r.startHours,
                          r.endHours,
                          r.startAt.slice(0, 10) === r.endAt.slice(0, 10),
                        )
                        return note ? (
                          <Badge variant="outline" className="font-normal">
                            {note}
                          </Badge>
                        ) : null
                      })()}
                    </p>
                    {r.status === 'rejected' && r.rejectionReason && (
                      <p className="text-sm text-destructive">Reason: {r.rejectionReason}</p>
                    )}
                    {r.status === 'approved' && r.approverName && (
                      <p className="text-xs text-muted-foreground">
                        Approved by {r.approverName}
                        {r.approvedAt ? ` · ${formatDateUK(r.approvedAt)}` : ''}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceCard({
  label,
  value,
  hint,
  icon: Icon,
  progress,
}: {
  label: string
  value: number | null
  hint: string
  icon: React.ComponentType<{ className?: string }>
  progress: number | null
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold">{value ?? '—'}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {progress != null && (
          <Progress value={Math.max(0, Math.min(100, progress))} className="mt-1" />
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: MyLeaveData['requests'][number]['status'] }) {
  if (status === 'approved')
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">Approved</Badge>
  if (status === 'requested') return <Badge variant="secondary">Pending</Badge>
  return <Badge variant="destructive">Declined</Badge>
}

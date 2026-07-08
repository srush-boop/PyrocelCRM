import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  ClipboardCheck,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  ShieldCheck,
  FileText,
  ChevronRight,
  Activity,
  Siren,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatDateUK } from '@/lib/utils'
import { ScanQrButton } from '@/components/dashboard/dampers/scan-qr-button'
import {
  CompletionsChart,
  type CompletionsPoint,
} from '@/components/dashboard/overview/completions-chart'
import { fetchKpiData } from '@/lib/kpi-data'
import { buildKpiReport } from '@/lib/kpi'
import {
  startOfMonth,
  startOfWeek,
  subWeeks,
  addWeeks,
  isWithinInterval,
  format,
} from 'date-fns'

export default async function ServiceDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // The service dashboard is a management view — engineers work from the Schedule.
  if ((profile as Profile).role === 'engineer') redirect('/dashboard/schedule')

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const monthStart = startOfMonth(today)
  // 8-week window, aligned to Monday, for the completions trend chart.
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const trendStart = subWeeks(weekStart, 7)

  const [
    sitesCount,
    engineersCount,
    pendingCount,
    inProgressCount,
    completedMonthCount,
    overdueCount,
    openDefectsCount,
    emergencyCount,
  ] = await Promise.all([
    supabase.from('sites').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'engineer'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', monthStart.toISOString()),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress'])
      .lt('scheduled_date', todayStr),
    supabase
      .from('defects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    // Open emergency calls (reactive, high priority) still needing attendance.
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_emergency', true)
      .in('status', ['pending', 'in_progress']),
  ])

  const taskSelect = `
    *,
    site_service:site_services(
      *,
      site:sites(*),
      service_type:service_types(*)
    ),
    direct_site:sites!tasks_site_id_fkey(*),
    assigned_engineer:profiles(*)
  `

  const [
    { data: upcomingTasks },
    { data: overdueTasks },
    { data: emergencyTasks },
    { data: recentReports },
    { data: trendRows },
    kpi,
  ] = await Promise.all([
    // Upcoming = due today or later, soonest first.
    supabase
      .from('tasks')
      .select(taskSelect)
      .in('status', ['pending', 'in_progress'])
      .gte('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .limit(6),
    // Needs attention = overdue, most overdue first.
    supabase
      .from('tasks')
      .select(taskSelect)
      .in('status', ['pending', 'in_progress'])
      .lt('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .limit(5),
    // Open emergency calls, soonest first.
    supabase
      .from('tasks')
      .select(taskSelect)
      .eq('is_emergency', true)
      .in('status', ['pending', 'in_progress'])
      .order('scheduled_date', { ascending: true })
      .limit(6),
    // Recent completed reports.
    supabase
      .from('task_results')
      .select(
        `
        id,
        overall_status,
        created_at,
        reference_number,
        task:tasks(
          id,
          site_service:site_services(
            site:sites(name),
            service_type:service_types(name)
          )
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(6),
    // Completions for the trend chart.
    supabase
      .from('tasks')
      .select('completed_at')
      .eq('status', 'completed')
      .gte('completed_at', trendStart.toISOString())
      .limit(5000),
    fetchKpiData(supabase).then((d) => buildKpiReport(d.tasks, d.tolerances)),
  ])

  // Bucket completions into the last 8 weeks.
  const trendData: CompletionsPoint[] = Array.from({ length: 8 }, (_, i) => {
    const start = addWeeks(trendStart, i)
    const end = addWeeks(start, 1)
    const count = ((trendRows as { completed_at: string | null }[]) ?? []).filter((r) => {
      if (!r.completed_at) return false
      const d = new Date(r.completed_at)
      return isWithinInterval(d, { start, end }) && d < end
    }).length
    return { week: format(start, 'd MMM'), completed: count }
  })

  const reg = kpi.overall.regulatory
  const totalOpen = (pendingCount.count || 0) + (inProgressCount.count || 0)

  const stats = [
    {
      label: 'Total Sites',
      value: sitesCount.count || 0,
      hint: 'Active client sites',
      icon: Building2,
      href: '/dashboard/sites',
    },
    {
      label: 'Engineers',
      value: engineersCount.count || 0,
      hint: 'On the team',
      icon: Users,
      href: '/dashboard/engineers',
    },
    {
      label: 'Open Calls',
      value: totalOpen,
      hint: `${inProgressCount.count || 0} in progress`,
      icon: Clock,
      href: '/dashboard/schedule',
    },
    {
      label: 'Emergency Calls',
      value: emergencyCount.count || 0,
      hint: 'Open, high priority',
      icon: Siren,
      href: '/dashboard/schedule',
      alert: (emergencyCount.count || 0) > 0,
    },
    {
      label: 'Overdue',
      value: overdueCount.count || 0,
      hint: 'Past due date',
      icon: AlertTriangle,
      href: '/dashboard/schedule',
      alert: (overdueCount.count || 0) > 0,
    },
    {
      label: 'Open Defects',
      value: openDefectsCount.count || 0,
      hint: 'Failed reports to action',
      icon: AlertTriangle,
      href: '/dashboard/defects',
      alert: (openDefectsCount.count || 0) > 0,
    },
    {
      label: 'Done This Month',
      value: completedMonthCount.count || 0,
      hint: format(today, 'MMMM yyyy'),
      icon: CheckCircle2,
      href: '/dashboard/reports',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Dashboard</h1>
          <p className="text-muted-foreground">
            Service performance and call activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScanQrButton />
          <Button asChild>
            <Link href="/dashboard/schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Calls
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card
              className={`h-full transition-colors hover:border-primary/50 hover:bg-accent/40 ${
                s.alert ? 'border-destructive/40' : ''
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
                <s.icon
                  className={`h-4 w-4 ${s.alert ? 'text-destructive' : 'text-muted-foreground'}`}
                />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${s.alert ? 'text-destructive' : ''}`}
                >
                  {s.value}
                </div>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Emergency calls */}
      {emergencyTasks && emergencyTasks.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Siren className="h-5 w-5 text-destructive" />
              Emergency Calls
            </CardTitle>
            <CardDescription>Open high-priority reactive calls</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {emergencyTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/dashboard/tasks/${task.id}?from=/dashboard/service`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 transition-colors hover:border-destructive/60 hover:bg-destructive/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium">
                      {task.site_service?.site?.name || task.direct_site?.name || 'Unknown Site'}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {task.site_service?.service_type?.name || 'Reactive call'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="destructive">Emergency</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateUK(task.scheduled_date)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart + compliance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Completions
            </CardTitle>
            <CardDescription>Tasks completed over the last 8 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <CompletionsChart data={trendData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Regulatory Compliance
            </CardTitle>
            <CardDescription>Across all assessed tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">
                  {reg.rate === null ? '—' : `${reg.rate}%`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {reg.assessed} assessed
                </span>
              </div>
              <Progress value={reg.rate ?? 0} className="mt-2" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <ComplianceStat label="On time" value={reg.compliant} tone="good" />
              <ComplianceStat label="Late" value={reg.late} tone="warn" />
              <ComplianceStat label="Overdue" value={reg.overdue} tone="bad" />
              <ComplianceStat label="Pending" value={reg.pending} tone="muted" />
            </div>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/dashboard/kpis">
                View full performance
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Attention + upcoming */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={(overdueTasks?.length ?? 0) > 0 ? 'border-destructive/30' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Needs Attention
            </CardTitle>
            <CardDescription>Overdue tasks, oldest first</CardDescription>
          </CardHeader>
          <CardContent>
            {overdueTasks && overdueTasks.length > 0 ? (
              <div className="space-y-3">
                {overdueTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}?from=/dashboard/service`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium">
                        {task.site_service?.site?.name || task.direct_site?.name || 'Unknown Site'}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {task.site_service?.service_type?.name || 'Unknown Service'}
                      </p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {formatDateUK(task.scheduled_date)}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nothing overdue. Great work.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Calls
            </CardTitle>
            <CardDescription>Booked for the coming days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingTasks && upcomingTasks.length > 0 ? (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}?from=/dashboard/service`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium">
                        {task.site_service?.site?.name || task.direct_site?.name || 'Unknown Site'}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {task.site_service?.service_type?.name || 'Unknown Service'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={task.status === 'pending' ? 'secondary' : 'default'}>
                        {task.status === 'in_progress' ? 'in progress' : task.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateUK(task.scheduled_date)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardCheck className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No upcoming calls</p>
                <Button asChild className="mt-4">
                  <Link href="/dashboard/schedule">View Calls</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent reports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Reports
            </CardTitle>
            <CardDescription>Latest completed service reports</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/reports">
              View all
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentReports && recentReports.length > 0 ? (
            <div className="divide-y">
              {recentReports.map((r) => {
                const task = Array.isArray(r.task) ? r.task[0] : r.task
                const ss = Array.isArray(task?.site_service)
                  ? task?.site_service[0]
                  : task?.site_service
                const site = Array.isArray(ss?.site) ? ss?.site[0] : ss?.site
                const service = Array.isArray(ss?.service_type)
                  ? ss?.service_type[0]
                  : ss?.service_type
                return (
                  <Link
                    key={r.id}
                    href={task?.id ? `/dashboard/tasks/${task.id}` : '/dashboard/reports'}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium">{site?.name || 'Unknown Site'}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {service?.name || 'Service'}
                        {r.reference_number ? ` · ${r.reference_number}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ReportStatusBadge status={r.overall_status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateUK(r.created_at)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No reports yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ComplianceStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad' | 'muted'
}) {
  const dot =
    tone === 'good'
      ? 'bg-[var(--chart-4)]'
      : tone === 'warn'
      ? 'bg-[var(--chart-5)]'
      : tone === 'bad'
      ? 'bg-destructive'
      : 'bg-muted-foreground/40'
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: string }) {
  if (status === 'pass') {
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
    )
  }
  if (status === 'fail') {
    return <Badge variant="destructive">Fail</Badge>
  }
  if (status === 'no_access') {
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">No Access</Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
    )
  }
  return <Badge variant="secondary">{status}</Badge>
}

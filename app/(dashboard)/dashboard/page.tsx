import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Building2,
  Building,
  AlertTriangle,
  CalendarDays,
  Users,
  ReceiptText,
  Hammer,
  ChevronRight,
  Wrench,
  Siren,
  ClipboardCheck,
  Inbox,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { ScanQrButton } from '@/components/dashboard/dampers/scan-qr-button'
import { AddRequestDialog } from '@/components/dashboard/requests/add-request-dialog'
import { ApprovalsWidget } from '@/components/dashboard/approvals/approvals-widget'
import { LoneWorkerDashboardTiles } from '@/components/dashboard/lone-worker/lone-worker-dashboard-tiles'
import { TileColorPicker } from '@/components/dashboard/home/tile-color-picker'
import { tileIconStyle, tileAccentStyle } from '@/lib/dashboard-tile-colors'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { EngineerHome } from '@/components/dashboard/home/engineer-home'
import { YourTasksTile } from '@/components/dashboard/internal-tasks/your-tasks-tile'
import { DashboardDateFilter } from '@/components/dashboard/home/dashboard-date-filter'
import { Suspense } from 'react'
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay } from 'date-fns'
import { fetchKpiData } from '@/lib/kpi-data'
import { buildKpiReport, type KpiTask } from '@/lib/kpi'
import { formatGBP } from '@/lib/utils'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
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

  const role = (profile as Profile).role

  // Engineers get a tailored home (welcome, daily fact, their day ahead).
  // Sub-contractors reuse the same field home but with internal-only cards
  // (lone-worker, standings, location sharing) hidden.
  if (role === 'engineer' || role === 'subcontractor') {
    return <EngineerHome profile={profile as Profile} isSubcontractor={role === 'subcontractor'} />
  }

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  const [
    sitesCount,
    clientsCount,
    engineersCount,
    openCallsCount,
    emergencyCount,
    overdueCount,
    openDefectsCount,
    openJobsCount,
    openQuotesCount,
    pendingRequestsCount,
  ] = await Promise.all([
    supabase.from('sites').select('id', { count: 'exact', head: true }),
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'engineer'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress']),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_emergency', true)
      .in('status', ['pending', 'in_progress']),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress'])
      .lt('scheduled_date', todayStr),
    supabase.from('defects').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'sent']),
    // Requests visible only to admin/office (RLS enforced). Engineers are
    // already redirected above so this always runs for admin/office.
    supabase
      .from('inbound_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'triaged']),
  ])

  // ---------------------------------------------------------------------------
  // Value + compliance metrics with an optional global date-range filter.
  // When both `from` and `to` are supplied they override every card; otherwise
  // PPM defaults to the current calendar month and values to the last 60 days.
  // ---------------------------------------------------------------------------
  const sp = await searchParams
  const filterFrom = sp.from ? startOfDay(new Date(sp.from)) : null
  const filterTo = sp.to ? endOfDay(new Date(sp.to)) : null
  const hasFilter =
    !!filterFrom &&
    !!filterTo &&
    !Number.isNaN(filterFrom.getTime()) &&
    !Number.isNaN(filterTo.getTime())

  // PPM regulatory KPI range (defaults to the current month).
  const ppmFrom = hasFilter ? filterFrom! : startOfMonth(today)
  const ppmTo = hasFilter ? filterTo! : endOfMonth(today)
  // Sales/Defects value range (defaults to the last 60 days).
  const valueFrom = hasFilter ? filterFrom! : startOfDay(subDays(today, 60))
  const valueTo = hasFilter ? filterTo! : endOfDay(today)

  const rangeLabel = (from: Date, to: Date) =>
    `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`

  // Regulatory PPM compliance rate for calls due within the PPM range.
  let ppmRate: number | null = null
  try {
    const { tasks, tolerances } = await fetchKpiData(supabase)
    const inRange = tasks.filter((t: KpiTask) => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate as string)
      return d >= ppmFrom && d <= ppmTo
    })
    ppmRate = buildKpiReport(inRange, tolerances, today).overall.regulatory.rate
  } catch {
    ppmRate = null
  }

  // Quoted value = every master quote created in range.
  // Won value = master quotes accepted (by decision date) in range.
  // Split by quote_type: 'remedial' → Defects card, everything else → Sales.
  const [quotedRes, wonRes] = await Promise.all([
    supabase
      .from('quotes')
      .select('total_pence, quote_type')
      .eq('is_master', true)
      .gte('created_at', valueFrom.toISOString())
      .lte('created_at', valueTo.toISOString()),
    supabase
      .from('quotes')
      .select('total_pence, quote_type')
      .eq('is_master', true)
      .eq('status', 'accepted')
      .gte('decided_at', valueFrom.toISOString())
      .lte('decided_at', valueTo.toISOString()),
  ])

  const sumValues = (rows: { total_pence: number | null; quote_type: string | null }[] | null) => {
    let remedial = 0
    let other = 0
    for (const r of rows ?? []) {
      const pence = r.total_pence || 0
      if (r.quote_type === 'remedial') remedial += pence
      else other += pence
    }
    return { remedial, other }
  }

  const quoted = sumValues(quotedRes.data as any)
  const won = sumValues(wonRes.data as any)
  const valueRangeLabel = hasFilter ? rangeLabel(valueFrom, valueTo) : 'Last 60 days'
  const ppmRangeLabel = hasFilter ? rangeLabel(ppmFrom, ppmTo) : format(today, 'MMMM yyyy')

  // Leave requests awaiting this user's decision (RLS-scoped: managers see their
  // reports, accounts/admins see all). Surfaced as an always-visible card so the
  // count is discoverable even when the detailed widget above is hidden.
  const { pending: pendingApprovals } = await getVisibleLeaveRequests()
  const pendingApprovalsCount = pendingApprovals.length

  // Per-user tile colour overrides (keyed by tile title). Empty = theme default.
  const tileColors = (profile as Profile).dashboard_tile_colors ?? {}

  const modules: ModuleCard[] = [
    {
      title: 'Approvals',
      description: 'Leave requests to action',
      icon: ClipboardCheck,
      href: '/dashboard/approvals',
      metrics: [
        {
          label: 'Awaiting approval',
          value: pendingApprovalsCount,
          alert: pendingApprovalsCount > 0,
        },
      ],
    },
    {
      title: 'Service',
      description: 'Calls, reports & defects',
      icon: Wrench,
      href: '/dashboard/service',
      metrics: [
        {
          label: 'PPM regulatory',
          value: ppmRate ?? 0,
          display: ppmRate == null ? '—' : `${ppmRate}%`,
          caption: ppmRangeLabel,
        },
        { label: 'Open calls', value: openCallsCount.count || 0 },
        {
          label: 'Emergencies',
          value: emergencyCount.count || 0,
          alert: (emergencyCount.count || 0) > 0,
          icon: Siren,
        },
        {
          label: 'Overdue',
          value: overdueCount.count || 0,
          alert: (overdueCount.count || 0) > 0,
        },
      ],
    },
    {
      title: 'Jobs',
      description: 'Delivery of won work',
      icon: Hammer,
      href: '/dashboard/jobs',
      metrics: [{ label: 'Open jobs', value: openJobsCount.count || 0 }],
    },
    {
      title: 'Sales',
      description: 'Quotes in progress',
      icon: ReceiptText,
      href: '/dashboard/sales',
      metrics: [
        { label: 'Open quotes', value: openQuotesCount.count || 0 },
        {
          label: 'Quoted',
          value: quoted.other,
          display: formatGBP(quoted.other / 100),
          caption: valueRangeLabel,
        },
        {
          label: 'Won',
          value: won.other,
          display: formatGBP(won.other / 100),
          caption: valueRangeLabel,
        },
      ],
    },
    {
      title: 'Defects',
      description: 'Failed reports to action',
      icon: AlertTriangle,
      href: '/dashboard/defects',
      metrics: [
        {
          label: 'Open defects',
          value: openDefectsCount.count || 0,
          alert: (openDefectsCount.count || 0) > 0,
        },
        {
          label: 'Quoted',
          value: quoted.remedial,
          display: formatGBP(quoted.remedial / 100),
          caption: valueRangeLabel,
        },
        {
          label: 'Won',
          value: won.remedial,
          display: formatGBP(won.remedial / 100),
          caption: valueRangeLabel,
        },
      ],
    },
    {
      title: 'Sites',
      description: 'Client sites we service',
      icon: Building2,
      href: '/dashboard/sites',
      metrics: [{ label: 'Total sites', value: sitesCount.count || 0 }],
    },
    {
      title: 'Clients',
      description: 'Accounts we work with',
      icon: Building,
      href: '/dashboard/clients',
      metrics: [{ label: 'Total clients', value: clientsCount.count || 0 }],
    },
    {
      title: 'People',
      description: 'Team & engineers',
      icon: Users,
      href: '/dashboard/engineers',
      metrics: [{ label: 'Engineers', value: engineersCount.count || 0 }],
    },
    {
      title: 'Requests',
      description: 'Client requests to action',
      icon: Inbox,
      href: '/dashboard/requests',
      metrics: [
        {
          label: 'To review',
          value: pendingRequestsCount?.count ?? 0,
          alert: (pendingRequestsCount?.count ?? 0) > 0,
        },
      ],
    },
    {
      title: 'Calendar',
      description: 'Company-wide schedule',
      icon: CalendarDays,
      href: '/dashboard/calendar',
      metrics: [],
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {(profile as Profile).full_name || 'User'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddRequestDialog triggerVariant="outline" />
          <ScanQrButton />
        </div>
      </div>

      {/* Global date-range filter — overrides every card's default period. */}
      <Suspense fallback={null}>
        <DashboardDateFilter
          initialFrom={hasFilter ? format(ppmFrom, 'yyyy-MM-dd') : ''}
          initialTo={hasFilter ? format(ppmTo, 'yyyy-MM-dd') : ''}
        />
      </Suspense>

      {/* Leave approvals waiting on this user (managers/accounts/admins only) */}
      <Suspense fallback={null}>
        <ApprovalsWidget />
      </Suspense>

      {/* Outstanding internal quality/management tasks for this manager. */}
      <Suspense fallback={null}>
        <YourTasksTile />
      </Suspense>

      {/* Live lone-worker safety status (0 when healthy; pulses on emergency) */}
      <LoneWorkerDashboardTiles />

      {/* Company overview — one hub per module */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {modules.map((m) => {
          const color = tileColors[m.title] ?? null
          const iconStyle = tileIconStyle(color)
          return (
            <Card
              key={m.title}
              className="group relative h-full overflow-hidden transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              {/* Colour accent bar for personalised tiles. */}
              {iconStyle && (
                <span
                  className="absolute inset-x-0 top-0 h-1"
                  style={tileAccentStyle(color)}
                  aria-hidden="true"
                />
              )}
              {/* Full-card navigation overlay. Sits behind the (pointer-events-none)
                  content so clicks anywhere navigate, except the colour picker. */}
              <Link
                href={m.href}
                aria-label={`Open ${m.title}`}
                className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className="pointer-events-none relative z-[1]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          iconStyle ? '' : 'bg-primary/10 text-primary'
                        }`}
                        style={iconStyle}
                      >
                        <m.icon className="h-5 w-5" />
                      </span>
                      <CardTitle className="text-base">{m.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <TileColorPicker tileKey={m.title} currentColor={color} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                  <CardDescription className="pt-1">{m.description}</CardDescription>
                </CardHeader>
                {m.metrics.length > 0 && (
                  <CardContent>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {m.metrics.map((metric) => (
                        <div key={metric.label} className="space-y-0.5">
                          <div
                            className={`flex items-center gap-1 text-2xl font-bold ${
                              metric.alert ? 'text-destructive' : ''
                            }`}
                          >
                            {metric.icon && <metric.icon className="h-5 w-5" />}
                            {metric.display ?? metric.value}
                          </div>
                          <p className="text-xs text-muted-foreground">{metric.label}</p>
                          {metric.caption && (
                            <p className="text-[0.7rem] leading-tight text-muted-foreground/70">
                              {metric.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

type ModuleMetric = {
  label: string
  value: number
  // Optional string to render instead of the raw number (e.g. "£12,500.00", "92%").
  display?: string
  // Optional small caption under the metric, e.g. the active period.
  caption?: string
  alert?: boolean
  icon?: typeof Siren
}

type ModuleCard = {
  title: string
  description: string
  icon: typeof Wrench
  href: string
  metrics: ModuleMetric[]
}

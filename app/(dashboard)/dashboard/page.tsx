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
  Sun,
  Lightbulb,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { AddRequestDialog } from '@/components/dashboard/requests/add-request-dialog'
import { ApprovalsWidget } from '@/components/dashboard/approvals/approvals-widget'
import { LoneWorkerDashboardTiles } from '@/components/dashboard/lone-worker/lone-worker-dashboard-tiles'
import { TileColorPicker } from '@/components/dashboard/home/tile-color-picker'
import { DashboardTileGrid, type DashboardTile } from '@/components/dashboard/home/dashboard-tile-grid'
import { DashboardShortcuts } from '@/components/dashboard/home/dashboard-shortcuts'
import { DashboardBackgroundPicker } from '@/components/dashboard/home/dashboard-background-picker'
import { resolveDashboardBackground } from '@/lib/dashboard/backgrounds'
import { tileIconStyle, tileAccentStyle, tileCardStyle } from '@/lib/dashboard-tile-colors'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { getPendingApprovals } from '@/lib/actions/internal-tasks'
import { EngineerHome } from '@/components/dashboard/home/engineer-home'
import { getDailyFact } from '@/lib/system-facts'
import { YourTasksTile } from '@/components/dashboard/internal-tasks/your-tasks-tile'
import { Suspense, type ReactNode } from 'react'
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay } from 'date-fns'
import { fetchKpiData } from '@/lib/kpi-data'
import { buildKpiReport, type KpiTask } from '@/lib/kpi'
import { formatGBP } from '@/lib/utils'

export default async function DashboardPage() {
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
    todaysCallsCount,
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
    // Calls booked across the whole team for today (powers the day-ahead tile).
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('scheduled_date', todayStr)
      .in('status', ['pending', 'in_progress', 'completed']),
  ])

  // ---------------------------------------------------------------------------
  // Value + compliance metrics over fixed default periods: PPM regulatory KPIs
  // use the current calendar month, and Sales/Defects values use the last
  // 60 days.
  // ---------------------------------------------------------------------------
  // PPM regulatory KPI range (current month).
  const ppmFrom = startOfMonth(today)
  const ppmTo = endOfMonth(today)
  // Sales/Defects value range (last 60 days).
  const valueFrom = startOfDay(subDays(today, 60))
  const valueTo = endOfDay(today)

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
  const valueRangeLabel = 'Last 60 days'
  const ppmRangeLabel = format(today, 'MMMM yyyy')

  // Everything awaiting this user's decision (RLS-scoped: managers see their
  // reports, accounts/admins see all) — leave requests plus form & task
  // submissions. Surfaced as an always-visible card so the count is discoverable
  // even when the detailed widget above is hidden.
  const [{ pending: pendingApprovals }, formApprovalsResult] = await Promise.all([
    getVisibleLeaveRequests(),
    getPendingApprovals(),
  ])
  const pendingFormApprovalsCount = formApprovalsResult.ok
    ? (formApprovalsResult.instances ?? []).length
    : 0
  const pendingApprovalsCount = pendingApprovals.length + pendingFormApprovalsCount

  // Per-user tile colour overrides (keyed by tile title). Empty = theme default.
  const tileColors = (profile as Profile).dashboard_tile_colors ?? {}

  // Per-user preferred tile order (array of tile titles). Empty = default order.
  const savedTileOrder = (profile as Profile).dashboard_tile_positions ?? []

  // Per-user pinned quick-shortcut destinations (max 3). Empty = all unset.
  const savedShortcuts = (profile as Profile).dashboard_shortcuts ?? []

  // Per-user dashboard background preset (subtle technical pattern). Null = clean.
  const savedBackground = (profile as Profile).dashboard_background ?? null
  const background = resolveDashboardBackground(savedBackground)

  // Rotating daily system fact, shared with the engineer home.
  const dailyFact = getDailyFact(today)

  const modules: ModuleCard[] = [
    {
      title: 'Approvals',
      description: 'Leave, forms & tasks to action',
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
      title: 'The day ahead',
      description: 'Calls booked today',
      icon: Sun,
      href: '/dashboard/calendar',
      metrics: [{ label: 'Booked today', value: todaysCallsCount.count || 0 }],
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
    {
      title: 'Did you know?',
      description: 'A daily fact about the systems we service',
      icon: Lightbulb,
      metrics: [],
      body: (
        <p className="line-clamp-4 text-pretty text-sm leading-relaxed text-muted-foreground">
          {dailyFact}
        </p>
      ),
    },
  ]

  // Time-aware greeting hero, mirroring the engineer home for a consistent,
  // modern feel across the app.
  const hour = today.getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = ((profile as Profile).full_name || 'there').split(' ')[0]

  return (
    // `isolate` creates a stacking context so the negative-z background layer
    // below stays contained here instead of slipping behind the opaque app
    // background (which made it invisible).
    <div className="relative isolate space-y-6">
      {/* Full-bleed background layer for the user's chosen pattern. Bleeds into
          the main content padding and sits behind the dashboard content
          (pointer-events disabled). Repainted optimistically by the picker. */}
      <div
        data-dashboard-bg
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-4 -z-10 rounded-xl md:-inset-6 ${background.className}`}
        style={
          background.imageUrl
            ? ({ '--dash-bg-image': `url(${background.imageUrl})` } as React.CSSProperties)
            : undefined
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground">{format(today, 'EEEE, d MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardBackgroundPicker current={savedBackground} />
          <AddRequestDialog triggerVariant="outline" />
        </div>
      </div>

      {/* Leave approvals waiting on this user (managers/accounts/admins only).
          Renders nothing when there is nothing to action. */}
      <Suspense fallback={null}>
        <ApprovalsWidget />
      </Suspense>

      {/* Compact status row: Your Tasks + live Lone Worker safety monitoring. */}
      <div className="grid gap-3 md:grid-cols-2">
        <Suspense fallback={null}>
          <YourTasksTile />
        </Suspense>
        <LoneWorkerDashboardTiles />
      </div>

      {/* Quick links — user-configurable shortcut tiles in a uniform row. */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Quick links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <DashboardShortcuts saved={savedShortcuts} />
        </div>
      </div>

      {/* Company overview — one hub per module. Rendered through a client grid
          that lets the user drag tiles into their preferred, saved order. */}
      <DashboardTileGrid
        savedOrder={savedTileOrder}
        tiles={modules.map((m): DashboardTile => {
          const color = tileColors[m.title] ?? null
          const iconStyle = tileIconStyle(color)
          return {
            title: m.title,
            node: (
            <Card
              key={m.title}
              className="group relative flex h-full min-h-[184px] flex-col overflow-hidden transition-colors hover:border-primary/50 hover:bg-accent/40"
              style={tileCardStyle(color)}
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
                  content so clicks anywhere navigate, except the colour picker.
                  Omitted for informational tiles with no destination. */}
              {m.href && (
                <Link
                  href={m.href}
                  aria-label={`Open ${m.title}`}
                  className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
              )}
              <div className="pointer-events-none relative z-[1] flex flex-1 flex-col">
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
                      {m.href && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      )}
                    </div>
                  </div>
                  <CardDescription className="pt-1">{m.description}</CardDescription>
                </CardHeader>
                {m.body ? (
                  <CardContent className="flex-1">{m.body}</CardContent>
                ) : (
                  m.metrics.length > 0 && (
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
                  )
                )}
              </div>
            </Card>
            ),
          }
        })}
      />
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
  // Optional: informational tiles (e.g. "Did you know?") have no destination.
  href?: string
  metrics: ModuleMetric[]
  // Optional custom content rendered in place of metrics.
  body?: ReactNode
}

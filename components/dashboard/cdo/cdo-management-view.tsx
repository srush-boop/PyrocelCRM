'use client'

import { useState } from 'react'
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
import { Progress } from '@/components/ui/progress'
import {
  ClipboardCheck,
  Route as RouteIcon,
  MapPinned,
  AlertTriangle,
  CalendarClock,
  UserX,
  Users,
  ChevronRight,
  Building2,
  Wrench,
  ShieldCheck,
  Siren,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { cn } from '@/lib/utils'

export interface CdoStats {
  services: number
  unroutedServices: number
  routes: number
  engineers: number
  openCalls: number
  overdueCalls: number
  completed90d: number
  complianceRate: number | null
}

export interface CdoRoute {
  id: string
  name: string
  color: string | null
  engineerId: string | null
  engineerName: string | null
  siteCount: number
  serviceCount: number
  openCalls: number
  overdueCalls: number
}

export interface CdoEngineer {
  id: string
  name: string
  routes: string[]
  openCalls: number
  overdueCalls: number
}

export interface CdoUnroutedService {
  id: string
  siteId: string | null
  siteName: string
  serviceName: string
}

export interface CdoCall {
  id: string
  reference: string | null
  status: string
  scheduledDate: string | null
  isEmergency: boolean
  overdue: boolean
  siteName: string | null
  serviceName: string | null
  engineerId: string | null
  engineerName: string | null
  routeId: string | null
}

interface Props {
  stats: CdoStats
  routes: CdoRoute[]
  engineers: CdoEngineer[]
  unrouted: CdoUnroutedService[]
  upcomingCalls: CdoCall[]
  overdueCalls: CdoCall[]
  unassignedCalls: CdoCall[]
  todayStr: string
}

// CDO discipline accent (teal), matching lib/disciplines.ts.
const CDO_ACCENT = 'text-teal-700 dark:text-teal-300'

function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'default',
  href,
}: {
  icon: typeof ClipboardCheck
  label: string
  value: string | number
  tone?: 'default' | 'warning' | 'danger'
  href?: string
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground'
  const inner = (
    <Card className={cn(href && 'transition-colors hover:border-teal-500/40')}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
          <Icon className={cn('h-5 w-5', CDO_ACCENT)} />
        </span>
        <div className="min-w-0">
          <p className={cn('text-2xl font-bold leading-none', toneClass)}>{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

function CallRow({ call }: { call: CdoCall }) {
  return (
    <Link
      href={`/dashboard/tasks/${call.id}`}
      className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5 text-sm transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {call.isEmergency && <Siren className="h-3.5 w-3.5 shrink-0 text-destructive" />}
          <span className="truncate font-medium">{call.siteName ?? 'Unknown site'}</span>
          {call.reference && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {call.reference}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {call.serviceName ?? 'Service'}
          {call.engineerName ? ` · ${call.engineerName}` : ' · unassigned'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          {call.scheduledDate && (
            <p className={cn('text-xs', call.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {formatDateUK(call.scheduledDate)}
            </p>
          )}
          {call.overdue && <p className="text-[10px] font-semibold uppercase text-destructive">Overdue</p>}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}

type CallTab = 'overdue' | 'upcoming' | 'unassigned'

export function CdoManagementView({
  stats,
  routes,
  engineers,
  unrouted,
  upcomingCalls,
  overdueCalls,
  unassignedCalls,
}: Props) {
  const [callTab, setCallTab] = useState<CallTab>(
    overdueCalls.length > 0 ? 'overdue' : 'upcoming',
  )
  const tabCalls =
    callTab === 'overdue' ? overdueCalls : callTab === 'upcoming' ? upcomingCalls : unassignedCalls

  const tabs: { key: CallTab; label: string; count: number; icon: typeof CalendarClock }[] = [
    { key: 'overdue', label: 'Overdue', count: overdueCalls.length, icon: AlertTriangle },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCalls.length, icon: CalendarClock },
    { key: 'unassigned', label: 'Unassigned', count: unassignedCalls.length, icon: UserX },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ClipboardCheck className={cn('h-7 w-7', CDO_ACCENT)} />
            CDO Management
          </h1>
          <p className="text-muted-foreground">
            Everything related to CDO-delivered services — routes, engineers, calls and compliance.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/routes">
            <RouteIcon className="mr-2 h-4 w-4" />
            Route planner
          </Link>
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={ClipboardCheck} label="CDO services" value={stats.services} />
        <StatTile
          icon={MapPinned}
          label="Unrouted services"
          value={stats.unroutedServices}
          tone={stats.unroutedServices > 0 ? 'warning' : 'default'}
        />
        <StatTile icon={RouteIcon} label="Active routes" value={stats.routes} />
        <StatTile icon={CalendarClock} label="Open calls" value={stats.openCalls} />
        <StatTile
          icon={AlertTriangle}
          label="Overdue calls"
          value={stats.overdueCalls}
          tone={stats.overdueCalls > 0 ? 'danger' : 'default'}
        />
        <StatTile
          icon={ShieldCheck}
          label="On-time (90d)"
          value={stats.complianceRate == null ? '—' : `${stats.complianceRate}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Routes overview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RouteIcon className="h-5 w-5" />
              Routes
            </CardTitle>
            <CardDescription>CDO delivery routes and their current workload</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {routes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No routes carry CDO services yet.
              </p>
            ) : (
              routes.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/routes/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color ?? '#0d9488' }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.engineerName ? `CDO: ${r.engineerName}` : 'No engineer assigned'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {r.siteCount}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Wrench className="h-3.5 w-3.5" />
                      {r.serviceCount}
                    </span>
                    <Badge variant="secondary">{r.openCalls} open</Badge>
                    {r.overdueCalls > 0 && (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        {r.overdueCalls} overdue
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* CDO engineers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              CDO engineers
            </CardTitle>
            <CardDescription>Engineers on the CDO discipline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {engineers.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No engineers are tagged with the <span className="font-medium">CDO</span> discipline
                yet. Set an engineer&apos;s discipline to CDO in{' '}
                <Link href="/dashboard/engineers" className="text-primary hover:underline">
                  Engineers
                </Link>{' '}
                to see them here.
              </div>
            ) : (
              engineers.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.routes.length ? e.routes.join(', ') : 'No route assigned'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <Badge variant="secondary">{e.openCalls} open</Badge>
                    {e.overdueCalls > 0 && (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        {e.overdueCalls}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* CDO calls */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">CDO calls</CardTitle>
            <CardDescription>Open CDO-delivered service calls</CardDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setCallTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    callTab === t.key
                      ? 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                      : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  <span className="rounded-full bg-muted px-1.5 text-[10px]">{t.count}</span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {tabCalls.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No {callTab} CDO calls.
              </p>
            ) : (
              tabCalls.map((c) => <CallRow key={c.id} call={c} />)
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                Compliance
              </CardTitle>
              <CardDescription>On-time completion, last 90 days</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.complianceRate == null ? (
                <p className="text-sm text-muted-foreground">No completed CDO calls in this window.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold">{stats.complianceRate}%</span>
                    <span className="text-xs text-muted-foreground">
                      {stats.completed90d} completed
                    </span>
                  </div>
                  <Progress value={stats.complianceRate} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unrouted services */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPinned className="h-5 w-5" />
                Unrouted services
              </CardTitle>
              <CardDescription>CDO services not yet on a route</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unrouted.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Every CDO service is on a route.
                </p>
              ) : (
                unrouted.slice(0, 12).map((s) => (
                  <Link
                    key={s.id}
                    href={s.siteId ? `/dashboard/sites/${s.siteId}` : '/dashboard/routes'}
                    className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.siteName}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.serviceName}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))
              )}
              {unrouted.length > 12 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  +{unrouted.length - 12} more
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

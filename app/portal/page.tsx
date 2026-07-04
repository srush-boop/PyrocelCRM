import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  FileText,
  CalendarClock,
  ReceiptText,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'
import { cn, formatDateUK } from '@/lib/utils'
import { formatPence, quoteTypeLabel, QUOTE_STATUS_META } from '@/lib/sales'
import type { Quote } from '@/lib/types/database'

export default async function PortalOverviewPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('clients(name)')
    .eq('id', user.id)
    .single()
  const clientName = (profile as any)?.clients?.name ?? null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString().slice(0, 10)

  // All queries below are automatically scoped to the client's permitted sites
  // by row-level security, so no manual client filtering is required.
  const [
    { data: openDefects },
    { data: recentReports },
    { data: upcomingTasks },
    { data: quotesData },
  ] = await Promise.all([
    supabase
      .from('defects')
      .select('id, task_id, reference_number, failed_count, created_at, site:sites(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('task_results')
      .select(
        `id, task_id, reference_number, overall_status, created_at,
         tasks(completed_at, site_services(sites(name), service_types(name)))`,
      )
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tasks')
      .select(
        `id, scheduled_date, status,
         site_services(sites(name), service_types(name))`,
      )
      .in('status', ['pending', 'in_progress'])
      .gte('scheduled_date', todayIso)
      .order('scheduled_date', { ascending: true })
      .limit(5),
    supabase
      .from('quotes')
      .select('*, site:sites(id, name)')
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const defects = openDefects ?? []
  const reports = recentReports ?? []
  const tasks = upcomingTasks ?? []
  const quotes = (quotesData ?? []) as (Quote & { site: { id: string; name: string } | null })[]

  const outstandingTotal = quotes.reduce((sum, q) => sum + (q.total_pence ?? 0), 0)

  const stats = [
    {
      label: 'Open defects',
      value: defects.length,
      hint: defects.length === 1 ? 'needs attention' : 'need attention',
      href: '/portal/reports',
      icon: AlertTriangle,
      accent: defects.length > 0 ? 'text-red-600' : 'text-muted-foreground',
    },
    {
      label: 'Recent reports',
      value: reports.length,
      hint: 'in the last updates',
      href: '/portal/reports',
      icon: FileText,
      accent: 'text-foreground',
    },
    {
      label: 'Upcoming services',
      value: tasks.length,
      hint: 'scheduled visits',
      href: '/portal/kpis',
      icon: CalendarClock,
      accent: 'text-foreground',
    },
    {
      label: 'Quotes to review',
      value: quotes.length,
      hint: quotes.length > 0 ? formatPence(outstandingTotal) : 'nothing pending',
      href: '/portal/quotes',
      icon: ReceiptText,
      accent: quotes.length > 0 ? 'text-blue-600' : 'text-muted-foreground',
    },
  ]

  const userName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {clientName
            ? `${clientName} Dashboard`
            : userName
              ? `Welcome back, ${userName}`
              : 'Welcome back'}
        </h1>
        <p className="text-muted-foreground">
          {userName ? `Welcome back, ${userName}. ` : ''}A summary of activity across your sites.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href} className="block">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </span>
                    <Icon className={cn('h-5 w-5', stat.accent)} aria-hidden="true" />
                  </div>
                  <div>
                    <p className={cn('text-3xl font-bold tabular-nums', stat.accent)}>
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Open defects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
              Open defects
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/portal/reports">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {defects.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No open defects. Everything looks good.
              </p>
            ) : (
              defects.map((d: any) => (
                <Link
                  key={d.id}
                  href={`/portal/reports/${d.task_id}`}
                  className="flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium">
                      {d.reference_number || 'Defect'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.site?.name || 'Unknown site'} · {formatDateUK(d.created_at)}
                    </p>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {d.failed_count} failed
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quotes to review */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4 text-blue-600" aria-hidden="true" />
              Quotes to review
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/portal/quotes">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {quotes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                You have no quotes awaiting a decision.
              </p>
            ) : (
              quotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/portal/quotes/${quote.id}`}
                  className="flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{quote.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {quote.quote_number ?? ''} · {quoteTypeLabel(quote.quote_type)}
                      {quote.site?.name ? ` · ${quote.site.name}` : ''}
                    </p>
                  </div>
                  <span className="hidden shrink-0 font-semibold tabular-nums sm:inline">
                    {formatPence(quote.total_pence, quote.currency)}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn('shrink-0', QUOTE_STATUS_META[quote.status].badgeClass)}
                  >
                    {QUOTE_STATUS_META[quote.status].label}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent reports */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Recent reports
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/portal/reports">
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {reports.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No service reports yet.
              </p>
            ) : (
              reports.map((r: any) => {
                const status = r.overall_status as string | null
                return (
                  <Link
                    key={r.id}
                    href={`/portal/reports/${r.task_id}`}
                    className="flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-medium">
                        {r.reference_number || '-'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.tasks?.site_services?.sites?.name || 'Unknown site'} ·{' '}
                        {r.tasks?.site_services?.service_types?.name || 'Service'}
                      </p>
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatDateUK(r.tasks?.completed_at || r.created_at)}
                    </span>
                    <ReportStatusBadge status={status} />
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Upcoming services */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Upcoming services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No visits currently scheduled.
              </p>
            ) : (
              tasks.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.site_services?.service_types?.name || 'Scheduled service'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.site_services?.sites?.name || 'Unknown site'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {t.scheduled_date ? formatDateUK(t.scheduled_date) : 'TBC'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.status === 'in_progress' ? 'In progress' : 'Scheduled'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: string | null }) {
  if (status === 'pass') {
    return <Badge className="shrink-0 bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
  }
  if (status === 'partial') {
    return <Badge className="shrink-0 bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
  }
  if (status === 'fail') {
    return <Badge variant="destructive" className="shrink-0">Fail</Badge>
  }
  if (status === 'no_access') {
    return <Badge className="shrink-0 bg-amber-500 text-white hover:bg-amber-500/90">No Access</Badge>
  }
  return <Badge variant="secondary" className="shrink-0">—</Badge>
}

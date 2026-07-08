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
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { ScanQrButton } from '@/components/dashboard/dampers/scan-qr-button'
import { ApprovalsWidget } from '@/components/dashboard/approvals/approvals-widget'
import { EngineerHome } from '@/components/dashboard/home/engineer-home'
import { Suspense } from 'react'
import { format } from 'date-fns'

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
  if (role === 'engineer') {
    return <EngineerHome profile={profile as Profile} />
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
  ])

  const modules: ModuleCard[] = [
    {
      title: 'Service',
      description: 'Calls, reports & defects',
      icon: Wrench,
      href: '/dashboard/service',
      metrics: [
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
      metrics: [{ label: 'Open quotes', value: openQuotesCount.count || 0 }],
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
        <ScanQrButton />
      </div>

      {/* Leave approvals waiting on this user (managers/accounts/admins only) */}
      <Suspense fallback={null}>
        <ApprovalsWidget />
      </Suspense>

      {/* Company overview — one hub per module */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {modules.map((m) => (
          <Link
            key={m.title}
            href={m.href}
            className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="group h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <m.icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="text-base">{m.title}</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
                          {metric.value}
                        </div>
                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

type ModuleMetric = {
  label: string
  value: number
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

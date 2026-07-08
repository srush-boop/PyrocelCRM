import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Hammer, ArrowRight, ClipboardCheck, TrendingUp, Percent } from 'lucide-react'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import { getJobs } from '@/lib/jobs/queries'
import { jobFinance } from '@/lib/jobs/finance'
import { JOB_STAGES, jobStageMeta, jobStatusMeta } from '@/lib/jobs/stages'
import { formatPence } from '@/lib/sales'
import { cn, formatDateUK } from '@/lib/utils'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'Jobs Dashboard | Pyrocel',
  description: 'Delivery of won work — stages, ownership and profit at a glance.',
}

export default async function JobsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)
  const jobs = await getJobs(supabase, scope.activeBranchId)

  const openJobs = jobs.filter((j) => j.status === 'open')
  const inContractReview = jobs.filter((j) => j.stage === 'contract_review' && j.status === 'open')
  const openValuePence = openJobs.reduce((sum, j) => sum + jobFinance(j).valuePence, 0)
  const openCostPence = openJobs.reduce((sum, j) => sum + jobFinance(j).quotedCostPence, 0)
  const openMarginPence = openValuePence - openCostPence
  const openMarginPercent = openValuePence > 0 ? Math.round((openMarginPence / openValuePence) * 1000) / 10 : null

  const kpis = [
    { label: 'Open jobs', value: String(openJobs.length), hint: `${jobs.length} total`, icon: Hammer },
    { label: 'In contract review', value: String(inContractReview.length), hint: 'awaiting sign-off', icon: ClipboardCheck },
    { label: 'Open value', value: formatPence(openValuePence), hint: 'net (ex-VAT)', icon: TrendingUp },
    { label: 'Open margin', value: openMarginPercent === null ? '—' : `${openMarginPercent}%`, hint: formatPence(openMarginPence), icon: Percent },
  ]

  // Count of open jobs per stage, for the pipeline breakdown.
  const stageCounts = JOB_STAGES.map((s) => ({
    ...s,
    count: openJobs.filter((j) => j.stage === s.key).length,
  }))

  const recentJobs = jobs.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Jobs Dashboard</h1>
          <p className="text-muted-foreground">Delivery of won work across the portfolio.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          <Button variant="outline" asChild>
            <Link href="/dashboard/jobs/list">
              All jobs
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 truncate text-2xl font-bold tabular-nums">{kpi.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <kpi.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        {/* Pipeline by stage */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Open jobs by stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCounts.map((s) => {
              const max = Math.max(1, ...stageCounts.map((x) => x.count))
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">{s.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(s.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">{s.count}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Recent jobs */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent jobs</CardTitle>
            <Button variant="ghost" size="sm" asChild className="-mr-2 h-8 text-muted-foreground">
              <Link href="/dashboard/jobs/list">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentJobs.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No jobs yet. Jobs are created automatically when a quote is accepted.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentJobs.map((job) => {
                  const stageMeta = jobStageMeta(job.stage)
                  const statusMeta = jobStatusMeta(job.status)
                  const fin = jobFinance(job)
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/dashboard/jobs/${job.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {job.job_number ? `${job.job_number} · ` : ''}
                            {job.title ?? 'Untitled job'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {job.client?.name ?? 'No client'} · {formatDateUK(job.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-semibold tabular-nums">{formatPence(fin.valuePence)}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">{stageMeta.label}</Badge>
                            <Badge variant="secondary" className={cn('text-[10px]', statusMeta.badgeClass)}>
                              {statusMeta.label}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

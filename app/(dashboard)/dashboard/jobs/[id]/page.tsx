import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  FileText,
  Building2,
  MapPin,
  User as UserIcon,
  Hammer,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { JobStagePanel, JobContractReview } from '@/components/dashboard/jobs/job-controls'
import { JobPurchasing } from '@/components/dashboard/jobs/job-purchasing'
import { jobStageMeta, jobStatusMeta } from '@/lib/jobs/stages'
import { jobFinance } from '@/lib/jobs/finance'
import { getJobCommittedCost, getJobPurchaseOrders, previewJobPurchasing } from '@/lib/jobs/purchasing'
import { formatPence } from '@/lib/sales'
import { cn, formatDateUK } from '@/lib/utils'
import type { Job, Profile } from '@/lib/types/database'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('jobs').select('job_number, title').eq('id', id).maybeSingle()
  const label = (data as { job_number?: string } | null)?.job_number ?? 'Job'
  return { title: `${label} | Pyrocel`, description: 'Job delivery overview.' }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: job } = await supabase
    .from('jobs')
    .select(
      '*, client:clients(id, name), site:sites(id, name, address, status), branch:branches(id, name), owner:profiles!jobs_owner_id_fkey(id, full_name), reviewer:profiles!jobs_contract_reviewed_by_fkey(id, full_name), quote:quotes(id, quote_number, title)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!job) notFound()

  const typedJob = job as Job & {
    client: { id: string; name: string } | null
    site: { id: string; name: string; address: string | null; status: string } | null
    branch: { id: string; name: string } | null
    owner: { id: string; full_name: string | null } | null
    reviewer: { id: string; full_name: string | null } | null
    quote: { id: string; quote_number: string | null; title: string | null } | null
  }

  const stage = jobStageMeta(typedJob.stage)
  const status = jobStatusMeta(typedJob.status)
  const finance = jobFinance(typedJob)
  const offContract = typedJob.site?.status === 'new' || typedJob.site?.status === 'dead'

  // Purchasing: committed cost (live POs), the job's orders and how many more
  // suppliers on the quote can still be ordered.
  const [committedCostPence, purchaseOrders, purchasingPreview] = await Promise.all([
    getJobCommittedCost(supabase, typedJob.id),
    getJobPurchaseOrders(supabase, typedJob.id),
    previewJobPurchasing(supabase, typedJob.id),
  ])
  const pendingSupplierCount = purchasingPreview.groups.filter(
    (g) => !g.alreadyOrdered && g.lines.length > 0,
  ).length

  const remainingBudgetPence = finance.quotedCostPence - committedCostPence
  const overCommitted = committedCostPence > finance.quotedCostPence

  const financeRows: {
    label: string
    value: string
    strong?: boolean
    accent?: boolean
    warn?: boolean
  }[] = [
    { label: 'Contract value (net)', value: formatPence(finance.valuePence), strong: true },
    { label: 'Quoted cost', value: formatPence(finance.quotedCostPence) },
    { label: 'Quoted margin', value: formatPence(finance.quotedMarginPence), accent: true },
    { label: 'Committed (POs)', value: formatPence(committedCostPence) },
    {
      label: 'Remaining budget',
      value: formatPence(remainingBudgetPence),
      warn: overCommitted,
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href="/dashboard/jobs/list">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {typedJob.job_number ?? 'Job'}
              </h1>
              <Badge variant="outline" className={cn('capitalize', status.badgeClass)}>
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-pretty">
              {typedJob.title ?? typedJob.quote?.title ?? 'Untitled job'}
            </p>
          </div>
          {typedJob.quote ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/sales/${typedJob.quote.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                View quote {typedJob.quote.quote_number ?? ''}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <JobStagePanel
            jobId={typedJob.id}
            stage={typedJob.stage}
            status={typedJob.status}
            contractReviewedAt={typedJob.contract_reviewed_at}
            reviewerName={typedJob.reviewer?.full_name ?? null}
          />

          {typedJob.stage === 'contract_review' ? (
            <JobContractReview
              jobId={typedJob.id}
              contractReviewedAt={typedJob.contract_reviewed_at}
              reviewerName={typedJob.reviewer?.full_name ?? null}
            />
          ) : null}

          {/* Profit monitor */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Profit monitor
              </CardTitle>
              {finance.quotedMarginPercent !== null ? (
                <Badge variant="secondary" className="bg-chart-4/15 text-foreground">
                  {finance.quotedMarginPercent}% margin
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="space-y-2">
                {financeRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd
                      className={cn(
                        'font-mono text-sm tabular-nums',
                        row.strong && 'font-semibold',
                        row.accent && 'text-chart-4',
                        row.warn && 'font-semibold text-destructive',
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Separator />
              <p className="text-xs text-muted-foreground text-pretty">
                Contract value and quoted cost are the snapshot captured when the quote was
                accepted. <strong>Committed</strong> reflects live purchase orders (excluding
                cancelled). Actual costs (stock, expenses, subcontractors) will feed in as those
                modules come online.
              </p>
            </CardContent>
          </Card>

          <JobPurchasing
            jobId={typedJob.id}
            orders={purchaseOrders}
            pendingSupplierCount={pendingSupplierCount}
          />
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {offContract ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-pretty">
                    This site is <strong>off-contract</strong>. Any calls raised against it will
                    show a pre-attendance warning.
                  </span>
                </div>
              ) : null}

              <DetailRow icon={Building2} label="Client">
                {typedJob.client ? (
                  <Link
                    href={`/dashboard/clients/${typedJob.client.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {typedJob.client.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </DetailRow>

              <DetailRow icon={MapPin} label="Site">
                {typedJob.site ? (
                  <Link
                    href={`/dashboard/sites/${typedJob.site.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {typedJob.site.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </DetailRow>

              <DetailRow icon={UserIcon} label="Project manager">
                <span className="font-medium text-foreground">
                  {typedJob.owner?.full_name ?? 'Unassigned'}
                </span>
              </DetailRow>

              <DetailRow icon={Hammer} label="Stage">
                <span className="font-medium text-foreground">{stage.label}</span>
              </DetailRow>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-medium text-foreground">{typedJob.branch?.name ?? '—'}</span>
              </div>
              {typedJob.po_number ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Customer PO</span>
                  <span className="font-medium text-foreground">{typedJob.po_number}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium text-foreground">{formatDateUK(typedJob.created_at)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  )
}

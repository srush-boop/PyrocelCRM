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
  Wallet,
  TrendingUp,
  ShoppingCart,
  PiggyBank,
  AlertTriangle,
} from 'lucide-react'
import { CreateDocumentButton } from '@/components/documents/create-document-dialog'
import { AddRequestButton } from '@/components/dashboard/requests/add-request-button'
import { EntityRequestsCard } from '@/components/dashboard/requests/entity-requests-card'
import { BookJobCallButton } from '@/components/dashboard/jobs/book-job-call-button'
import { RaiseJobInvoiceButton } from '@/components/dashboard/jobs/raise-job-invoice-button'
import { RecordIssuedEquipmentButton } from '@/components/dashboard/jobs/record-issued-equipment-button'
import { JobContractReview } from '@/components/dashboard/jobs/job-controls'
import { JobProgressTracker } from '@/components/dashboard/jobs/job-progress-tracker'
import { JobInvoicesCard, type JobInvoiceRow } from '@/components/dashboard/jobs/job-invoices-card'
import { JobCallsCard, type JobCallRow } from '@/components/dashboard/jobs/job-calls-card'
import { JobPurchasing } from '@/components/dashboard/jobs/job-purchasing'
import { JobDocuments } from '@/components/dashboard/jobs/job-documents'
import { getAllDocumentTags, getOwnerDocuments } from '@/lib/documents/data'
import { jobStageMeta, jobStatusMeta } from '@/lib/jobs/stages'
import { jobFinance } from '@/lib/jobs/finance'
import { getJobCommittedCost, getJobPurchaseOrders, getJobOrderingProgress } from '@/lib/jobs/purchasing'
import { formatPence } from '@/lib/sales'
import { cn, formatDateUK } from '@/lib/utils'
import type { Job, JobStage, Profile } from '@/lib/types/database'

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

  // Purchasing, linked invoices and calls — everything needed to both display
  // the job and derive which pipeline stages have real supporting activity.
  const [
    committedCostPence,
    purchaseOrders,
    orderingProgress,
    suppliersResult,
    invoicesResult,
    callsResult,
  ] = await Promise.all([
    getJobCommittedCost(supabase, typedJob.id),
    getJobPurchaseOrders(supabase, typedJob.id),
    getJobOrderingProgress(supabase, typedJob.id),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total_pence, subtotal_pence, issue_date, created_at, document_type')
      .eq('job_id', typedJob.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('tasks')
      .select('id, reference_number, title, status, scheduled_date, is_commissioning')
      .eq('source_job_id', typedJob.id)
      .order('scheduled_date', { ascending: true, nullsFirst: false }),
  ])

  const suppliers = (suppliersResult.data ?? []) as { id: string; name: string }[]
  const invoices = (invoicesResult.data ?? []) as JobInvoiceRow[]
  const calls = (callsResult.data ?? []) as JobCallRow[]

  // Document store for this job (uploads, folders + generated letters). This
  // page is already gated to admin/office, so document management is allowed.
  const [jobDocuments, allDocumentTags] = await Promise.all([
    getOwnerDocuments('job', typedJob.id),
    getAllDocumentTags(),
  ])

  const remainingBudgetPence = finance.quotedCostPence - committedCostPence
  const overCommitted = committedCostPence > finance.quotedCostPence

  // Net invoiced (exclude void invoices) for the invoiced-of-quoted summary.
  const invoicedNetPence = invoices
    .filter((inv) => inv.status !== 'void')
    .reduce((sum, inv) => sum + (inv.subtotal_pence ?? 0), 0)
  const fullyInvoiced = finance.valuePence > 0 && invoicedNetPence >= finance.valuePence

  const callsCount = calls.length
  const completedCalls = calls.filter((c) => c.status === 'completed').length
  const nothingToOrder = orderingProgress.length === 0

  // Stage evidence: which pipeline stages have real activity behind them. This
  // powers the progress tracker's ticks and its "suggested stage" hint.
  const reviewed = !!typedJob.contract_reviewed_at
  const stageDone: Record<JobStage, boolean> = {
    contract_review: reviewed,
    ordering: purchaseOrders.length > 0 || nothingToOrder,
    in_progress: callsCount > 0,
    commissioning: completedCalls > 0,
    handover: false,
    complete: typedJob.status === 'complete' || fullyInvoiced,
  }
  const stageDetail: Partial<Record<JobStage, string>> = {
    contract_review: reviewed ? 'Reviewed' : undefined,
    ordering: nothingToOrder
      ? 'Nothing to order'
      : purchaseOrders.length > 0
        ? `${purchaseOrders.length} PO${purchaseOrders.length === 1 ? '' : 's'}`
        : undefined,
    in_progress: callsCount > 0 ? `${callsCount} call${callsCount === 1 ? '' : 's'}` : undefined,
    commissioning: completedCalls > 0 ? `${completedCalls} completed` : undefined,
    complete: fullyInvoiced
      ? 'Invoiced in full'
      : typedJob.status === 'complete'
        ? 'Closed out'
        : undefined,
  }

  const stats: {
    label: string
    value: string
    icon: React.ComponentType<{ className?: string }>
    accent?: boolean
    warn?: boolean
    hint?: string
  }[] = [
    {
      label: 'Contract value (net)',
      value: formatPence(finance.valuePence),
      icon: Wallet,
    },
    {
      label: 'Quoted margin',
      value: formatPence(finance.quotedMarginPence),
      icon: TrendingUp,
      accent: true,
      hint: finance.quotedMarginPercent !== null ? `${finance.quotedMarginPercent}%` : undefined,
    },
    {
      label: 'Committed (POs)',
      value: formatPence(committedCostPence),
      icon: ShoppingCart,
      hint: `of ${formatPence(finance.quotedCostPence)} budget`,
    },
    {
      label: 'Remaining budget',
      value: formatPence(remainingBudgetPence),
      icon: PiggyBank,
      warn: overCommitted,
      hint: overCommitted ? 'Over budget' : undefined,
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href="/dashboard/jobs/list">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Hammer className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {typedJob.job_number ?? 'Job'}
              </h1>
              <Badge variant="outline" className={cn('capitalize', status.badgeClass)}>
                {status.label}
              </Badge>
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                {stage.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-pretty">
              {typedJob.title ?? typedJob.quote?.title ?? 'Untitled job'}
            </p>
          </div>

          {/* Actions: primary delivery actions first, then documents/requests */}
          <div className="flex flex-wrap items-center gap-2">
            <BookJobCallButton
              jobId={typedJob.id}
              siteId={typedJob.site?.id ?? null}
              siteName={typedJob.site?.name ?? null}
              clientId={typedJob.client?.id ?? null}
              jobNumber={typedJob.job_number ?? null}
              jobTitle={typedJob.title ?? typedJob.quote?.title ?? null}
              poNumber={typedJob.po_number ?? null}
              jobNotes={typedJob.notes ?? null}
            />
            {typedJob.status !== 'cancelled' && (
              <>
                <RecordIssuedEquipmentButton jobId={typedJob.id} />
                <RaiseJobInvoiceButton jobId={typedJob.id} />
              </>
            )}
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            {typedJob.quote ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/sales/${typedJob.quote.id}`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Quote {typedJob.quote.quote_number ?? ''}
                </Link>
              </Button>
            ) : null}
            <AddRequestButton
              entityType="job"
              entityId={typedJob.id}
              context={{
                siteId: typedJob.site?.id ?? null,
                clientId: typedJob.client?.id ?? null,
                label: `Job ${typedJob.job_number ?? typedJob.title ?? ''}`.trim(),
              }}
              revalidate={`/dashboard/jobs/${typedJob.id}`}
            />
            <CreateDocumentButton
              ownerType="job"
              ownerId={typedJob.id}
              entityLabel={typedJob.job_number ?? typedJob.title ?? 'Job'}
              revalidatePath={`/dashboard/jobs/${typedJob.id}`}
            />
          </div>
        </div>
      </div>

      {/* Progress tracker */}
      <JobProgressTracker
        jobId={typedJob.id}
        stage={typedJob.stage}
        status={typedJob.status}
        contractReviewedAt={typedJob.contract_reviewed_at}
        stageDone={stageDone}
        stageDetail={stageDetail}
      />

      {/* Finance KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </span>
              <span
                className={cn(
                  'font-mono text-lg font-semibold tabular-nums',
                  s.accent && 'text-chart-4',
                  s.warn && 'text-destructive',
                )}
              >
                {s.value}
              </span>
              {s.hint ? (
                <span
                  className={cn(
                    'text-xs text-muted-foreground',
                    s.warn && 'font-medium text-destructive',
                  )}
                >
                  {s.hint}
                </span>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {typedJob.stage === 'contract_review' ? (
            <JobContractReview
              jobId={typedJob.id}
              contractReviewedAt={typedJob.contract_reviewed_at}
              reviewerName={typedJob.reviewer?.full_name ?? null}
            />
          ) : null}

          <JobPurchasing
            jobId={typedJob.id}
            orders={purchaseOrders}
            progress={orderingProgress}
            suppliers={suppliers}
          />

          <JobCallsCard calls={calls} />

          <JobInvoicesCard
            invoices={invoices}
            quotedNetPence={finance.valuePence}
            invoicedNetPence={invoicedNetPence}
          />

          <JobDocuments
            jobId={typedJob.id}
            folders={jobDocuments.folders}
            files={jobDocuments.files}
            canManage
            allTags={allDocumentTags}
            usedTags={jobDocuments.usedTags}
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

              <Separator />

              <p className="text-xs text-muted-foreground text-pretty">
                Contract value and quoted cost are the snapshot captured when the quote was
                accepted. <strong>Committed</strong> reflects live purchase orders (excluding
                cancelled).
              </p>
            </CardContent>
          </Card>

          <EntityRequestsCard entityType="job" entityId={typedJob.id} />
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

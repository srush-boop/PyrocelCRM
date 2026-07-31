import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, ReceiptText, AlertTriangle, ExternalLink, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatDateUK } from '@/lib/utils'
import { getFailedChecklistItems, getAdvisoryChecklistItems, DEFECT_STATUS_LABELS } from '@/lib/defects'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'
import { DefectStatusActions } from '@/components/dashboard/defects/defect-status-actions'
import { RaiseRemedialDialog } from '@/components/dashboard/defects/raise-remedial-dialog'
import { SuggestedPartsPicker } from '@/components/dashboard/tasks/suggested-parts-picker'
import { AddRequestButton } from '@/components/dashboard/requests/add-request-button'
import { EntityRequestsCard } from '@/components/dashboard/requests/entity-requests-card'
import type { ChecklistResult, DefectStatus } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

/** Resolve the correct report viewer path for a service type. */
function reportPath(serviceName: string, taskId: string): string {
  if (isDamperService(serviceName)) return `/dashboard/dampers/report/${taskId}`
  if (isExtinguisherService(serviceName)) return `/dashboard/extinguishers/report/${taskId}`
  return `/dashboard/reports/${taskId}`
}

const STATUS_VARIANT: Record<DefectStatus, 'destructive' | 'secondary' | 'default' | 'outline'> = {
  open: 'destructive',
  quoted: 'secondary',
  resolved: 'default',
  dismissed: 'outline',
}

export default async function DefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'office'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data } = await supabase
    .from('defects')
    .select(
      `*,
       site:sites(id, name),
       client:clients(id, name),
       quote:quotes(id, reference, status),
       task_result:task_results(id, engineer_notes, created_at, checklist_results),
       task:tasks!defects_task_id_fkey(id, site_service:site_services(service_type:service_types(name)))`,
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  // Active engineers/subcontractors the remedial call can be assigned to.
  const { data: engineerRows } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['engineer', 'subcontractor'])
    .eq('status', 'active')
    .order('full_name')
  const engineers = (engineerRows ?? []).map((e: any) => ({
    id: e.id as string,
    name: (e.full_name as string | null) || (e.email as string) || 'Unknown',
  }))

  const d = data as any
  const status: DefectStatus = d.status
  const siteName: string = d.site?.name ?? 'Unknown site'
  const clientName: string = d.client?.name ?? 'Unknown client'
  const serviceName: string = d.task?.site_service?.service_type?.name ?? 'Unknown service'
  const failedItems = getFailedChecklistItems(
    (d.task_result?.checklist_results ?? []) as ChecklistResult[],
  )
  const advisoryItems = getAdvisoryChecklistItems(
    (d.task_result?.checklist_results ?? []) as ChecklistResult[],
  )
  const isOpen = status === 'open'

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href="/dashboard/defects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Defects
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-balance">
                {d.reference_number ?? 'Defect'}
              </h1>
              <Badge variant={STATUS_VARIANT[status]}>{DEFECT_STATUS_LABELS[status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {siteName} · {clientName} · {serviceName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOpen && (
              <Button asChild>
                <Link href={`/dashboard/sales/new?defect=${d.id}`}>
                  <ReceiptText className="mr-2 h-4 w-4" />
                  Raise remedial quote
                </Link>
              </Button>
            )}
            {isOpen && <RaiseRemedialDialog defectId={d.id} engineers={engineers} />}
            <AddRequestButton
              entityType="defect"
              entityId={d.id}
              context={{
                siteId: d.site?.id ?? null,
                clientId: d.client?.id ?? null,
                label: `Defect ${d.reference_number ?? ''}`.trim(),
              }}
              revalidate={`/dashboard/defects/${d.id}`}
            />
            <DefectStatusActions defectId={d.id} status={status} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Failed items interrogation */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Failed checks ({failedItems.length})
            </CardTitle>
            <CardDescription>
              Items that did not pass on this report. These seed the scope when you raise a remedial
              quote.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {failedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No itemised failures were recorded on this report.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {failedItems.map((item, i) => (
                  <li
                    key={item.item_id}
                    className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-semibold text-destructive-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.notes && (
                        <p className="text-sm text-muted-foreground">{item.notes}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {advisoryItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium">Advisories ({advisoryItems.length})</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Not failures, but observations the engineer flagged for review.
                </p>
                <ul className="flex flex-col gap-3">
                  {advisoryItems.map((item, i) => (
                    <li
                      key={item.item_id}
                      className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.task_result?.engineer_notes && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Engineer notes
                </p>
                <p className="mt-1 text-sm">{d.task_result.engineer_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary / links */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Failures</span>
              <Badge variant="destructive">{d.failed_count}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Advisories</span>
              {(d.advisory_count ?? 0) > 0 ? (
                <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                  {d.advisory_count}
                </Badge>
              ) : (
                <span>0</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Logged</span>
              <span>{formatDateUK(d.created_at)}</span>
            </div>
            {d.resolved_at && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Resolved</span>
                <span>{formatDateUK(d.resolved_at)}</span>
              </div>
            )}

            {d.task?.id && (
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={reportPath(serviceName, d.task.id)}>
                  <FileText className="mr-2 h-4 w-4" />
                  View full report
                </Link>
              </Button>
            )}

            {d.quote?.id && (
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={`/dashboard/sales/${d.quote.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View quote {d.quote.reference ?? ''}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <EntityRequestsCard entityType="defect" entityId={d.id} />
        </div>
      </div>

      {/* Internal suggested parts recorded by the engineer for this defect */}
      {d.task?.id && <SuggestedPartsPicker taskId={d.task.id} canEdit />}
    </div>
  )
}

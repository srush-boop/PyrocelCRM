import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DefectsTable, type DefectRow } from '@/components/dashboard/defects/defects-table'
import { getSuggestedPartCounts } from '@/lib/defects-data'

export const dynamic = 'force-dynamic'

export default async function DefectsPage() {
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
       task:tasks!defects_task_id_fkey(id, site_service:site_services(service_type:service_types(name)))`,
    )
    .order('created_at', { ascending: false })

  const partCounts = await getSuggestedPartCounts(
    (data ?? []).map((d: any) => d.task_id).filter(Boolean),
  )

  const defects: DefectRow[] = (data ?? []).map((d: any) => ({
    id: d.id,
    taskId: d.task_id,
    referenceNumber: d.reference_number,
    failedCount: d.failed_count,
    status: d.status,
    quoteId: d.quote_id,
    createdAt: d.created_at,
    resolvedAt: d.resolved_at,
    siteName: d.site?.name ?? 'Unknown site',
    clientName: d.client?.name ?? 'Unknown client',
    serviceName: d.task?.site_service?.service_type?.name ?? 'Unknown service',
    suggestedPartsCount: d.task_id ? (partCounts[d.task_id] ?? 0) : 0,
  }))

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Defects</h1>
        <p className="text-sm text-muted-foreground">
          Failed reports that may require remedial works. Raise a remedial quote directly from a
          defect.
        </p>
      </div>
      <DefectsTable defects={defects} />
    </div>
  )
}

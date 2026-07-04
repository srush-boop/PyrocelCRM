import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortalReportsList, type PortalReport } from '@/components/portal/portal-reports-list'

export default async function PortalReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // RLS automatically limits these rows to the client's permitted sites.
  const { data } = await supabase
    .from('task_results')
    .select(
      `id,
       task_id,
       reference_number,
       overall_status,
       created_at,
       tasks(
         completed_at,
         site_services(
           sites(id, name),
           service_types(id, name)
         )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(500)

  const reports: PortalReport[] = (data || []).map((item: any) => ({
    id: item.id,
    taskId: item.task_id,
    referenceNumber: item.reference_number || '-',
    siteName: item.tasks?.site_services?.sites?.name || 'Unknown site',
    serviceName: item.tasks?.site_services?.service_types?.name || 'Unknown service',
    overallStatus: item.overall_status,
    completedAt: item.tasks?.completed_at || item.created_at,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service Reports</h1>
        <p className="text-muted-foreground">
          View and print the service reports for your sites
        </p>
      </div>
      <PortalReportsList reports={reports} />
    </div>
  )
}

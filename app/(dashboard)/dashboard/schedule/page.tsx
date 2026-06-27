import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ScheduleView } from '@/components/dashboard/schedule/schedule-view'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { ScanQrButton } from '@/components/dashboard/dampers/scan-qr-button'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import type { Profile, Site, ServiceType, SiteService, TaskWithDetails } from '@/lib/types/database'

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const isAdminOrOffice = (profile as Profile).role === 'admin' || (profile as Profile).role === 'office'

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)

  // Build tasks query based on role
  let tasksQuery = supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(
        *,
        route:routes(*),
        area:areas(*),
        subcontractor:subcontractors(*),
        site:sites(*, route:routes(*), branch:branches(*)),
        service_type:service_types(*)
      ),
      assigned_engineer:profiles(*),
      visit_type:service_visit_types(*)
    `)
    .order('scheduled_date', { ascending: true })

  // Engineers only see their tasks
  if ((profile as Profile).role === 'engineer') {
    tasksQuery = tasksQuery.eq('assigned_engineer_id', user.id)
  }

  const { data: tasksData } = await tasksQuery

  // Scope tasks to the active branch (by the task's site branch). Engineers are
  // already limited to their own tasks; this further narrows admin/office views.
  const tasks = scope.activeBranchId
    ? ((tasksData || []) as TaskWithDetails[]).filter(
        (t) => t.site_service?.site?.branch_id === scope.activeBranchId,
      )
    : ((tasksData || []) as TaskWithDetails[])

  // Only load additional data for admins/office
  let sites: Site[] = []
  let engineers: Profile[] = []
  let siteServices: (SiteService & { site: Site; service_type: ServiceType })[] = []

  if (isAdminOrOffice) {
    const [sitesResult, engineersResult, siteServicesResult] = await Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('site_services').select(`
        *,
        site:sites(*),
        service_type:service_types(*)
      `),
    ])

    sites = (sitesResult.data || []) as Site[]
    engineers = (engineersResult.data || []) as Profile[]
    // Dead sites and dead service types are paused: do not allow scheduling new tasks for them
    siteServices = ((siteServicesResult.data || []) as (SiteService & { site: Site; service_type: ServiceType })[])
      .filter((ss) => ss.site?.status !== 'dead' && ss.service_type?.status !== 'dead')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground">
            {isAdminOrOffice ? 'Manage and schedule service tasks' : 'View your scheduled tasks'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminOrOffice && (
            <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          )}
          <ScanQrButton />
          {isAdminOrOffice && (
            <CreateTaskDialog 
              siteServices={siteServices}
              engineers={engineers}
            />
          )}
        </div>
      </div>

      <ScheduleView 
        tasks={tasks} 
        profile={profile as Profile}
        engineers={engineers}
      />
    </div>
  )
}

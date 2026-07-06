import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleView } from '@/components/dashboard/schedule/schedule-view'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { GenerateCallsButton } from '@/components/dashboard/schedule/generate-calls-button'
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
        subcontractor:suppliers!site_services_subcontractor_id_fkey(*),
        site:sites(*, route:routes(*), branch:branches(*), client:clients(id, name)),
        service_type:service_types(*, system_type:system_types(*))
      ),
      assigned_engineer:profiles(*),
      visit_type:service_visit_types(*),
      client:clients(id, name)
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
  let clients: { id: string; name: string }[] = []

  if (isAdminOrOffice) {
    const [sitesResult, engineersResult, siteServicesResult, clientsResult] = await Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('site_services').select(`
        *,
        site:sites(*, client:clients(id, name)),
        service_type:service_types(*, system_type:system_types(*))
      `),
      supabase.from('clients').select('id, name').order('name'),
    ])

    sites = (sitesResult.data || []) as Site[]
    engineers = (engineersResult.data || []) as Profile[]
    // Dead sites and dead service types are paused: do not allow scheduling new tasks for them
    siteServices = ((siteServicesResult.data || []) as (SiteService & { site: Site; service_type: ServiceType })[])
      .filter((ss) => ss.site?.status !== 'dead' && ss.service_type?.status !== 'dead')
    clients = (clientsResult.data || []) as { id: string; name: string }[]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calls</h1>
          <p className="text-muted-foreground">
            {isAdminOrOffice ? 'Manage and book service calls' : 'View your calls'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {isAdminOrOffice && (
            <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          )}
          <ScanQrButton />
          {isAdminOrOffice && (
            <Button asChild variant="outline">
              <Link href="/dashboard/schedule/planning">
                <CalendarClock className="h-4 w-4" />
                Planning
              </Link>
            </Button>
          )}
          {isAdminOrOffice && <GenerateCallsButton />}
          {isAdminOrOffice && (
            <CreateTaskDialog 
              siteServices={siteServices}
              engineers={engineers}
              clients={clients}
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

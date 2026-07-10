import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, MapPinned } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleView } from '@/components/dashboard/schedule/schedule-view'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { GenerateCallsButton } from '@/components/dashboard/schedule/generate-calls-button'
import { ScanQrButton } from '@/components/dashboard/dampers/scan-qr-button'
import { AddRequestDialog } from '@/components/dashboard/requests/add-request-dialog'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import type { Profile, Site, ServiceType, SiteService, SystemType, TaskWithDetails } from '@/lib/types/database'
import { normalizeTasks } from '@/lib/normalize-task'

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
      direct_site:sites!tasks_site_id_fkey(*, route:routes(*), branch:branches(*), client:clients(id, name)),
      direct_service_type:service_types!tasks_service_type_id_fkey(*, system_type:system_types(*)),
      direct_system_type:system_types!tasks_system_type_id_fkey(*),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      visit_type:service_visit_types(*),
      client:clients(id, name)
    `)
    .order('scheduled_date', { ascending: true })

  // Engineers only see their tasks
  if ((profile as Profile).role === 'engineer') {
    tasksQuery = tasksQuery.eq('assigned_engineer_id', user.id)
  }

  const { data: tasksData } = await tasksQuery

  // Reactive / emergency calls have no recurring site_service — synthesise one
  // from their direct site/service/system relations so the list renders them.
  const normalizedTasks = normalizeTasks((tasksData || []) as TaskWithDetails[])

  // Scope tasks to the active branch (by the task's site branch). Engineers are
  // already limited to their own tasks; this further narrows admin/office views.
  const tasks = scope.activeBranchId
    ? normalizedTasks.filter((t) => t.site_service?.site?.branch_id === scope.activeBranchId)
    : normalizedTasks

  // Only load additional data for admins/office
  let sites: Site[] = []
  let engineers: Profile[] = []
  let siteServices: (SiteService & { site: Site; service_type: ServiceType })[] = []
  let clients: { id: string; name: string }[] = []
  let reactiveServiceTypes: ServiceType[] = []
  let systemTypes: SystemType[] = []

  if (isAdminOrOffice) {
    const [sitesResult, engineersResult, siteServicesResult, clientsResult, serviceTypesResult, systemTypesResult] =
      await Promise.all([
        supabase.from('sites').select('*').order('name'),
        supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
        supabase.from('site_services').select(`
          *,
          site:sites(*, client:clients(id, name)),
          service_type:service_types(*, system_type:system_types(*))
        `),
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('service_types').select('*, system_type:system_types(*)').order('name'),
        supabase.from('system_types').select('*').order('name'),
      ])

    sites = (sitesResult.data || []) as Site[]
    engineers = (engineersResult.data || []) as Profile[]
    // Dead sites and dead service types are paused: do not allow scheduling new tasks for them
    siteServices = ((siteServicesResult.data || []) as (SiteService & { site: Site; service_type: ServiceType })[])
      .filter((ss) => ss.site?.status !== 'dead' && ss.service_type?.status !== 'dead')
    clients = (clientsResult.data || []) as { id: string; name: string }[]
    // Reactive / emergency (non-recurring) call types are logged ad-hoc via Book Call.
    reactiveServiceTypes = ((serviceTypesResult.data || []) as ServiceType[]).filter(
      (st) => st.is_recurring === false && (st.status || 'live') !== 'dead',
    )
    systemTypes = (systemTypesResult.data || []) as SystemType[]
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Title row: the circular Scan QR sits level with the "Calls" heading. */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calls</h1>
            <p className="text-sm text-muted-foreground">
              {isAdminOrOffice ? 'Manage and book service calls' : 'View your calls'}
            </p>
          </div>
          <ScanQrButton
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
          />
        </div>

        {/* Admin/office actions get their own tidy row below the title. */}
        {isAdminOrOffice && (
          <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
            <Button asChild variant="outline">
              <Link href="/dashboard/schedule/planning">
                <CalendarClock className="h-4 w-4" />
                Planning
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/schedule/map">
                <MapPinned className="h-4 w-4" />
                Map view
              </Link>
            </Button>
            <AddRequestDialog triggerVariant="outline" />
            <GenerateCallsButton />
            <CreateTaskDialog
              siteServices={siteServices}
              engineers={engineers}
              clients={clients}
              reactiveServiceTypes={reactiveServiceTypes}
              sites={sites}
              systemTypes={systemTypes}
            />
          </div>
        )}
      </div>

      <ScheduleView 
        tasks={tasks} 
        profile={profile as Profile}
        engineers={engineers}
      />
    </div>
  )
}

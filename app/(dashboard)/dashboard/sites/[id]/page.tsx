import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, MapPin, Phone, Mail, Building2, Radio } from 'lucide-react'
import { SiteServicesManager } from '@/components/dashboard/sites/site-services-manager'
import { SiteReports } from '@/components/dashboard/sites/site-reports'
import { DamperRegister } from '@/components/dashboard/dampers/damper-register'
import { McpRegister } from '@/components/dashboard/mcps/mcp-register'
import { EmergencyLightRegister } from '@/components/dashboard/emergency-lights/emergency-light-register'
import { isDamperService } from '@/lib/dampers'
import { isFireAlarmService } from '@/lib/mcps'
import { isEmergencyLightService } from '@/lib/emergency-lights'
import { REMOTE_MONITORING_LABELS } from '@/lib/sites'
import type {
  Profile,
  Site,
  Route,
  ServiceType,
  SiteService,
  Task,
  TaskResult,
  Damper,
  Mcp,
  McpInspection,
  EmergencyLight,
  EmergencyLightInspection,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const { data: site } = await supabase
    .from('sites')
    .select(`
      *,
      route:routes(*)
    `)
    .eq('id', id)
    .single()

  if (!site) {
    notFound()
  }

  const [siteServicesResult, serviceTypesResult, engineersResult, routesResult] = await Promise.all([
    supabase
      .from('site_services')
      .select(`
        *,
        service_type:service_types(*),
        route:routes(*),
        assigned_engineer:profiles(*)
      `)
      .eq('site_id', id),
    supabase.from('service_types').select('*').order('name'),
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'engineer')
      .order('full_name'),
    supabase.from('routes').select('*').order('name'),
  ])

  const siteServices = (siteServicesResult.data || []) as (SiteService & { service_type: ServiceType })[]
  const serviceTypes = (serviceTypesResult.data || []) as ServiceType[]
  const engineers = (engineersResult.data || []) as Profile[]
  const routes = (routesResult.data || []) as Route[]

  // Get tasks for this site's services
  const siteServiceIds = siteServices.map(ss => ss.id)
  const { data: tasksData } = siteServiceIds.length > 0 
    ? await supabase
        .from('tasks')
        .select('*')
        .in('site_service_id', siteServiceIds)
    : { data: [] }
  
  const tasks = (tasksData || []) as Task[]

  // Get completed tasks with their results for reporting
  const { data: completedTasksData } = siteServiceIds.length > 0 
    ? await supabase
        .from('tasks')
        .select(`
          *,
          site_service:site_services(*, service_type:service_types(*)),
          assigned_engineer:profiles(*),
          task_result:task_results(*)
        `)
        .in('site_service_id', siteServiceIds)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
    : { data: [] }
  
  const completedTasks = (completedTasksData || []).map((task: Record<string, unknown>) => ({
    ...task,
    task_result: Array.isArray(task.task_result) ? task.task_result[0] : task.task_result
  })) as (Task & { 
    site_service: SiteService & { service_type: ServiceType }
    assigned_engineer: Profile | null
    task_result: TaskResult | null 
  })[]

  // Filter out service types already added to this site
  const availableServiceTypes = serviceTypes.filter(
    (st) => !siteServices.some((ss) => ss.service_type_id === st.id)
  )

  // Damper register: shown when the site has the damper service or any dampers
  const hasDamperService = siteServices.some((ss) => isDamperService(ss.service_type?.name))
  const { data: dampersData } = await supabase
    .from('dampers')
    .select('*')
    .eq('site_id', id)
    .order('reference', { ascending: true })
  const dampers = (dampersData || []) as Damper[]
  const showDamperRegister = hasDamperService || dampers.length > 0

  // MCP register: shown when the site has the fire alarm service or any MCPs
  const hasFireAlarmService = siteServices.some((ss) => isFireAlarmService(ss.service_type?.name))
  const { data: mcpsData } = await supabase
    .from('mcps')
    .select('*, inspections:mcp_inspections(result, inspection_date)')
    .eq('site_id', id)
    .order('map_reference', { ascending: true })
  const mcps = ((mcpsData || []) as (Mcp & { inspections: Pick<McpInspection, 'result' | 'inspection_date'>[] })[]).map(
    (mcp) => {
      const sorted = [...(mcp.inspections || [])].sort((a, b) =>
        b.inspection_date.localeCompare(a.inspection_date),
      )
      const latest = sorted[0]
      return {
        ...mcp,
        latest_result: latest?.result ?? null,
        last_inspected_date: latest?.inspection_date ?? null,
      } as Mcp
    },
  )
  const showMcpRegister = hasFireAlarmService || mcps.length > 0

  // Emergency lighting register: shown when the site has the emergency lighting service or any fittings
  const hasEmergencyLightService = siteServices.some((ss) => isEmergencyLightService(ss.service_type?.name))
  const { data: lightsData } = await supabase
    .from('emergency_lights')
    .select('*, inspections:emergency_light_inspections(result, inspection_date)')
    .eq('site_id', id)
    .order('map_reference', { ascending: true })
  const emergencyLights = (
    (lightsData || []) as (EmergencyLight & {
      inspections: Pick<EmergencyLightInspection, 'result' | 'inspection_date'>[]
    })[]
  ).map((light) => {
    const sorted = [...(light.inspections || [])].sort((a, b) =>
      b.inspection_date.localeCompare(a.inspection_date),
    )
    const latest = sorted[0]
    return {
      ...light,
      latest_result: latest?.result ?? null,
      last_inspected_date: latest?.inspection_date ?? null,
    } as EmergencyLight
  })
  const showEmergencyLightRegister = hasEmergencyLightService || emergencyLights.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/dashboard/sites">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={(site as Site).status === 'dead' ? 'destructive' : 'default'}>
              {(site as Site).status === 'dead' ? 'Dead' : 'Live'}
            </Badge>
            {(site as Site & { route: Route | null }).route && (
              <Badge variant="secondary">
                {(site as Site & { route: Route | null }).route?.name}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Site Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span>{site.address}</span>
            </div>
            {site.contact_name && (
              <div className="text-sm">
                <span className="text-muted-foreground">Contact: </span>
                {site.contact_name}
              </div>
            )}
            {site.contact_phone && (
              <a href={`tel:${site.contact_phone}`} className="flex items-center gap-2 text-sm text-primary">
                <Phone className="h-4 w-4" />
                {site.contact_phone}
              </a>
            )}
            {site.contact_email && (
              <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 text-sm text-primary">
                <Mail className="h-4 w-4" />
                {site.contact_email}
              </a>
            )}
            {(site as Site).reporting_emails && (site as Site).reporting_emails.length > 0 && (
              <div className="text-sm pt-2 border-t">
                <span className="text-muted-foreground block mb-1">Reporting Emails:</span>
                <div className="flex flex-wrap gap-1">
                  {(site as Site).reporting_emails.map((email: string) => (
                    <Badge key={email} variant="outline" className="text-xs">
                      {email}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm pt-2 border-t">
              <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Remote Monitoring: </span>
              {(site as Site).has_remote_monitoring ? (
                <Badge variant="secondary" className="text-xs">
                  {REMOTE_MONITORING_LABELS[(site as Site).remote_monitoring_type ?? 'fire']}
                </Badge>
              ) : (
                <span>None</span>
              )}
            </div>
            {site.notes && (
              <div className="text-sm pt-2 border-t">
                <span className="text-muted-foreground">Notes: </span>
                {site.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <SiteServicesManager
          siteId={id}
          siteServices={siteServices}
          availableServiceTypes={availableServiceTypes}
          engineers={engineers}
          routes={routes}
          tasks={tasks}
          siteStatus={(site as Site).status}
        />
      </div>

      {showDamperRegister && (
        <DamperRegister siteId={id} siteName={site.name} dampers={dampers} />
      )}

      {showMcpRegister && <McpRegister siteId={id} mcps={mcps} />}

      {showEmergencyLightRegister && (
        <EmergencyLightRegister siteId={id} lights={emergencyLights} />
      )}

      <SiteReports
        siteName={site.name}
        siteAddress={site.address}
        completedTasks={completedTasks}
        reportingEmails={(site as Site).reporting_emails || []}
      />
    </div>
  )
}

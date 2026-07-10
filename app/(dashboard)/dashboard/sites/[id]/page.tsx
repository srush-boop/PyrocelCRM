import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArrowLeft, MapPin, Phone, Mail, Building2, Radio, Building, User, ExternalLink } from 'lucide-react'
import { EditSiteButton } from '@/components/dashboard/sites/edit-site-button'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { SiteServicesManager } from '@/components/dashboard/sites/site-services-manager'
import { SiteSystemsManager } from '@/components/dashboard/sites/site-systems-manager'
import { SiteDefaultSubcontractor } from '@/components/dashboard/sites/site-default-subcontractor'
import { QuotesTable } from '@/components/dashboard/sales/quotes-table'
import { SiteAssetsTab, type SiteAsset } from '@/components/dashboard/sites/site-assets-tab'
import { SiteOpenCalls, type OpenCall } from '@/components/dashboard/sites/site-open-calls'
import { SiteCalls, type SiteCall } from '@/components/dashboard/sites/site-calls'
import { SiteLogbook } from '@/components/dashboard/sites/site-logbook'
import { SiteDocuments } from '@/components/dashboard/sites/site-documents'
import { SiteEngineerInfoTab } from '@/components/dashboard/sites/site-engineer-info-tab'
import { getOwnerDocuments } from '@/lib/documents/data'
import { CreateDocumentButton } from '@/components/documents/create-document-dialog'
import { AddRequestButton } from '@/components/dashboard/requests/add-request-button'
import { EntityRequestsCard } from '@/components/dashboard/requests/entity-requests-card'
import type { ReportTimelineItem } from '@/components/logbook/logbook-timeline'
import { DamperRegister } from '@/components/dashboard/dampers/damper-register'
import { McpRegister } from '@/components/dashboard/mcps/mcp-register'
import { EmergencyLightRegister } from '@/components/dashboard/emergency-lights/emergency-light-register'
import { ExtinguisherRegister } from '@/components/dashboard/extinguishers/extinguisher-register'
import { isDamperService } from '@/lib/dampers'
import { isFireAlarmService } from '@/lib/mcps'
import { isEmergencyLightService } from '@/lib/emergency-lights'
import { isExtinguisherService } from '@/lib/extinguishers'
import { REMOTE_MONITORING_LABELS } from '@/lib/sites'
import type {
  Profile,
  Site,
  Client,
  Route,
  Area,
  Subcontractor,
  ServiceType,
  SiteService,
  SiteSystem,
  SystemType,
  PanelFieldDef,
  SystemPanel,
  Task,
  TaskResult,
  Damper,
  Mcp,
  McpInspection,
  EmergencyLight,
  EmergencyLightInspection,
  Extinguisher,
  LogbookEntry,
  SiteBuildingInfo,
  Quote,
  SiteInternalNote,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; editService?: string }>
}

export default async function SiteDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab: tabParam, editService: editServiceParam } = await searchParams
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
      route:routes(*),
      client:clients(*)
    `)
    .eq('id', id)
    .single()

  if (!site) {
    notFound()
  }

  const [siteServicesResult, serviceTypesResult, engineersResult, routesResult, areasResult, subcontractorsResult, clientsResult, siteSystemsResult, systemTypesResult, quotesResult, panelFieldDefsResult] = await Promise.all([
    supabase
      .from('site_services')
      .select(`
        *,
        service_type:service_types(*),
        route:routes(*),
        area:areas(*),
        subcontractor:suppliers!site_services_subcontractor_id_fkey(*),
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
    supabase.from('areas').select('*').order('name'),
    supabase
      .from('suppliers')
      .select('*')
      .eq('supplier_type', 'subcontractor')
      .eq('status', 'active')
      .order('name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('site_systems').select('*').eq('site_id', id).order('position').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase
      .from('quotes')
      .select('*, client:clients(*), site:sites(*)')
      .eq('site_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('panel_field_defs').select('*').eq('active', true).order('position'),
  ])

  const siteServices = (siteServicesResult.data || []) as (SiteService & { service_type: ServiceType })[]
  const serviceTypes = (serviceTypesResult.data || []) as ServiceType[]
  const engineers = (engineersResult.data || []) as Profile[]
  const routes = (routesResult.data || []) as Route[]
  const areas = (areasResult.data || []) as Area[]
  const subcontractorsBase = (subcontractorsResult.data || []) as Subcontractor[]

  // Attach each sub-contractor's provided service types so the assignment UI can
  // filter the list to those that can perform a given service.
  const subServiceLinks =
    subcontractorsBase.length > 0
      ? (
          await supabase
            .from('supplier_services')
            .select('supplier_id, service_type_id')
            .in(
              'supplier_id',
              subcontractorsBase.map((s) => s.id),
            )
        ).data ?? []
      : []
  const serviceIdsBySupplier = new Map<string, string[]>()
  for (const link of subServiceLinks as { supplier_id: string; service_type_id: string }[]) {
    const list = serviceIdsBySupplier.get(link.supplier_id) ?? []
    list.push(link.service_type_id)
    serviceIdsBySupplier.set(link.supplier_id, list)
  }
  const subcontractors = subcontractorsBase.map((s) => ({
    ...s,
    service_type_ids: serviceIdsBySupplier.get(s.id) ?? [],
  }))

  // Per-system default sub-contractor lookup for the assignment cascade.
  const systemDefaultsById: Record<string, string | null> = {}
  for (const sys of (siteSystemsResult.data ?? []) as SiteSystem[]) {
    systemDefaultsById[sys.id] = sys.default_subcontractor_id ?? null
  }
  const clients = (clientsResult.data || []) as Client[]
  const siteSystems = (siteSystemsResult.data || []) as SiteSystem[]
  const systemTypes = (systemTypesResult.data || []) as SystemType[]
  const quotes = (quotesResult.data || []) as Quote[]
  const panelFieldDefs = (panelFieldDefsResult.data || []) as PanelFieldDef[]

  // Panels captured against this site's systems (Fire Alarm etc.). Loaded here
  // so the systems tab can list and edit them per system.
  const siteSystemIds = siteSystems.map((s) => s.id)
  const { data: panelsData } = siteSystemIds.length > 0
    ? await supabase
        .from('system_panels')
        .select('*')
        .in('site_system_id', siteSystemIds)
        .order('position')
    : { data: [] }
  const panels = (panelsData || []) as SystemPanel[]

  // Get tasks for this site's services
  const siteServiceIds = siteServices.map(ss => ss.id)
  const { data: tasksData } = siteServiceIds.length > 0 
    ? await supabase
        .from('tasks')
        .select('*')
        .in('site_service_id', siteServiceIds)
    : { data: [] }
  
  const tasks = (tasksData || []) as Task[]

  // Get completed tasks with their results for reporting. Match both tasks
  // linked via one of this site's services AND ad-hoc/reactive calls booked
  // directly against the site (site_id set, no site_service_id) — otherwise
  // those completed reports never appear in the site's Reports grid.
  const completedFilter =
    siteServiceIds.length > 0
      ? `site_id.eq.${id},site_service_id.in.(${siteServiceIds.join(',')})`
      : `site_id.eq.${id}`
  const { data: completedTasksData } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(*, service_type:service_types(*)),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      task_result:task_results(*)
    `)
    .or(completedFilter)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
  
  const completedTasks = (completedTasksData || []).map((task: Record<string, unknown>) => ({
    ...task,
    task_result: Array.isArray(task.task_result) ? task.task_result[0] : task.task_result
  })) as (Task & { 
    site_service: SiteService & { service_type: ServiceType }
    assigned_engineer: Profile | null
    task_result: TaskResult | null 
  })[]

  // Open calls: anything not yet completed or cancelled. Uses the same site_id
  // OR site_service_id filter as completed tasks so ad-hoc/reactive calls booked
  // directly against the site (no site_service_id) are included too.
  const { data: openCallsData } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(*, service_type:service_types(*)),
      service_type:service_types(id, name),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*)
    `)
    .or(completedFilter)
    .in('status', ['pending', 'in_progress', 'paused'])
    .order('scheduled_date', { ascending: true })

  const openCalls = (openCallsData || []) as OpenCall[]

  // All calls (open + completed) with full joins for the unified Calls tab.
  const { data: allCallsData } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(*, service_type:service_types(*)),
      service_type:service_types(id, name),
      system_type:system_types(id, name),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      task_result:task_results(reference_number, overall_status, email_sent_at),
      call_parts(unit_cost_pence, quantity),
      follow_up_to:tasks!tasks_follow_up_to_id_fkey(id, is_emergency, task_result:task_results(reference_number))
    `)
    .or(completedFilter)
    .order('scheduled_date', { ascending: false })

  const allCalls = ((allCallsData || []) as any[]).map((t) => {
    const followUpToRaw = Array.isArray(t.follow_up_to) ? t.follow_up_to[0] ?? null : t.follow_up_to
    return {
      ...t,
      task_result: Array.isArray(t.task_result) ? t.task_result[0] ?? null : t.task_result,
      follow_up_to: followUpToRaw
        ? {
            ...followUpToRaw,
            task_result: Array.isArray(followUpToRaw.task_result)
              ? followUpToRaw.task_result[0] ?? null
              : followUpToRaw.task_result,
          }
        : null,
    }
  }) as SiteCall[]

  // Unique engineers + service types from all calls for the filter dropdowns.
  const allCallEngineers = Array.from(
    new Map(
      allCalls
        .filter((c) => c.assigned_engineer)
        .map((c) => [c.assigned_engineer!.id, c.assigned_engineer!.full_name || c.assigned_engineer!.email]),
    ).entries(),
  ).map(([id, name]) => ({ id, name: name ?? '' }))

  const allCallServiceTypes = Array.from(
    new Map(
      allCalls
        .map((c) => {
          const id = c.site_service?.service_type?.id ?? c.service_type?.id
          const name = c.site_service?.service_type?.name ?? c.service_type?.name
          return id && name ? [id, name] as [string, string] : null
        })
        .filter((x): x is [string, string] => x !== null),
    ).entries(),
  ).map(([id, name]) => ({ id, name }))

  // Filter out service types already added to this site. Reactive / emergency
  // (non-recurring) call types are excluded here — they aren't recurring
  // services, they're logged ad-hoc via "Book Call".
  const availableServiceTypes = serviceTypes.filter(
    (st) => st.is_recurring !== false && !siteServices.some((ss) => ss.service_type_id === st.id)
  )
  // Reactive / emergency call types available to log against this site.
  const reactiveServiceTypes = serviceTypes.filter(
    (st) => st.is_recurring === false && (st.status || 'live') !== 'dead'
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

  // Extinguisher register: shown when the site has the extinguisher service or any extinguishers
  const hasExtinguisherService = siteServices.some((ss) => isExtinguisherService(ss.service_type?.name))
  const { data: extinguishersData } = await supabase
    .from('extinguishers')
    .select('*')
    .eq('site_id', id)
    .order('reference', { ascending: true })
  const extinguishers = (extinguishersData || []) as Extinguisher[]
  const showExtinguisherRegister = hasExtinguisherService || extinguishers.length > 0

  // Log book: manual entries + professional service reports merged into one timeline.
  const { data: logbookData } = await supabase
    .from('logbook_entries')
    .select('*')
    .eq('site_id', id)
    .order('entry_date', { ascending: false })
  const logbookEntries = (logbookData || []) as LogbookEntry[]

  // General building information (responsible persons, FRA, emergency contacts).
  const { data: buildingInfoData } = await supabase
    .from('site_building_info')
    .select('*')
    .eq('site_id', id)
    .maybeSingle()
  const buildingInfo = (buildingInfoData as SiteBuildingInfo | null) ?? null

  const logbookReports: ReportTimelineItem[] = completedTasks.map((task) => {
    const serviceName = task.site_service?.service_type?.name || 'Service'
    const reportHref = isDamperService(serviceName)
      ? `/dashboard/dampers/report/${task.id}`
      : isExtinguisherService(serviceName)
        ? `/dashboard/extinguishers/report/${task.id}`
        : `/dashboard/reports/${task.id}`
    return {
      id: task.id,
      date: (task.completed_at || task.scheduled_date) as string,
      serviceName,
      engineerName: task.assigned_engineer?.full_name ?? null,
      status: (task.task_result?.overall_status as ReportTimelineItem['status']) ?? null,
      href: reportHref,
    }
  })

  // Documents stored against this site.
  const siteDocuments = await getOwnerDocuments('site', id)
  const canManageDocuments = ['admin', 'office'].includes((profile as Profile).role)

  // Engineer Info tab: shared engineer file store + communal internal notes.
  const engineerDocuments = await getOwnerDocuments('site_engineer', id)
  const { data: internalNotesData } = await supabase
    .from('site_internal_notes')
    .select('*, author:profiles!site_internal_notes_author_id_fkey(id, full_name, role)')
    .eq('site_id', id)
    .order('created_at', { ascending: false })
  const canModerateNotes = ['admin', 'office'].includes((profile as Profile).role)

  // The client this site belongs to (joined above), if any.
  const siteClient = (site as Site & { client: Client | null }).client

  // Asset registers applicable to this site, surfaced under a single "Assets" tab.
  const assetTabs: SiteAsset[] = [
    showDamperRegister && {
      value: 'dampers',
      label: 'Dampers',
      content: <DamperRegister siteId={id} siteName={site.name} dampers={dampers} />,
    },
    showMcpRegister && {
      value: 'fire-alarm',
      label: 'Fire Alarm',
      content: <McpRegister siteId={id} mcps={mcps} />,
    },
    showEmergencyLightRegister && {
      value: 'emergency-lighting',
      label: 'Emergency Lighting',
      content: <EmergencyLightRegister siteId={id} lights={emergencyLights} />,
    },
    showExtinguisherRegister && {
      value: 'extinguishers',
      label: 'Extinguishers',
      content: <ExtinguisherRegister siteId={id} siteName={site.name} extinguishers={extinguishers} />,
    },
  ].filter(Boolean) as SiteAsset[]

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
        <div className="flex items-center gap-2">
          {reactiveServiceTypes.length > 0 && (
            <CreateTaskDialog
              siteServices={[]}
              engineers={engineers}
              clients={clients}
              reactiveServiceTypes={reactiveServiceTypes}
              sites={[site as Site]}
              systemTypes={systemTypes}
              defaultSiteId={id}
              defaultMode="reactive"
            />
          )}
          <AddRequestButton
            entityType="site"
            entityId={id}
            context={{
              siteId: id,
              clientId: (site as Site).client_id ?? null,
              label: site.name,
            }}
            revalidate={`/dashboard/sites/${id}`}
          />
          {canManageDocuments && (
            <CreateDocumentButton
              ownerType="site"
              ownerId={id}
              entityLabel={site.name}
              revalidatePath={`/dashboard/sites/${id}`}
            />
          )}
          <EditSiteButton site={site as Site & { route: Route | null }} clients={clients} />
        </div>
      </div>

      <EntityRequestsCard entityType="site" entityId={id} />

      <Tabs
        key={editServiceParam ? `edit-${editServiceParam}` : tabParam ?? 'overview'}
        defaultValue={editServiceParam ? 'overview' : tabParam ?? 'overview'}
        className="gap-6"
      >
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview" className="flex-none">Overview</TabsTrigger>
          <TabsTrigger value="calls" className="flex-none">
            Calls
            {allCalls.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {allCalls.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="systems" className="flex-none">Systems</TabsTrigger>
          {assetTabs.length > 0 && (
            <TabsTrigger value="assets" className="flex-none">Assets</TabsTrigger>
          )}
          <TabsTrigger value="quotes" className="flex-none">Quotes</TabsTrigger>
          <TabsTrigger value="logbook" className="flex-none">Log Book</TabsTrigger>
          <TabsTrigger value="documents" className="flex-none">Documents</TabsTrigger>
          <TabsTrigger value="engineer-info" className="flex-none">Engineer Info</TabsTrigger>

        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
        {siteClient && (
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Client
              </CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/clients?client=${siteClient.id}`}>
                  View client
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm font-medium">{siteClient.name}</div>
              <div className="grid gap-2 sm:col-start-1">
                {siteClient.contact_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{siteClient.contact_name}</span>
                  </div>
                )}
                {siteClient.contact_phone && (
                  <a
                    href={`tel:${siteClient.contact_phone}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    {siteClient.contact_phone}
                  </a>
                )}
                {siteClient.contact_email && (
                  <a
                    href={`mailto:${siteClient.contact_email}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-4 w-4" />
                    {siteClient.contact_email}
                  </a>
                )}
              </div>
              {siteClient.address && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground sm:row-start-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{siteClient.address}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
            {(site as Site).uprn && (
              <div className="text-sm">
                <span className="text-muted-foreground">UPRN: </span>
                {(site as Site).uprn}
              </div>
            )}
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
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
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
              {(site as Site).has_remote_monitoring &&
                ((site as Site).monitoring_station_name ||
                  (site as Site).monitoring_station_phone ||
                  (site as Site).monitoring_station_url) && (
                  <div className="mt-2 ml-6 grid gap-1 text-sm">
                    {(site as Site).monitoring_station_name && (
                      <div>
                        <span className="text-muted-foreground">Station: </span>
                        {(site as Site).monitoring_station_name}
                      </div>
                    )}
                    {(site as Site).monitoring_station_phone && (
                      <div>
                        <span className="text-muted-foreground">Phone: </span>
                        <a
                          href={`tel:${(site as Site).monitoring_station_phone}`}
                          className="text-primary hover:underline"
                        >
                          {(site as Site).monitoring_station_phone}
                        </a>
                      </div>
                    )}
                    {(site as Site).monitoring_station_url && (
                      <div className="truncate">
                        <span className="text-muted-foreground">Portal: </span>
                        <a
                          href={(site as Site).monitoring_station_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {(site as Site).monitoring_station_url}
                        </a>
                      </div>
                    )}
                  </div>
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

                <SiteDefaultSubcontractor
                  siteId={id}
                  defaultSubcontractorId={(site as Site).default_subcontractor_id}
                  subcontractors={subcontractors}
                />

                <SiteServicesManager
                  siteId={id}
                  initialEditServiceId={editServiceParam}
          siteServices={siteServices}
          availableServiceTypes={availableServiceTypes}
          engineers={engineers}
          routes={routes}
          areas={areas}
                  subcontractors={subcontractors}
                  tasks={tasks}
                  siteStatus={(site as Site).status}
                  siteDefaultSubcontractorId={(site as Site).default_subcontractor_id}
                  systemDefaultsById={systemDefaultsById}
                />
          </div>
        </TabsContent>

        <TabsContent value="calls" className="mt-0">
          <SiteCalls
            calls={allCalls}
            engineers={allCallEngineers}
            serviceTypes={allCallServiceTypes}
            reportingEmails={(site as Site).reporting_emails || []}
          />
        </TabsContent>

        <TabsContent value="systems" className="mt-0">
              <SiteSystemsManager
                siteId={id}
                siteSystems={siteSystems}
                siteServices={siteServices}
                systemTypes={systemTypes}
                availableServiceTypes={availableServiceTypes}
                  siteStatus={(site as Site).status}
                  panelFieldDefs={panelFieldDefs}
                  panels={panels}
                  subcontractors={subcontractors}
                  site={site as Site}
                  engineers={engineers}
          clients={clients}
          reactiveServiceTypes={reactiveServiceTypes}
          siteFlagDefaults={{
            booking_required: Boolean((site as Site).booking_required),
            access_required: Boolean((site as Site).access_required),
            keys_required: Boolean((site as Site).keys_required),
            two_engineers_required: Boolean((site as Site).two_engineers_required),
          }}
          />
        </TabsContent>

        <TabsContent value="quotes" className="mt-0">
          <QuotesTable quotes={quotes} newQuoteHref={`/dashboard/sales/new?site=${id}`} />
        </TabsContent>

        {assetTabs.length > 0 && (
          <TabsContent value="assets" className="mt-0">
            <SiteAssetsTab assets={assetTabs} />
          </TabsContent>
        )}

        <TabsContent value="logbook" className="mt-0">
          <SiteLogbook
            siteId={id}
            siteName={site.name}
            siteAddress={site.address}
            postcode={(site as Site).postcode}
                reports={logbookReports}
                entries={logbookEntries}
                buildingInfo={buildingInfo}
              />
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <SiteDocuments
            siteId={id}
            folders={siteDocuments.folders}
            files={siteDocuments.files}
            canManage={canManageDocuments}
          />
        </TabsContent>

        <TabsContent value="engineer-info" className="mt-0">
          <SiteEngineerInfoTab
            site={site as Site}
            notes={(internalNotesData || []) as SiteInternalNote[]}
            engineerFolders={engineerDocuments.folders}
            engineerFiles={engineerDocuments.files}
            currentUserId={user.id}
            canModerateNotes={canModerateNotes}
          />
        </TabsContent>


      </Tabs>
    </div>
  )
}

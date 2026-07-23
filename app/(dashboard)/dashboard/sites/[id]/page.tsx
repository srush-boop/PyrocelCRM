import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DeferredMount } from '@/components/ui/deferred-mount'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, MapPin, Phone, Mail, Building2, Radio, Building, User, ExternalLink } from 'lucide-react'
import { EditSiteButton } from '@/components/dashboard/sites/edit-site-button'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import { SiteServicesManager } from '@/components/dashboard/sites/site-services-manager'
import { SiteBillingCard } from '@/components/dashboard/billing/site-billing-card'
import { getRateCards } from '@/lib/actions/rate-cards'
import { SitePosCard } from '@/components/dashboard/billing/site-pos-card'
import { SiteSystemsManager } from '@/components/dashboard/sites/site-systems-manager'
import { QuotesTable } from '@/components/dashboard/sales/quotes-table'
import { SiteAssetsTab, type SiteAsset } from '@/components/dashboard/sites/site-assets-tab'
import { SiteCalls, type SiteCall } from '@/components/dashboard/sites/site-calls'
import {
  SiteCallsOverviewCard,
  type UpcomingVisit,
} from '@/components/dashboard/sites/site-calls-overview-card'
import { SiteLogbook } from '@/components/dashboard/sites/site-logbook'
import { SiteDocuments } from '@/components/dashboard/sites/site-documents'
import { SiteEngineerInfoTab } from '@/components/dashboard/sites/site-engineer-info-tab'
import { getAllDocumentTags, getOwnerDocuments } from '@/lib/documents/data'
import { forecastCalls } from '@/lib/forecast'
import { toDateString } from '@/lib/scheduling'
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
import { annualRevenuePence } from '@/lib/billing/projected-revenue'
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
  RemMonFieldDef,
  RemMonLinkDef,
  RemMonEntry,
  ServiceVisitType,
  PanelVisitAssignment,
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
  BillingAccount,
  RecurringCharge,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    editService?: string
    chargeService?: string
    bookService?: string
    deleteService?: string
  }>
}

export default async function SiteDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const {
    tab: tabParam,
    editService: editServiceParam,
    chargeService: chargeServiceParam,
    bookService: bookServiceParam,
    deleteService: deleteServiceParam,
  } = await searchParams
  // Any service dialog param means the (dialogsOnly) services manager on the
  // Systems tab should be visible, so force that tab open.
  const serviceDialogParam =
    editServiceParam || chargeServiceParam || bookServiceParam || deleteServiceParam
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

  // Who set the site up (small print on the overview). Separate query to avoid
  // FK-embed ambiguity; null for legacy/system-created sites.
  let createdByName: string | null = null
  if ((site as Site).created_by) {
    const { data: creator } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', (site as Site).created_by as string)
      .single()
    createdByName = creator?.full_name || creator?.email || null
  }

  const [siteServicesResult, serviceTypesResult, engineersResult, routesResult, areasResult, subcontractorsResult, clientsResult, siteSystemsResult, systemTypesResult, quotesResult, panelFieldDefsResult, remMonFieldDefsResult, remMonLinkDefsResult] = await Promise.all([
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
    supabase.from('rem_mon_field_defs').select('*').eq('active', true).order('position'),
    supabase.from('rem_mon_link_defs').select('*').eq('active', true).order('position'),
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

  // Annualised recurring value (run-rate £/yr, in pence) per site_service, from
  // this site's active recurring charges. Shown on the Systems tab at service,
  // system and site level. Only charges tied to a specific service count.
  const serviceIds = siteServices.map((s) => s.id)
  const { data: recurringChargesData } = serviceIds.length > 0
    ? await supabase
        .from('recurring_charges')
        .select('site_service_id, unit_price_pence, quantity, frequency, active')
        .eq('active', true)
        .in('site_service_id', serviceIds)
    : { data: [] }
  const annualValueByServiceId: Record<string, number> = {}
  for (const charge of (recurringChargesData ?? []) as Pick<
    RecurringCharge,
    'site_service_id' | 'unit_price_pence' | 'quantity' | 'frequency'
  >[]) {
    if (!charge.site_service_id) continue
    const value = annualRevenuePence({
      frequency: charge.frequency,
      unitPricePence: charge.unit_price_pence,
      quantity: charge.quantity,
      isSubcontracted: false,
      subcontractPricePence: null,
      branchId: null,
      branchName: null,
      serviceTypeId: null,
      serviceTypeName: null,
      systemTypeId: null,
      systemTypeName: null,
    })
    annualValueByServiceId[charge.site_service_id] =
      (annualValueByServiceId[charge.site_service_id] ?? 0) + value
  }

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

  // Remote Monitoring entries captured against this site's REM-MON system(s).
  const { data: remMonEntriesData } = siteSystemIds.length > 0
    ? await supabase
        .from('rem_mon_entries')
        .select('*')
        .in('site_system_id', siteSystemIds)
        .order('position')
    : { data: [] }
  const remMonEntries = (remMonEntriesData || []) as RemMonEntry[]
  const remMonFieldDefs = (remMonFieldDefsResult.data || []) as RemMonFieldDef[]
  const remMonLinkDefs = (remMonLinkDefsResult.data || []) as RemMonLinkDef[]

  // Panel-level visit rotation data: the visit types (Annual/Periodic/…) for the
  // service types used on this site, plus any saved panel→visit assignments. Both
  // feed the rotation grid in the panels manager.
  const siteServiceTypeIds = Array.from(
    new Set(siteServices.map((ss) => ss.service_type_id).filter(Boolean)),
  ) as string[]
  const { data: visitTypesData } = siteServiceTypeIds.length > 0
    ? await supabase
        .from('service_visit_types')
        .select('*')
        .in('service_type_id', siteServiceTypeIds)
        .order('sort_order')
    : { data: [] }
  const serviceVisitTypes = (visitTypesData || []) as ServiceVisitType[]

  const { data: panelAssignmentsData } = siteSystemIds.length > 0
    ? await supabase
        .from('panel_visit_assignments')
        .select('*')
        .in('site_system_id', siteSystemIds)
    : { data: [] }
  const panelAssignments = (panelAssignmentsData || []) as PanelVisitAssignment[]

  // ALL billing accounts (across every client), used by the Billing card to
  // show/override which account each service is billed to. Sites can be billed
  // to another client's account (e.g. a central "Pyrocel" entity), so we don't
  // filter by the site's own client here — the client name is embedded for the
  // dropdown, and the client default is resolved by client_id in the card.
  const siteClientId = (site as Site).client_id

  // Get tasks for this site's services
  const siteServiceIds = siteServices.map(ss => ss.id)

  // Match both tasks linked via one of this site's services AND ad-hoc/reactive
  // calls booked directly against the site (site_id set, no site_service_id) —
  // otherwise those completed reports never appear in the site's Reports grid.
  const completedFilter =
    siteServiceIds.length > 0
      ? `site_id.eq.${id},site_service_id.in.(${siteServiceIds.join(',')})`
      : `site_id.eq.${id}`

  // Billing accounts (all clients), rate cards, this site's tasks, completed
  // reports and the full calls list are independent of one another, so run them
  // concurrently in a single wave rather than five sequential round-trips.
  const [billingAccountsResult, rateCards, tasksResult, completedTasksResult, allCallsResult] =
    await Promise.all([
      supabase
        .from('billing_accounts')
        .select('*, client:clients(id, name)')
        .order('name', { ascending: true }),
      getRateCards(),
      siteServiceIds.length > 0
        ? supabase.from('tasks').select('*').in('site_service_id', siteServiceIds)
        : Promise.resolve({ data: [] as Task[] }),
      supabase
        .from('tasks')
        .select(`
          *,
          site_service:site_services(*, service_type:service_types(*)),
          assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
          task_result:task_results(*)
        `)
        .or(completedFilter)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false }),
      supabase
        .from('tasks')
        .select(`
          *,
          site_service:site_services(*, service_type:service_types(*, system_type:system_types(id, name, code, color))),
          service_type:service_types(id, name, system_type:system_types(id, name, code, color)),
          system_type:system_types(id, name, code, color),
          assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
          task_result:task_results(reference_number, overall_status, email_sent_at),
          call_parts(unit_cost_pence, quantity),
          follow_up_to:tasks!follow_up_to_id(id, is_emergency, task_result:task_results(reference_number))
        `)
        .or(completedFilter)
        .order('scheduled_date', { ascending: false }),
    ])

  // ALL billing accounts (across every client), used by the Billing card to
  // show/override which account each service is billed to. Sites can be billed
  // to another client's account (e.g. a central "Pyrocel" entity), so we don't
  // filter by the site's own client here — the client name is embedded for the
  // dropdown, and the client default is resolved by client_id in the card.
  const billingAccounts = (billingAccountsResult.data || []) as (BillingAccount & {
    client?: { id: string; name: string } | null
  })[]

  const tasks = (tasksResult.data || []) as Task[]

  const completedTasksData = completedTasksResult.data
  const completedTasks = (completedTasksData || []).map((task: Record<string, unknown>) => ({
    ...task,
    task_result: Array.isArray(task.task_result) ? task.task_result[0] : task.task_result
  })) as (Task & { 
    site_service: SiteService & { service_type: ServiceType }
    assigned_engineer: Profile | null
    task_result: TaskResult | null 
  })[]

  // All calls (open + completed) with full joins for the unified Calls tab.
  const { data: allCallsData } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(*, service_type:service_types(*, system_type:system_types(id, name, code, color))),
      service_type:service_types(id, name, system_type:system_types(id, name, code, color)),
      system_type:system_types(id, name, code, color),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      task_result:task_results(reference_number, overall_status, email_sent_at),
      call_parts(unit_cost_pence, quantity),
      follow_up_to:tasks!follow_up_to_id(id, is_emergency, task_result:task_results(reference_number))
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

  // ─── Overview "Calls" tile ────────────────────────────────────────────────
  // Open calls: any active work (pending / in progress / paused).
  const OPEN_CALL_STATUSES = ['pending', 'in_progress', 'paused']
  const openCallsCount = allCalls.filter((c) => OPEN_CALL_STATUSES.includes(c.status)).length

  // Awaiting PO: chargeable, not-yet-invoiced calls that have an outstanding
  // (un-authorised) PO request logged — i.e. we have asked the client for a PO
  // number and are still waiting on it.
  const chargeableOpenTaskIds = allCalls
    .filter((c) => c.chargeable && !c.charge_invoiced_at)
    .map((c) => c.id)
  const { data: openPoReqs } = chargeableOpenTaskIds.length > 0
    ? await supabase
        .from('po_requests')
        .select('task_id')
        .is('authorised_at', null)
        .in('task_id', chargeableOpenTaskIds)
    : { data: [] }
  const awaitingPoCount = new Set(
    ((openPoReqs || []) as { task_id: string }[]).map((r) => r.task_id),
  ).size

  // Service calls expected in the next 6 months. This projects each recurring
  // service's cadence — so calls that are DUE TO BE GENERATED (but whose task
  // row doesn't exist yet) still appear as "forecast", alongside already-created
  // calls that can be booked inline.
  const overviewToday = new Date()
  overviewToday.setHours(0, 0, 0, 0)
  const overviewHorizon = new Date(overviewToday)
  overviewHorizon.setMonth(overviewHorizon.getMonth() + 6)
  const forecastRows = await forecastCalls(
    toDateString(overviewToday),
    toDateString(overviewHorizon),
    { siteId: id },
  )
  // Group by service (site-service + visit type) so each service appears once,
  // represented by its soonest occurrence. Any further occurrences within the
  // window are collapsed into an `otherDates` note. Groups are ordered by their
  // soonest date so the most imminent calls are prioritised at the top.
  const forecastGroups = new Map<string, typeof forecastRows>()
  for (const r of forecastRows) {
    const gk = `${r.siteServiceId}|${r.visitTypeId ?? 'none'}`
    const arr = forecastGroups.get(gk)
    if (arr) arr.push(r)
    else forecastGroups.set(gk, [r])
  }
  const upcomingVisits: UpcomingVisit[] = Array.from(forecastGroups.values())
    .map((group) => group.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)))
    .sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : 0))
    .map((group) => {
      const r = group[0]
      const isWeeklyRecurring = r.frequencyUnit === 'weeks' && r.frequencyValue === 1
      const serviceName = r.visitName
        ? `${r.serviceTypeName} · ${r.visitName}`
        : r.serviceTypeName
      // High-frequency cadences (weekly / monthly) produce many occurrences in the
      // 6-month window, so summarise as "N visits · <frequency>" instead of listing
      // every date. Lower frequencies keep the individual-date `otherDates` note.
      const isWeekly = r.frequencyUnit === 'weeks' && r.frequencyValue === 1
      const isMonthly = r.frequencyUnit === 'months' && r.frequencyValue === 1
      const frequencyLabel = isWeekly ? 'Weekly' : isMonthly ? 'Monthly' : null
      return {
        key: r.taskId ?? `${r.siteServiceId}|${r.visitTypeId ?? 'none'}|${r.date}`,
        taskId: r.taskId,
        status: r.status,
        serviceName,
        systemName: r.systemTypeName,
        systemColor: r.systemColor,
        systemCode: r.systemCode,
        scheduledDate: r.date,
        bookedStartTime: r.bookedStartTime,
        bookedEndTime: r.bookedEndTime,
        isWeeklyRecurring,
        otherDates: frequencyLabel ? [] : group.slice(1).map((o) => o.date),
        frequencyLabel,
        visitCount: group.length,
      }
    })

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

  // Asset registers + log book + building info are all independent of each
  // other and only keyed on this site, so fetch them concurrently in a single
  // round-trip wave instead of six sequential queries.
  const hasDamperService = siteServices.some((ss) => isDamperService(ss.service_type?.name))
  const hasFireAlarmService = siteServices.some((ss) => isFireAlarmService(ss.service_type?.name))
  const hasEmergencyLightService = siteServices.some((ss) => isEmergencyLightService(ss.service_type?.name))
  const hasExtinguisherService = siteServices.some((ss) => isExtinguisherService(ss.service_type?.name))

  const [
    dampersResult,
    mcpsResult,
    lightsResult,
    extinguishersResult,
    logbookResult,
    buildingInfoResult,
  ] = await Promise.all([
    supabase.from('dampers').select('*').eq('site_id', id).order('reference', { ascending: true }),
    supabase
      .from('mcps')
      .select('*, inspections:mcp_inspections(result, inspection_date)')
      .eq('site_id', id)
      .order('map_reference', { ascending: true }),
    supabase
      .from('emergency_lights')
      .select('*, inspections:emergency_light_inspections(result, inspection_date)')
      .eq('site_id', id)
      .order('map_reference', { ascending: true }),
    supabase.from('extinguishers').select('*').eq('site_id', id).order('reference', { ascending: true }),
    supabase.from('logbook_entries').select('*').eq('site_id', id).order('entry_date', { ascending: false }),
    supabase.from('site_building_info').select('*').eq('site_id', id).maybeSingle(),
  ])

  // Damper register: shown when the site has the damper service or any dampers
  const dampers = (dampersResult.data || []) as Damper[]
  const showDamperRegister = hasDamperService || dampers.length > 0

  // MCP register: shown when the site has the fire alarm service or any MCPs
  const mcps = ((mcpsResult.data || []) as (Mcp & { inspections: Pick<McpInspection, 'result' | 'inspection_date'>[] })[]).map(
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
  const emergencyLights = (
    (lightsResult.data || []) as (EmergencyLight & {
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
  const extinguishers = (extinguishersResult.data || []) as Extinguisher[]
  const showExtinguisherRegister = hasExtinguisherService || extinguishers.length > 0

  // Log book: manual entries + professional service reports merged into one timeline.
  const logbookEntries = (logbookResult.data || []) as LogbookEntry[]

  // General building information (responsible persons, FRA, emergency contacts).
  const buildingInfo = (buildingInfoResult.data as SiteBuildingInfo | null) ?? null

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

  // Documents (site + engineer stores), the shared tag vocabulary, and the
  // engineer-info internal notes are mutually independent — fetch concurrently.
  const [siteDocuments, allDocumentTags, engineerDocuments, internalNotesResult] =
    await Promise.all([
      getOwnerDocuments('site', id),
      getAllDocumentTags(),
      getOwnerDocuments('site_engineer', id),
      supabase
        .from('site_internal_notes')
        .select('*, author:profiles!site_internal_notes_author_id_fkey(id, full_name, role)')
        .eq('site_id', id)
        .order('created_at', { ascending: false }),
    ])
  const internalNotesData = internalNotesResult.data
  const canManageDocuments = ['admin', 'office'].includes((profile as Profile).role)
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
          <EditSiteButton
            site={site as Site & { route: Route | null }}
            clients={clients}
            systemTypes={systemTypes}
          />
        </div>
      </div>

      <EntityRequestsCard entityType="site" entityId={id} />

      <Tabs
        key={serviceDialogParam ? `svc-${serviceDialogParam}` : tabParam ?? 'overview'}
        defaultValue={serviceDialogParam ? 'systems' : tabParam ?? 'overview'}
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
        {siteClient && (
          <Card>
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
        <div className="md:col-span-2">
          <SiteCallsOverviewCard
            siteId={id}
            openCallsCount={openCallsCount}
            awaitingPoCount={awaitingPoCount}
            upcomingVisits={upcomingVisits}
          />
        </div>
        {siteClientId && (
          <SiteBillingCard
            siteId={id}
            clientId={siteClientId}
            siteBillingAccountId={(site as Site).billing_account_id ?? null}
            services={siteServices.map((ss) => ({
              id: ss.id,
              name: ss.service_type?.name ?? 'Service',
              billing_account_id: ss.billing_account_id ?? null,
              rate_card_id: ss.rate_card_id ?? null,
            }))}
            accounts={billingAccounts}
            rateCards={rateCards}
            siteRateCardId={(site as Site).rate_card_id ?? null}
          />
        )}
        <SitePosCard
          siteId={id}
          sitePo={(site as Site).po_number ?? null}
          clientPo={(site as { client?: { po_number?: string | null } }).client?.po_number ?? null}
          systems={siteSystems.map((sys) => ({
            id: sys.id,
            name: sys.name || sys.system_type?.name || 'System',
            po_number: sys.po_number ?? null,
          }))}
          services={siteServices.map((ss) => ({
            id: ss.id,
            name: ss.service_type?.name ?? 'Service',
            siteSystemId: ss.site_system_id ?? null,
            po_number: ss.po_number ?? null,
          }))}
        />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Site set up
            {createdByName ? ` by ${createdByName}` : ''}
            {site.created_at
              ? ` on ${new Date(site.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}`
              : ''}
          </p>
        </TabsContent>

        <TabsContent value="calls" className="mt-0">
          <SiteCalls
            calls={allCalls}
            engineers={allCallEngineers}
            serviceTypes={allCallServiceTypes}
            reportingEmails={(site as Site).reporting_emails || []}
          />
        </TabsContent>

        <TabsContent value="systems" className="mt-0 space-y-4">
              <DeferredMount
                fallback={
                  <div className="space-y-4" aria-hidden="true">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                }
              >
              <SiteSystemsManager
                siteId={id}
                siteSystems={siteSystems}
                siteServices={siteServices}
                systemTypes={systemTypes}
                availableServiceTypes={availableServiceTypes}
                  siteStatus={(site as Site).status}
                  panelFieldDefs={panelFieldDefs}
                  panels={panels}
                  remMonFieldDefs={remMonFieldDefs}
                  remMonLinkDefs={remMonLinkDefs}
                  remMonEntries={remMonEntries}
                  serviceVisitTypes={serviceVisitTypes}
                  panelAssignments={panelAssignments}
                  subcontractors={subcontractors}
                  site={site as Site}
                  engineers={engineers}
          clients={clients}
          reactiveServiceTypes={reactiveServiceTypes}
          annualValueByServiceId={annualValueByServiceId}
          siteFlagDefaults={{
            booking_required: Boolean((site as Site).booking_required),
            access_required: Boolean((site as Site).access_required),
            keys_required: Boolean((site as Site).keys_required),
            two_engineers_required: Boolean((site as Site).two_engineers_required),
          }}
          />
              </DeferredMount>
          {/* Dialogs-only mount: the Systems service rows drive setup / charge /
              book / delete dialogs via URL params (editService, chargeService,
              bookService, deleteService). No visible list is rendered here. */}
          <SiteServicesManager
            dialogsOnly
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
                  systemDefaultsById={systemDefaultsById}
                  annualValueByServiceId={annualValueByServiceId}
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
            allTags={allDocumentTags}
            usedTags={siteDocuments.usedTags}
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
            allTags={allDocumentTags}
            usedTags={engineerDocuments.usedTags}
          />
        </TabsContent>


      </Tabs>
    </div>
  )
}

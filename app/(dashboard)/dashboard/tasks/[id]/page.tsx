import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TaskExecution } from '@/components/dashboard/tasks/task-execution'
import { DamperTaskExecution } from '@/components/dashboard/dampers/damper-task-execution'
import { McpTaskExecution } from '@/components/dashboard/mcps/mcp-task-execution'
import { EmergencyLightTaskExecution } from '@/components/dashboard/emergency-lights/emergency-light-task-execution'
import { ExtinguisherTaskExecution } from '@/components/dashboard/extinguishers/extinguisher-task-execution'
import { isDamperService } from '@/lib/dampers'
import { isFireAlarmService } from '@/lib/mcps'
import { isEmergencyLightService } from '@/lib/emergency-lights'
import { isExtinguisherService } from '@/lib/extinguishers'
import { PreAttendancePanel } from '@/components/dashboard/site-info/pre-attendance-panel'
import { resolveSiteFlags } from '@/lib/site-flags'
import type { DocumentFile, DocumentFolder, SiteInternalNote } from '@/lib/types/database'
import type {
  Profile,
  TaskWithDetails,
  ChecklistTemplate,
  ClientChecklistItem,
  ClientLink,
  Damper,
  DamperInspection,
  Mcp,
  McpInspection,
  EmergencyLight,
  EmergencyLightInspection,
  Extinguisher,
  ExtinguisherInspection,
  SystemPanel,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TaskPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Fetch task with all related data
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(
        *,
        site:sites(*, client:clients(id, name)),
        service_type:service_types(*, system_type:system_types(*))
      ),
      assigned_engineer:profiles(*),
      visit_type:service_visit_types(*),
      client:clients(id, name)
    `)
    .eq('id', id)
    .single()

  if (!task) {
    notFound()
  }

  // Check if engineer can access this task
  if ((profile as Profile).role === 'engineer' && task.assigned_engineer_id !== user.id) {
    redirect('/dashboard')
  }

  // Shared pre-attendance info (flags, communal notes, engineer file store) shown
  // at the top of every task flow regardless of service type. Viewing this never
  // changes the task status — starting the job is a separate explicit action.
  const preAttendanceSiteId: string | null =
    task.site_service?.site?.id ?? task.site_service?.site_id ?? null
  const role = (profile as Profile).role
  const canModerateNotes = role === 'admin' || role === 'office'

  let preAttendancePanel: ReactNode = null
  if (preAttendanceSiteId) {
    const [{ data: notesData }, { data: engFolders }, { data: engFiles }] = await Promise.all([
      supabase
        .from('site_internal_notes')
        .select('*, author:profiles!site_internal_notes_author_id_fkey(id, full_name, role)')
        .eq('site_id', preAttendanceSiteId)
        .order('created_at', { ascending: false }),
      supabase
        .from('document_folders')
        .select('*')
        .eq('owner_type', 'site_engineer')
        .eq('owner_id', preAttendanceSiteId),
      supabase
        .from('documents')
        .select('*')
        .eq('owner_type', 'site_engineer')
        .eq('owner_id', preAttendanceSiteId)
        .order('created_at', { ascending: false }),
    ])

    const flags = resolveSiteFlags(task.site_service?.site, task.site_service)

    preAttendancePanel = (
      <PreAttendancePanel
        siteId={preAttendanceSiteId}
        flags={flags}
        notes={(notesData || []) as SiteInternalNote[]}
        engineerFolders={(engFolders || []) as DocumentFolder[]}
        engineerFiles={(engFiles || []) as DocumentFile[]}
        currentUserId={user.id}
        canModerateNotes={canModerateNotes}
        isFireAlarm={isFireAlarmService(task.site_service?.service_type?.name)}
      />
    )
  }

  // Wraps a service-specific execution flow with the shared pre-attendance panel.
  const withPanel = (node: ReactNode) => (
    <div className="space-y-6">
      {preAttendancePanel && (
        <div className="mx-auto max-w-3xl">{preAttendancePanel}</div>
      )}
      {node}
    </div>
  )

  // Damper inspection tasks use a dedicated per-asset flow
  if (isDamperService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: dampersData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('dampers').select('*').eq('site_id', siteId).order('reference', { ascending: true }),
      supabase.from('damper_inspections').select('*').eq('task_id', id),
    ])

    return withPanel(
      <DamperTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        dampers={(dampersData || []) as Damper[]}
        existingInspections={(inspectionsData || []) as DamperInspection[]}
      />,
    )
  }

  // Fire extinguisher servicing tasks use a dedicated per-asset flow
  if (isExtinguisherService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: extinguishersData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('extinguishers').select('*').eq('site_id', siteId).order('reference', { ascending: true }),
      supabase.from('extinguisher_inspections').select('*').eq('task_id', id),
    ])

    return withPanel(
      <ExtinguisherTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        extinguishers={(extinguishersData || []) as Extinguisher[]}
        existingInspections={(inspectionsData || []) as ExtinguisherInspection[]}
      />,
    )
  }

  // Weekly fire alarm tasks use a dedicated per-call-point flow
  if (isFireAlarmService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: mcpsData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('mcps').select('*').eq('site_id', siteId).order('map_reference', { ascending: true }),
      supabase.from('mcp_inspections').select('*').eq('task_id', id),
    ])

    // Surface the Nimbus monitoring URL to the engineer. Prefer the system this
    // service is attached to, falling back to any fire alarm system on the site
    // that has a Nimbus link configured.
    let nimbusUrl: string | null = null
    const linkedSystemId = task.site_service?.site_system_id
    if (linkedSystemId) {
      const { data: linkedSystem } = await supabase
        .from('site_systems')
        .select('nimbus_url')
        .eq('id', linkedSystemId)
        .maybeSingle()
      nimbusUrl = linkedSystem?.nimbus_url ?? null
    }
    if (!nimbusUrl && siteId) {
      const { data: anySystem } = await supabase
        .from('site_systems')
        .select('nimbus_url')
        .eq('site_id', siteId)
        .not('nimbus_url', 'is', null)
        .limit(1)
        .maybeSingle()
      nimbusUrl = anySystem?.nimbus_url ?? null
    }

    // The weekly test rotates through call points: find the most recently
    // tested MCP from any *previous* task so we can point the engineer at the
    // next one in the list.
    const mcpIds = (mcpsData || []).map((m) => m.id)
    let lastTestedMcpId: string | null = null
    let lastTestedDate: string | null = null
    if (mcpIds.length > 0) {
      const { data: priorInspection } = await supabase
        .from('mcp_inspections')
        .select('mcp_id, inspection_date')
        .in('mcp_id', mcpIds)
        .neq('task_id', id)
        .order('inspection_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      lastTestedMcpId = priorInspection?.mcp_id ?? null
      lastTestedDate = priorInspection?.inspection_date ?? null
    }

    return withPanel(
      <McpTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        mcps={(mcpsData || []) as Mcp[]}
        existingInspections={(inspectionsData || []) as McpInspection[]}
        lastTestedMcpId={lastTestedMcpId}
        lastTestedDate={lastTestedDate}
        nimbusUrl={nimbusUrl}
      />,
    )
  }

  // Emergency lighting tasks use a dedicated per-fitting checklist flow
  if (isEmergencyLightService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: lightsData }, { data: inspectionsData }] = await Promise.all([
      supabase
        .from('emergency_lights')
        .select('*')
        .eq('site_id', siteId)
        .order('map_reference', { ascending: true }),
      supabase.from('emergency_light_inspections').select('*').eq('task_id', id),
    ])

    return withPanel(
      <EmergencyLightTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        lights={(lightsData || []) as EmergencyLight[]}
        existingInspections={(inspectionsData || []) as EmergencyLightInspection[]}
      />,
    )
  }

  // Fetch the checklist template for this service type. For multi-visit
  // services each visit type can have its own checklist; prefer the one matching
  // this task's visit type and fall back to the service-wide template (the one
  // with no visit_type_id) when the visit has no specific checklist.
  const { data: checklistTemplates } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('service_type_id', task.site_service.service_type_id)

  const templates = (checklistTemplates || []) as ChecklistTemplate[]
  let checklistTemplate =
    (task.visit_type_id
      ? templates.find((t) => t.visit_type_id === task.visit_type_id)
      : undefined) ??
    templates.find((t) => !t.visit_type_id) ??
    templates[0] ??
    null

  // Append any client-specific checklist items that match this task's system
  // type and service type. Items with an empty scope array apply to all.
  const clientId = task.site_service?.site?.client_id
  let clientLinks: ClientLink[] = []
  if (clientId) {
    // The system type comes from the system this service is attached to.
    let systemTypeId: string | null = null
    if (task.site_service?.site_system_id) {
      const { data: linkedSystem } = await supabase
        .from('site_systems')
        .select('system_type_id')
        .eq('id', task.site_service.site_system_id)
        .maybeSingle()
      systemTypeId = linkedSystem?.system_type_id ?? null
    }

    const { data: clientItems } = await supabase
      .from('client_checklist_items')
      .select('*')
      .eq('client_id', clientId)
      .order('position', { ascending: true })

    const serviceTypeId = task.site_service?.service_type_id
    const matched = ((clientItems || []) as ClientChecklistItem[]).filter((item) => {
      const systemOk =
        item.system_type_ids.length === 0 ||
        (systemTypeId !== null && item.system_type_ids.includes(systemTypeId))
      const serviceOk =
        item.service_type_ids.length === 0 ||
        (serviceTypeId != null && item.service_type_ids.includes(serviceTypeId))
      return systemOk && serviceOk
    })

    if (matched.length > 0) {
      const extraItems = matched.map((item) => ({
        id: `client-${item.id}`,
        label: item.label,
        type: item.type,
        required: item.required,
      }))
      // Merge onto the existing template, or synthesise one if none exists so the
      // client items still reach the engineer.
      checklistTemplate = {
        id: checklistTemplate?.id ?? `synthetic-${task.site_service.service_type_id}`,
        service_type_id: task.site_service.service_type_id,
        visit_type_id: checklistTemplate?.visit_type_id ?? task.visit_type_id ?? null,
        name: checklistTemplate?.name ?? 'Checklist',
        items: [...(checklistTemplate?.items ?? []), ...extraItems],
        created_at: checklistTemplate?.created_at ?? new Date().toISOString(),
        updated_at: checklistTemplate?.updated_at ?? new Date().toISOString(),
      } as ChecklistTemplate
    }

    // Reference links the office has marked as visible to engineers, scoped the
    // same way as checklist items (empty scope array = applies to all).
    const { data: linkRows } = await supabase
      .from('client_links')
      .select('*')
      .eq('client_id', clientId)
      .eq('sendable_to_engineers', true)
      .order('position', { ascending: true })

    clientLinks = ((linkRows || []) as ClientLink[]).filter((link) => {
      const systemOk =
        link.system_type_ids.length === 0 ||
        (systemTypeId !== null && link.system_type_ids.includes(systemTypeId))
      const serviceOk =
        link.service_type_ids.length === 0 ||
        (serviceTypeId != null && link.service_type_ids.includes(serviceTypeId))
      return systemOk && serviceOk
    })
  }

  // Fetch existing task result if any
  const { data: taskResult } = await supabase
    .from('task_results')
    .select('*')
    .eq('task_id', id)
    .single()

  // Panels configured on the system this service is attached to. When present,
  // the general checklist below is repeated once per panel so one report covers
  // every panel. Only relevant to the general flow (the dedicated per-asset
  // flows above return earlier).
  let panels: SystemPanel[] = []
  if (task.site_service?.site_system_id) {
    const { data: panelsData } = await supabase
      .from('system_panels')
      .select('*')
      .eq('site_system_id', task.site_service.site_system_id)
      .order('position')
    panels = (panelsData || []) as SystemPanel[]
  }

  // Office/admin can quick-assign this call from the summary, so load engineers.
  const isAdminOrOffice = (profile as Profile).role === 'admin' || (profile as Profile).role === 'office'
  let engineers: Profile[] = []
  if (isAdminOrOffice) {
    const { data: engineersData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'engineer')
      .order('full_name')
    engineers = (engineersData || []) as Profile[]
  }

  return withPanel(
    <TaskExecution
      task={task as TaskWithDetails}
      checklistTemplate={checklistTemplate as ChecklistTemplate | null}
      existingResult={taskResult}
      profile={profile as Profile}
      clientLinks={clientLinks}
      engineers={engineers}
    />,
  )
}

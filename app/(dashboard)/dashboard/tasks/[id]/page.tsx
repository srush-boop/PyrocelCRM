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
import type {
  Profile,
  TaskWithDetails,
  ChecklistTemplate,
  Damper,
  DamperInspection,
  Mcp,
  McpInspection,
  EmergencyLight,
  EmergencyLightInspection,
  Extinguisher,
  ExtinguisherInspection,
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
        site:sites(*),
        service_type:service_types(*)
      ),
      assigned_engineer:profiles(*),
      visit_type:service_visit_types(*)
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

  // Damper inspection tasks use a dedicated per-asset flow
  if (isDamperService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: dampersData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('dampers').select('*').eq('site_id', siteId).order('reference', { ascending: true }),
      supabase.from('damper_inspections').select('*').eq('task_id', id),
    ])

    return (
      <DamperTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        dampers={(dampersData || []) as Damper[]}
        existingInspections={(inspectionsData || []) as DamperInspection[]}
      />
    )
  }

  // Fire extinguisher servicing tasks use a dedicated per-asset flow
  if (isExtinguisherService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: extinguishersData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('extinguishers').select('*').eq('site_id', siteId).order('reference', { ascending: true }),
      supabase.from('extinguisher_inspections').select('*').eq('task_id', id),
    ])

    return (
      <ExtinguisherTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        extinguishers={(extinguishersData || []) as Extinguisher[]}
        existingInspections={(inspectionsData || []) as ExtinguisherInspection[]}
      />
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

    return (
      <McpTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        mcps={(mcpsData || []) as Mcp[]}
        existingInspections={(inspectionsData || []) as McpInspection[]}
        lastTestedMcpId={lastTestedMcpId}
        lastTestedDate={lastTestedDate}
        nimbusUrl={nimbusUrl}
      />
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

    return (
      <EmergencyLightTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        lights={(lightsData || []) as EmergencyLight[]}
        existingInspections={(inspectionsData || []) as EmergencyLightInspection[]}
      />
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
  const checklistTemplate =
    (task.visit_type_id
      ? templates.find((t) => t.visit_type_id === task.visit_type_id)
      : undefined) ??
    templates.find((t) => !t.visit_type_id) ??
    templates[0] ??
    null

  // Fetch existing task result if any
  const { data: taskResult } = await supabase
    .from('task_results')
    .select('*')
    .eq('task_id', id)
    .single()

  return (
    <TaskExecution
      task={task as TaskWithDetails}
      checklistTemplate={checklistTemplate as ChecklistTemplate | null}
      existingResult={taskResult}
      profile={profile as Profile}
    />
  )
}

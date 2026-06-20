import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TaskExecution } from '@/components/dashboard/tasks/task-execution'
import { DamperTaskExecution } from '@/components/dashboard/dampers/damper-task-execution'
import { McpTaskExecution } from '@/components/dashboard/mcps/mcp-task-execution'
import { EmergencyLightTaskExecution } from '@/components/dashboard/emergency-lights/emergency-light-task-execution'
import { isDamperService } from '@/lib/dampers'
import { isFireAlarmService } from '@/lib/mcps'
import { isEmergencyLightService } from '@/lib/emergency-lights'
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
      assigned_engineer:profiles(*)
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

  // Weekly fire alarm tasks use a dedicated per-call-point flow
  if (isFireAlarmService(task.site_service?.service_type?.name)) {
    const siteId = task.site_service?.site?.id ?? task.site_service?.site_id
    const [{ data: mcpsData }, { data: inspectionsData }] = await Promise.all([
      supabase.from('mcps').select('*').eq('site_id', siteId).order('map_reference', { ascending: true }),
      supabase.from('mcp_inspections').select('*').eq('task_id', id),
    ])

    return (
      <McpTaskExecution
        task={task as TaskWithDetails}
        profile={profile as Profile}
        mcps={(mcpsData || []) as Mcp[]}
        existingInspections={(inspectionsData || []) as McpInspection[]}
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

  // Fetch checklist template for this service type
  const { data: checklistTemplate } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('service_type_id', task.site_service.service_type_id)
    .limit(1)
    .single()

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

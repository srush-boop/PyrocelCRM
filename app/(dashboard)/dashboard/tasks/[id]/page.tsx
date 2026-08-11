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
import { AddRequestButton } from '@/components/dashboard/requests/add-request-button'
import { EntityRequestsCard } from '@/components/dashboard/requests/entity-requests-card'
import { CommissioningJobPanel } from '@/components/dashboard/tasks/commissioning-job-panel'
import { RemedialCallPanel } from '@/components/dashboard/tasks/remedial-call-panel'
import { resolveSiteFlags } from '@/lib/site-flags'
import { getOpenRemedialCallsForSite } from '@/lib/remedial'
import { OutstandingRemedialCard } from '@/components/dashboard/tasks/outstanding-remedial-card'
import { DeadlineFailedPanel } from '@/components/dashboard/tasks/deadline-failed-panel'
import { CallNotesCard } from '@/components/dashboard/tasks/call-notes-card'
import { CallHistoryCard, type CallHistoryEntry } from '@/components/dashboard/tasks/call-history-card'
import { CallCostCard } from '@/components/dashboard/tasks/call-cost-card'
import { getCallProfit } from '@/lib/billing/call-profit-data'
import { profileCanViewLabourCosts } from '@/lib/auth/labour-costs'
import { getRouteProgressForTask, type RouteProgress } from '@/lib/routes/route-progress'
import { getGlobalConfig } from '@/lib/actions/global-config'
import { getAllDocumentTags, getOwnerDocuments } from '@/lib/documents/data'
import type { SiteInternalNote } from '@/lib/types/database'
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
  PanelVisitAssignment,
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

  // Fetch task with all related data. Reactive/emergency calls (booked from the
  // dispatch map) have no site_service — they anchor directly to site /
  // service_type / system_type — so we also embed those direct relations.
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(
        *,
        site:sites(*, client:clients(id, name)),
        service_type:service_types(*, system_type:system_types(*)),
        site_system:site_systems(*)
      ),
      direct_site:sites!tasks_site_id_fkey(*, client:clients(id, name)),
      direct_service_type:service_types!tasks_service_type_id_fkey(*, system_type:system_types(*)),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*),
      visit_type:service_visit_types(*),
      client:clients(id, name),
      invoice:invoices(id, invoice_number)
    `)
    .eq('id', id)
    .single()

  if (!task) {
    notFound()
  }

  // Reactive/emergency calls have no site_service row. Synthesize a
  // site_service-shaped object from the direct relations so the shared task
  // flow below (which expects task.site_service) works for them too.
  if (!task.site_service && task.direct_site && task.direct_service_type) {
    ;(task as { site_service: unknown }).site_service = {
      id: null,
      site_id: task.site_id,
      service_type_id: task.service_type_id,
      site_system_id: null,
      route_id: null,
      site: task.direct_site,
      service_type: task.direct_service_type,
    }
  }

  // Without a resolvable site + service (neither recurring nor direct), the
  // execution flow can't render — surface a 404 rather than crashing.
  if (!task.site_service) {
    notFound()
  }

  // Check if engineer / sub-contractor can access this task. Both are field
  // workers restricted to the calls allocated to them.
  const fieldRole =
    (profile as Profile).role === 'engineer' || (profile as Profile).role === 'subcontractor'
  if (fieldRole && task.assigned_engineer_id !== user.id) {
    redirect('/dashboard')
  }

  // Route context for CDO engineers: where this call sits in the route's ordered
  // day ("call X of Y") and the next call to jump to on completion. Only for the
  // assigned CDO working an active call on a route; everyone else gets null.
  let routeProgress: RouteProgress | null = null
  if (
    (profile as Profile).discipline === 'cdo' &&
    task.assigned_engineer_id === user.id &&
    task.status !== 'completed'
  ) {
    routeProgress = await getRouteProgressForTask(supabase, task as TaskWithDetails, user.id)
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
    const [{ data: notesData }, engDocs, allDocumentTags] = await Promise.all([
      supabase
        .from('site_internal_notes')
        .select('*, author:profiles!site_internal_notes_author_id_fkey(id, full_name, role)')
        .eq('site_id', preAttendanceSiteId)
        .order('created_at', { ascending: false }),
      getOwnerDocuments('site_engineer', preAttendanceSiteId),
      getAllDocumentTags(),
    ])
    const engFolders = engDocs.folders
    const engFiles = engDocs.files

    // Derive the "remedial works required" alert automatically from any
    // outstanding remedial call on this site (site + service scope) rather than
    // a manual toggle.
    const { siteOpen: remedialOpen } = await getOpenRemedialForSite(
      supabase,
      preAttendanceSiteId,
    )
    const flags = resolveSiteFlags(task.site_service?.site, task.site_service, {
      system: task.site_service?.site_system,
      remedialOpen,
    })

    preAttendancePanel = (
      <PreAttendancePanel
        siteId={preAttendanceSiteId}
        flags={flags}
        notes={(notesData || []) as SiteInternalNote[]}
        engineerFolders={engFolders}
        engineerFiles={engFiles}
        currentUserId={user.id}
        canModerateNotes={canModerateNotes}
        isFireAlarm={isFireAlarmService(task.site_service?.service_type?.name)}
        allTags={allDocumentTags}
        usedTags={engDocs.usedTags}
      />
    )
  }

  // ─── System call history ──────────────────────────────────────────────────
  // Show the last 5 calls logged against the SAME system so the engineer has
  // recent context (call type, date, result) before starting. Scope to every
  // site_service attached to this call's physical system; for reactive calls
  // with no linked system, fall back to services on the site matching the
  // call's system type. Appended below the pre-attendance panel.
  {
    const systemId = task.site_service?.site_system_id ?? null
    const historySystemTypeId =
      (task as { system_type_id?: string | null }).system_type_id ??
      task.site_service?.service_type?.system_type?.id ??
      task.direct_service_type?.system_type?.id ??
      null
    const systemName =
      task.site_service?.service_type?.system_type?.name ??
      task.direct_service_type?.system_type?.name ??
      null

    // Resolve the set of sibling site_service ids scoped to the system.
    let serviceIds: string[] = []
    if (systemId) {
      const { data: sysServices } = await supabase
        .from('site_services')
        .select('id')
        .eq('site_system_id', systemId)
      serviceIds = (sysServices || []).map((s) => s.id as string)
    } else if (preAttendanceSiteId) {
      const { data: siteServices } = await supabase
        .from('site_services')
        .select('id, service_type:service_types(system_type_id)')
        .eq('site_id', preAttendanceSiteId)
      serviceIds = ((siteServices || []) as unknown as {
        id: string
        service_type: { system_type_id: string | null } | null
      }[])
        .filter(
          (s) =>
            !historySystemTypeId ||
            s.service_type?.system_type_id === historySystemTypeId,
        )
        .map((s) => s.id)
    }

    let historyEntries: CallHistoryEntry[] = []
    if (serviceIds.length > 0) {
      const { data: historyRows } = await supabase
        .from('tasks')
        .select(`
          id, scheduled_date, completed_at, status,
          visit_type:service_visit_types(name),
          site_service:site_services(service_type:service_types(name)),
          task_result:task_results(overall_status, reference_number)
        `)
        .in('site_service_id', serviceIds)
        .neq('id', id)
        .lte('scheduled_date', new Date().toISOString().split('T')[0])
        .order('scheduled_date', { ascending: false })
        .limit(5)

      historyEntries = ((historyRows || []) as unknown as {
        id: string
        scheduled_date: string | null
        completed_at: string | null
        status: string
        visit_type: { name: string } | null
        site_service: { service_type: { name: string } | null } | null
        task_result: { overall_status: string | null; reference_number: string | null } | null
      }[]).map((r) => ({
        id: r.id,
        type:
          [r.site_service?.service_type?.name, r.visit_type?.name]
            .filter(Boolean)
            .join(' · ') || 'Call',
        date: r.status === 'completed' && r.completed_at ? r.completed_at : r.scheduled_date,
        status: r.status,
        result: r.task_result?.overall_status ?? null,
        reference: r.task_result?.reference_number ?? null,
      }))
    }

    if (historyEntries.length > 0) {
      preAttendancePanel = (
        <>
          {preAttendancePanel}
          <CallHistoryCard systemName={systemName} entries={historyEntries} />
        </>
      )
    }
  }

  // Commissioning calls booked from a job: give the engineer the job context +
  // read-only access to the job's documents folder, shown above the shared
  // pre-attendance panel. Both are passed through the single `preAttendance`
  // slot so every execution variant renders them without extra props.
  if (task.is_commissioning && task.source_job_id) {
    const jobId = task.source_job_id as string
    const [{ data: jobRow }, jobDocs] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, job_number, title, po_number, notes')
        .eq('id', jobId)
        .maybeSingle(),
      getOwnerDocuments('job', jobId),
    ])
    const jobFolders = jobDocs.folders
    const jobFiles = jobDocs.files

    if (jobRow) {
      const j = jobRow as {
        id: string
        job_number: string | null
        title: string | null
        po_number: string | null
        notes: string | null
      }
      const commissioningPanel = (
        <CommissioningJobPanel
          jobId={j.id}
          jobNumber={j.job_number}
          jobTitle={j.title}
          poNumber={j.po_number}
          jobNotes={j.notes}
          folders={jobFolders}
          files={jobFiles}
          canOpenJob={role === 'admin' || role === 'office'}
        />
      )
      preAttendancePanel = (
        <>
          {commissioningPanel}
          {preAttendancePanel}
        </>
      )
    }
  }

  // Remedial calls raised from an accepted quote: tie the call back to that quote
  // and to the original inspection call where the defect was found. Shown at the
  // very top so the engineer/office has the full trail before starting.
  if (task.is_remedial && (task.source_quote_id || task.source_defect_id)) {
    const canOpenQuote = role === 'admin' || role === 'office'

    let srcQuote: {
      id: string
      quote_number: string | null
      reference: string | null
      total_pence: number | null
    } | null = null
    if (task.source_quote_id) {
      const { data: q } = await supabase
        .from('quotes')
        .select('id, quote_number, reference, total_pence')
        .eq('id', task.source_quote_id as string)
        .maybeSingle()
      srcQuote = (q as typeof srcQuote) ?? null
    }

    // Resolve the originating inspection call via the source defect.
    let originCall: { id: string; reference_number: string | null } | null = null
    if (task.source_defect_id) {
      const { data: defect } = await supabase
        .from('defects')
        .select('task_id, task_result_id')
        .eq('id', task.source_defect_id as string)
        .maybeSingle()
      const d = defect as { task_id: string | null; task_result_id: string | null } | null
      let originTaskId = d?.task_id ?? null
      if (!originTaskId && d?.task_result_id) {
        const { data: tr } = await supabase
          .from('task_results')
          .select('task_id')
          .eq('id', d.task_result_id)
          .maybeSingle()
        originTaskId = (tr as { task_id: string | null } | null)?.task_id ?? null
      }
      if (originTaskId && originTaskId !== id) {
        const { data: ot } = await supabase
          .from('tasks')
          .select('id, reference_number')
          .eq('id', originTaskId)
          .maybeSingle()
        originCall = (ot as typeof originCall) ?? null
      }
    }

    if (srcQuote || originCall) {
      preAttendancePanel = (
        <>
          <RemedialCallPanel quote={srcQuote} originCall={originCall} canOpenQuote={canOpenQuote} />
          {preAttendancePanel}
        </>
      )
    }
  }

  // Respond-by countdown + deadline-failed panel. Shown to all users when the
  // call has a KPI deadline. The logging panel (for office/admin) is injected
  // before the pre-attendance panel so it's visible at the top of the flow.
  if (task.respond_by) {
    const deadlineReasons = await getGlobalConfig<string[]>('deadline_failed_reasons')
    const defaultReasons = [
      'Engineer attended but unable to gain access',
      'Insufficient information provided',
      'Parts required — awaiting delivery',
      'Awaiting client authorisation',
      'Weather conditions',
      'Other',
    ]
    // Office/admin, or the engineer assigned to the call, may log the reason.
    const canLogDeadline =
      canModerateNotes ||
      (role === 'engineer' && task.assigned_engineer_id === user.id)
    const deadlinePanelNode = (
      <DeadlineFailedPanel
        taskId={id}
        respondBy={task.respond_by as string}
        currentReason={(task as any).deadline_failed_reason ?? null}
        currentNote={(task as any).deadline_failed_note ?? null}
        reasons={deadlineReasons ?? defaultReasons}
        canLog={canLogDeadline}
      />
    )
    preAttendancePanel = (
      <>
        {deadlinePanelNode}
        {preAttendancePanel}
      </>
    )
  }

  // Office/admin can raise a client request against this call (engineers can't).
  // It's hard-linked to the task and prepended into the shared slot so it appears
  // above every execution variant without touching each one.
  if (canModerateNotes) {
    const callSiteName = task.site_service?.site?.name ?? null
    const callServiceName = task.site_service?.service_type?.name ?? null
    const callLabel =
      ['Call', callServiceName, callSiteName].filter(Boolean).join(' · ') || 'this call'
    preAttendancePanel = (
      <>
        <div className="flex justify-end">
          <AddRequestButton
            entityType="task"
            entityId={id}
            context={{
              siteId: preAttendanceSiteId,
              clientId: task.site_service?.site?.client_id ?? task.client_id ?? null,
              serviceTypeId: task.service_type_id ?? task.site_service?.service_type_id ?? null,
              label: callLabel,
            }}
            revalidate={`/dashboard/tasks/${id}`}
          />
        </div>
        <EntityRequestsCard entityType="task" entityId={id} />
        {preAttendancePanel}
      </>
    )
  }

  // Prominent "Call notes" card at the very top of the slot, visible to every
  // role, so the description captured when the call was logged is never hidden.
  if ((task.notes as string | null)?.trim()) {
    preAttendancePanel = (
      <>
        <CallNotesCard notes={task.notes as string} />
        {preAttendancePanel}
      </>
    )
  }

  // Restricted labour-cost / profitability card. Only for viewers with the
  // permission, and only once the call is completed (before that there's no
  // on-site time to cost). Prepended last so it sits at the very top.
  if (task.status === 'completed' && profileCanViewLabourCosts(profile as Profile)) {
    const callProfit = await getCallProfit(id)
    if (callProfit) {
      preAttendancePanel = (
        <>
          <CallCostCard profit={callProfit} />
          {preAttendancePanel}
        </>
      )
    }
  }

  // Existing client sign-off (name + signature) for the asset inspection flows,
  // so the sign-off capture card can redisplay a saved signature on a completed
  // call. Non-recurring calls only surface the card, but fetching is harmless.
  const { data: signOffResult } = await supabase
    .from('task_results')
    .select('client_signature, client_signature_name')
    .eq('task_id', id)
    .maybeSingle()
  const existingSignature =
    (signOffResult as { client_signature?: string | null } | null)?.client_signature ?? null
  const existingSignatureName =
    (signOffResult as { client_signature_name?: string | null } | null)?.client_signature_name ?? null

  // The shared pre-attendance panel is passed into each execution flow so it can
  // render directly beneath the site/service header (rather than above it).
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
        preAttendance={preAttendancePanel}
        routeProgress={routeProgress}
        existingSignature={existingSignature}
        existingSignatureName={existingSignatureName}
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
        preAttendance={preAttendancePanel}
        routeProgress={routeProgress}
        existingSignature={existingSignature}
        existingSignatureName={existingSignatureName}
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
        preAttendance={preAttendancePanel}
        routeProgress={routeProgress}
        existingSignature={existingSignature}
        existingSignatureName={existingSignatureName}
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
        preAttendance={preAttendancePanel}
        routeProgress={routeProgress}
        existingSignature={existingSignature}
        existingSignatureName={existingSignatureName}
      />
    )
  }

  // Fetch the checklist template for this service type. Resolution order:
  //  1. Multi-visit services: the template matching this task's visit type.
  //  2. Multi-system call types (reactive/planned): the template matching the
  //     booked system, then the general (no-system) fallback.
  //  3. The service-wide template (no visit type), then any template.
  const { data: checklistTemplates } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('service_type_id', task.site_service.service_type_id)

  const taskSystemTypeId = (task as { system_type_id?: string | null }).system_type_id ?? null
  const templates = (checklistTemplates || []) as ChecklistTemplate[]
  let checklistTemplate =
    (task.visit_type_id
      ? templates.find((t) => t.visit_type_id === task.visit_type_id)
      : undefined) ??
    (taskSystemTypeId
      ? templates.find((t) => !t.visit_type_id && t.system_type_id === taskSystemTypeId)
      : undefined) ??
    templates.find((t) => !t.visit_type_id && !t.system_type_id) ??
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
  // Panel-level visit rotation: when the system spreads the heavy (Annual)
  // inspection across visits, each panel can get a different checklist on this
  // visit. panelChecklists maps panel id → { template, level label } for those
  // panels; absent/empty means every panel uses the single checklistTemplate.
  const panelChecklists: Record<string, { template: ChecklistTemplate; level: string }> = {}
  if (task.site_service?.site_system_id) {
    const { data: panelsData } = await supabase
      .from('system_panels')
      .select('*')
      .eq('site_system_id', task.site_service.site_system_id)
      .order('position')
    panels = (panelsData || []) as SystemPanel[]

    const { data: systemRow } = await supabase
      .from('site_systems')
      .select('panel_rotation_enabled')
      .eq('id', task.site_service.site_system_id)
      .maybeSingle()

    if (systemRow?.panel_rotation_enabled && task.visit_type_id && panels.length > 0) {
      const [{ data: assignmentRows }, { data: visitTypeRows }] = await Promise.all([
        supabase
          .from('panel_visit_assignments')
          .select('*')
          .eq('site_system_id', task.site_service.site_system_id)
          .eq('visit_type_id', task.visit_type_id),
        supabase
          .from('service_visit_types')
          .select('id, name')
          .eq('service_type_id', task.site_service.service_type_id),
      ])
      const assignments = (assignmentRows || []) as PanelVisitAssignment[]
      const visitTypeNames = new Map<string, string>()
      for (const vt of (visitTypeRows || []) as { id: string; name: string }[]) {
        visitTypeNames.set(vt.id, vt.name)
      }
      for (const panel of panels) {
        const assignment = assignments.find((a) => a.panel_id === panel.id)
        // Fall back to this visit's own type when a panel has no explicit cell.
        const appliedId = assignment?.applied_visit_type_id ?? task.visit_type_id
        const appliedTemplate = templates.find((t) => t.visit_type_id === appliedId)
        if (appliedTemplate) {
          panelChecklists[panel.id] = {
            template: appliedTemplate as ChecklistTemplate,
            level: visitTypeNames.get(appliedId) ?? '',
          }
        }
      }
    }
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

  return (
    <TaskExecution
      task={task as TaskWithDetails}
      checklistTemplate={checklistTemplate as ChecklistTemplate | null}
      existingResult={taskResult}
      profile={profile as Profile}
      clientLinks={clientLinks}
      engineers={engineers}
      panels={panels}
      panelChecklists={panelChecklists}
      preAttendance={preAttendancePanel}
      routeProgress={routeProgress}
    />
  )
}

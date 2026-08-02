'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Profile,
  InternalTaskTemplate,
  InternalTaskInstance,
  InternalTaskItem,
  InternalTaskAnswer,
  ChecklistCondition,
} from '@/lib/types/database'
import { computePeriod, resolveAssigneeIds } from '@/lib/internal-tasks/schedule'

// Server actions for the Internal Tasks / Quality module. Users generate + view
// + complete their own recurring task instances; quality managers (admin/office)
// manage the templates.

const MY_TASKS_PATH = '/dashboard/my-tasks'
const SETTINGS_PATH = '/dashboard/settings'

async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, department_id, status')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'No profile' as const }
  return { supabase, userId: user.id, profile: profile as Pick<Profile, 'id' | 'role' | 'department_id' | 'status'> }
}

async function requireManager() {
  const auth = await getAuth()
  if ('error' in auth) return auth
  if (auth.profile.role !== 'admin' && auth.profile.role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return auth
}

// --- Instance generation ----------------------------------------------------

/**
 * Ensures the current-period instances exist for the signed-in user, for every
 * active template that applies to them. Idempotent — inserts only missing rows
 * (guarded by the unique(template_id,user_id,period_start) constraint).
 */
export async function ensureMyInstances(): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId, profile } = auth

  const { data: templates } = await supabase
    .from('internal_task_templates')
    .select('*')
    .eq('active', true)
    .eq('task_kind', 'recurring')

  const me = {
    id: profile.id,
    role: profile.role ?? null,
    department_id: profile.department_id ?? null,
    status: profile.status ?? 'active',
  }

  const rows: Array<{
    template_id: string
    user_id: string
    period_start: string
    period_end: string
    due_at: string
  }> = []

  for (const t of (templates ?? []) as InternalTaskTemplate[]) {
    const applies = resolveAssigneeIds(t, [me]).includes(userId)
    if (!applies) continue
    const period = computePeriod(t)
    rows.push({
      template_id: t.id,
      user_id: userId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      due_at: period.dueAt,
    })
  }

  if (rows.length > 0) {
    // Ignore conflicts on the unique key so re-opening never duplicates.
    const { error } = await supabase
      .from('internal_task_instances')
      .upsert(rows, { onConflict: 'template_id,user_id,period_start', ignoreDuplicates: true })
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true }
}

// --- Reads ------------------------------------------------------------------

/**
 * Returns the signed-in user's task instances (current period + recent) with
 * their template embedded, freshest deadline first. Ensures instances first.
 */
export async function getMyTasks(): Promise<{
  ok: boolean
  error?: string
  instances?: InternalTaskInstance[]
}> {
  const ensured = await ensureMyInstances()
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  // Show everything not-yet-done, plus anything completed in the last 45 days.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 45)

  const { data, error } = await supabase
    .from('internal_task_instances')
    .select('*, template:internal_task_templates(*)')
    .eq('user_id', userId)
    .or(`status.neq.completed,completed_at.gte.${cutoff.toISOString()}`)
    .order('due_at', { ascending: true })

  if (error) return { ok: false, error: error.message }
  // Only scheduled recurring tasks belong in the task list; on-demand form
  // submissions are surfaced separately (getMyFormSubmissions).
  const instances = ((data ?? []) as InternalTaskInstance[]).filter(
    (i) => i.template?.task_kind !== 'on_demand',
  )
  return { ok: true, instances }
}

/**
 * Outstanding (pending/overdue) instances for the signed-in user — used by the
 * timesheet submit-confirmation prompt and the "Your Tasks" tile count.
 */
export async function getOutstandingTasks(): Promise<{
  ok: boolean
  error?: string
  instances?: InternalTaskInstance[]
}> {
  const ensured = await ensureMyInstances()
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data, error } = await supabase
    .from('internal_task_instances')
    .select('*, template:internal_task_templates(*)')
    .eq('user_id', userId)
    .neq('status', 'completed')
    .order('due_at', { ascending: true })

  if (error) return { ok: false, error: error.message }
  const instances = ((data ?? []) as InternalTaskInstance[]).filter(
    (i) => i.template?.task_kind !== 'on_demand',
  )
  return { ok: true, instances }
}

// --- Completion -------------------------------------------------------------

/**
 * Persists a user's answers to their own task instance and marks it complete.
 * Conditional submit-gating is enforced client-side (mirrors task-execution);
 * here we just validate ownership + reference presence and store the result.
 */
export async function submitInternalTask(input: {
  instanceId: string
  answers: InternalTaskAnswer[]
  referenceNumber?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: instance } = await supabase
    .from('internal_task_instances')
    .select(
      'id, user_id, template:internal_task_templates(id, name, questions, requires_reference, notify_on_issue_user_ids, notify_on_issue_email, requires_approval, approval_manager, approval_user_ids)',
    )
    .eq('id', input.instanceId)
    .single()

  if (!instance || instance.user_id !== userId) {
    return { ok: false, error: 'Task not found.' }
  }

  const template = (
    Array.isArray(instance.template) ? instance.template[0] : instance.template
  ) as {
    id?: string
    name?: string
    questions?: InternalTaskItem[]
    requires_reference?: boolean
    notify_on_issue_user_ids?: string[] | null
    notify_on_issue_email?: string | null
    requires_approval?: boolean
    approval_manager?: boolean
    approval_user_ids?: string[] | null
  } | null

  if (template?.requires_reference && !input.referenceNumber?.trim()) {
    return { ok: false, error: 'A reference number is required to complete this task.' }
  }

  // Resolve approvers (line manager + nominated users) when approval is required.
  let approverIds: string[] = []
  const needsApproval = !!template?.requires_approval
  if (needsApproval) {
    approverIds = await resolveApproverIds(supabase, userId, {
      approval_manager: !!template?.approval_manager,
      approval_user_ids: template?.approval_user_ids ?? [],
    })
  }

  const { error } = await supabase
    .from('internal_task_instances')
    .update({
      answers: input.answers,
      reference_number: input.referenceNumber?.trim() || null,
      status: 'completed',
      completed_at: new Date().toISOString(),
      approval_status: needsApproval ? 'pending' : null,
      approver_ids: approverIds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.instanceId)
    .eq('user_id', userId)

  if (error) return { ok: false, error: error.message }

  // Notify approvers that a submission awaits their decision. Best-effort.
  if (needsApproval && approverIds.length > 0) {
    try {
      const { data: submitter } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()
      const submitterName =
        (submitter as { full_name?: string } | null)?.full_name ?? 'A team member'
      const { notifyUsers } = await import('@/lib/notifications')
      await notifyUsers({
        userIds: approverIds,
        title: `Approval needed: ${template?.name ?? 'Form'}`,
        body: `${submitterName} submitted "${template?.name ?? 'a form'}" for your approval.`,
        url: MY_TASKS_PATH,
        category: 'internal_task_approval',
        createdBy: userId,
        data: { template_name: template?.name ?? '', instanceId: input.instanceId },
      })
    } catch (err) {
      console.log('[v0] internal-task approval notify failed:', (err as Error).message)
    }
  }

  // Escalation: if any answer is a failure or advisory, alert the nominated
  // user(s) in-app and email the nominated address. Best-effort — never blocks
  // the user's completion.
  const issues = (input.answers ?? []).filter((a) => a.passed === false || a.advisory === true)
  const hasNotifyTargets =
    (template?.notify_on_issue_user_ids?.length ?? 0) > 0 ||
    !!template?.notify_on_issue_email?.trim()
  if (issues.length > 0 && hasNotifyTargets) {
    try {
      await dispatchIssueAlerts({
        supabase,
        submitterId: userId,
        templateName: template?.name ?? 'Internal task',
        notifyUserIds: template?.notify_on_issue_user_ids ?? [],
        notifyEmail: template?.notify_on_issue_email ?? null,
        referenceNumber: input.referenceNumber?.trim() || null,
        issues,
      })
    } catch (err) {
      console.log('[v0] internal-task issue alert failed:', (err as Error).message)
    }
  }

  // Conditional notifications: any condition on a question that fired AND carries
  // notifyUserIds alerts those users in-app. Best-effort, never blocks completion.
  try {
    await dispatchConditionalNotifications({
      supabase,
      submitterId: userId,
      templateName: template?.name ?? 'Internal task',
      questions: template?.questions ?? [],
      answers: input.answers ?? [],
    })
  } catch (err) {
    console.log('[v0] internal-task conditional notify failed:', (err as Error).message)
  }

  revalidatePath(MY_TASKS_PATH)
  return { ok: true }
}

// --- On-demand forms + approvals -------------------------------------------

// Resolves the approver profile ids for a submission: the submitter's line
// manager (when the template routes to it) plus any nominated approvers. The
// submitter is never their own approver; the result is deduped.
async function resolveApproverIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submitterId: string,
  cfg: { approval_manager: boolean; approval_user_ids: string[] },
): Promise<string[]> {
  const ids = new Set<string>(cfg.approval_user_ids ?? [])
  if (cfg.approval_manager) {
    const { data } = await supabase
      .from('profiles')
      .select('manager_id')
      .eq('id', submitterId)
      .single()
    const managerId = (data as { manager_id?: string | null } | null)?.manager_id
    if (managerId) ids.add(managerId)
  }
  ids.delete(submitterId)
  return Array.from(ids)
}

/**
 * Active on-demand form templates that any signed-in user can launch. Ordered
 * by sort order then name.
 */
export async function getOnDemandForms(): Promise<{
  ok: boolean
  error?: string
  forms?: InternalTaskTemplate[]
}> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { data, error } = await auth.supabase
    .from('internal_task_templates')
    .select('*')
    .eq('active', true)
    .eq('task_kind', 'on_demand')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, forms: (data ?? []) as InternalTaskTemplate[] }
}

/**
 * Creates a fresh draft instance of an on-demand form for the current user and
 * returns it (with its template embedded) so the fill sheet can open on it.
 * On-demand forms carry no period/deadline.
 */
export async function startOnDemandInstance(
  templateId: string,
): Promise<{ ok: boolean; error?: string; instance?: InternalTaskInstance }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: template } = await supabase
    .from('internal_task_templates')
    .select('id, active, task_kind')
    .eq('id', templateId)
    .single()
  const t = template as { id?: string; active?: boolean; task_kind?: string } | null
  if (!t || !t.active || t.task_kind !== 'on_demand') {
    return { ok: false, error: 'Form not available.' }
  }

  const { data, error } = await supabase
    .from('internal_task_instances')
    .insert({
      template_id: templateId,
      user_id: userId,
      period_start: null,
      period_end: null,
      due_at: null,
      status: 'pending',
      answers: [],
    })
    .select('*, template:internal_task_templates(*)')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(MY_TASKS_PATH)
  return { ok: true, instance: data as InternalTaskInstance }
}

/**
 * The current user's on-demand form submissions (their own), freshest first.
 * Includes drafts, completed, and any approval outcome.
 */
export async function getMyFormSubmissions(): Promise<{
  ok: boolean
  error?: string
  instances?: InternalTaskInstance[]
}> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data, error } = await supabase
    .from('internal_task_instances')
    .select('*, template:internal_task_templates(*), approver:profiles!internal_task_instances_approved_by_fkey(id, full_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return { ok: false, error: error.message }
  const instances = ((data ?? []) as InternalTaskInstance[]).filter(
    (i) => i.template?.task_kind === 'on_demand',
  )
  return { ok: true, instances }
}

/**
 * Submissions awaiting the current user's approval decision: instances where
 * they are a nominated/line-manager approver (or, for quality managers, any
 * pending approval), freshest first.
 */
export async function getPendingApprovals(): Promise<{
  ok: boolean
  error?: string
  instances?: InternalTaskInstance[]
}> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId, profile } = auth
  const isManager = profile.role === 'admin' || profile.role === 'office'

  let query = supabase
    .from('internal_task_instances')
    .select('*, template:internal_task_templates(*), user:profiles!internal_task_instances_user_id_fkey(id, full_name)')
    .eq('approval_status', 'pending')
    .order('completed_at', { ascending: true })

  // Non-managers only see approvals routed to them. Managers see all pending.
  if (!isManager) query = query.contains('approver_ids', [userId])

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, instances: (data ?? []) as InternalTaskInstance[] }
}

/**
 * Records an approver's decision on a submitted form and notifies the submitter.
 * Permitted for a nominated/line-manager approver or a quality manager.
 */
export async function decideApproval(input: {
  instanceId: string
  decision: 'approved' | 'rejected'
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId, profile } = auth
  const isManager = profile.role === 'admin' || profile.role === 'office'

  const { data: instance } = await supabase
    .from('internal_task_instances')
    .select('id, user_id, approver_ids, approval_status, template:internal_task_templates(name)')
    .eq('id', input.instanceId)
    .single()
  if (!instance) return { ok: false, error: 'Submission not found.' }

  const approverIds = (instance as { approver_ids?: string[] }).approver_ids ?? []
  if (!approverIds.includes(userId) && !isManager) {
    return { ok: false, error: 'Not authorised to approve this submission.' }
  }
  if ((instance as { approval_status?: string }).approval_status !== 'pending') {
    return { ok: false, error: 'This submission has already been decided.' }
  }

  const { error } = await supabase
    .from('internal_task_instances')
    .update({
      approval_status: input.decision,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      approval_note: input.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.instanceId)
  if (error) return { ok: false, error: error.message }

  // Notify the submitter of the outcome. Best-effort.
  try {
    const template = Array.isArray((instance as { template?: unknown }).template)
      ? (instance as { template?: { name?: string }[] }).template?.[0]
      : (instance as { template?: { name?: string } }).template
    const { data: decider } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    const deciderName = (decider as { full_name?: string } | null)?.full_name ?? 'A manager'
    const { notifyUsers } = await import('@/lib/notifications')
    await notifyUsers({
      userIds: [(instance as { user_id: string }).user_id],
      title: `Form ${input.decision}: ${template?.name ?? 'Form'}`,
      body: `${deciderName} ${input.decision} your "${template?.name ?? 'form'}" submission${
        input.note?.trim() ? `: ${input.note.trim()}` : '.'
      }`,
      url: MY_TASKS_PATH,
      category: 'internal_task_approval',
      createdBy: userId,
      data: { template_name: template?.name ?? '', instanceId: input.instanceId },
    })
  } catch (err) {
    console.log('[v0] internal-task decision notify failed:', (err as Error).message)
  }

  revalidatePath(MY_TASKS_PATH)
  return { ok: true }
}

// Evaluates each question's conditions against the submitted answers and, for
// every fired condition carrying notifyUserIds, notifies those users in-app.
// Mirrors the client's isConditionActive so builder + runtime agree.
async function dispatchConditionalNotifications(args: {
  supabase: Awaited<ReturnType<typeof createClient>>
  submitterId: string
  templateName: string
  questions: InternalTaskItem[]
  answers: InternalTaskAnswer[]
}): Promise<void> {
  const { supabase, submitterId, templateName, questions, answers } = args
  const byItem = new Map(answers.map((a) => [a.item_id, a]))

  // Collect (userId -> triggering question labels) across all fired conditions.
  const targets = new Map<string, Set<string>>()
  for (const q of questions) {
    const ans = byItem.get(q.id)
    if (!ans) continue
    for (const cond of q.conditions ?? []) {
      const ids = cond.notifyUserIds ?? []
      if (ids.length === 0) continue
      if (!conditionFired(ans, cond)) continue
      for (const uid of ids) {
        if (!targets.has(uid)) targets.set(uid, new Set())
        targets.get(uid)!.add(q.label || 'a question')
      }
    }
  }
  if (targets.size === 0) return

  const { data: submitter } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', submitterId)
    .single()
  const submitterName =
    (submitter as { full_name?: string } | null)?.full_name ?? 'A team member'

  const { notifyUsers } = await import('@/lib/notifications')
  // One notification per user, listing the questions that triggered it.
  await Promise.all(
    Array.from(targets.entries()).map(([uid, labels]) =>
      notifyUsers({
        userIds: [uid],
        title: `Follow-up on "${templateName}"`,
        body: `${submitterName} completed "${templateName}" — your attention is needed on: ${Array.from(
          labels,
        ).join(', ')}.`,
        url: MY_TASKS_PATH,
        category: 'internal_task_issue',
        createdBy: submitterId,
        data: { template_name: templateName },
      }),
    ),
  )
}

// Server-side mirror of the client isConditionActive check.
function conditionFired(ans: InternalTaskAnswer, cond: ChecklistCondition): boolean {
  if (ans.na) return false
  switch (cond.when) {
    case 'fail':
      return ans.passed === false && !ans.advisory
    case 'pass':
      return ans.passed === true
    case 'advisory':
      return ans.advisory === true
    case 'checked':
      return ans.value === true
    case 'unchecked':
      return ans.value === false
    case 'number': {
      const n = Number(ans.value)
      if (Number.isNaN(n) || cond.threshold == null) return false
      switch (cond.comparator) {
        case 'gt':
          return n > cond.threshold
        case 'lt':
          return n < cond.threshold
        case 'gte':
          return n >= cond.threshold
        case 'lte':
          return n <= cond.threshold
        case 'eq':
          return n === cond.threshold
        default:
          return false
      }
    }
    default:
      return false
  }
}

/**
 * Notifies nominated users (in-app) and emails a nominated address when a
 * completed internal task contains failed/advisory answers.
 */
async function dispatchIssueAlerts(args: {
  supabase: Awaited<ReturnType<typeof createClient>>
  submitterId: string
  templateName: string
  notifyUserIds: string[]
  notifyEmail: string | null
  referenceNumber: string | null
  issues: InternalTaskAnswer[]
}): Promise<void> {
  const { supabase, submitterId, templateName, notifyUserIds, notifyEmail, issues } = args

  // Who completed it (for the alert body).
  const { data: submitter } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', submitterId)
    .single()
  const submitterName = (submitter as { full_name?: string } | null)?.full_name ?? 'A team member'

  const issueLines = issues.map((i) => {
    const state = i.passed === false ? 'FAIL' : 'Advisory'
    const note = i.notes?.trim() ? ` — ${i.notes.trim()}` : ''
    return `${state}: ${i.label}${note}`
  })
  const summary = `${issues.length} issue${issues.length === 1 ? '' : 's'} flagged`

  // 1) In-app notifications to nominated users.
  if (notifyUserIds.length > 0) {
    const { notifyUsers } = await import('@/lib/notifications')
    await notifyUsers({
      userIds: notifyUserIds,
      title: `Issue on "${templateName}"`,
      body: `${submitterName} flagged ${summary} completing "${templateName}".`,
      url: MY_TASKS_PATH,
      category: 'internal_task_issue',
      createdBy: submitterId,
      data: { template_name: templateName },
    })
  }

  // 2) Email the nominated address.
  if (notifyEmail?.trim()) {
    const { sendEmail } = await import('@/lib/email/send-email')
    const ref = args.referenceNumber ? ` (ref ${args.referenceNumber})` : ''
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5">
        <h2 style="margin:0 0 8px">Issue reported on an internal task</h2>
        <p style="margin:0 0 12px">
          <strong>${escapeHtml(submitterName)}</strong> flagged ${summary} while
          completing <strong>${escapeHtml(templateName)}</strong>${escapeHtml(ref)}.
        </p>
        <ul style="margin:0 0 12px;padding-left:18px">
          ${issueLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
        </ul>
        <p style="margin:0;color:#666;font-size:12px">
          Sent automatically by PyrocelCRM Internal Tasks.
        </p>
      </div>`
    await sendEmail(notifyEmail.trim(), `Issue: ${templateName} — ${summary}`, html)
  }
}

// Minimal HTML escaper for user-provided strings in the alert email.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// --- Template management (quality managers) ---------------------------------

export type InternalTaskTemplateInput = Partial<
  Omit<InternalTaskTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>
> & { name: string }

export async function saveInternalTaskTemplate(
  input: InternalTaskTemplateInput & { id?: string },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const auth = await requireManager()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const payload = {
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    active: input.active ?? true,
    sort_order: input.sort_order ?? 0,
    task_kind: input.task_kind ?? 'recurring',
    requires_approval: input.requires_approval ?? false,
    approval_manager: input.approval_manager ?? false,
    approval_user_ids: input.approval_user_ids ?? [],
    frequency: input.frequency ?? 'weekly',
    week_ending_dow: input.week_ending_dow ?? 0,
    anchor_month: input.anchor_month ?? null,
    anchor_day: input.anchor_day ?? null,
    one_off_due_date: input.one_off_due_date ?? null,
    grace_days: input.grace_days ?? 1,
    due_time: input.due_time ?? '09:00',
    reminder_days_before: input.reminder_days_before ?? [1],
    warn_overdue: input.warn_overdue ?? true,
    questions: input.questions ?? [],
    requires_reference: input.requires_reference ?? false,
    reference_label: input.reference_label ?? null,
    applies_to_all: input.applies_to_all ?? false,
    role_names: input.role_names ?? [],
    department_ids: input.department_ids ?? [],
    user_ids: input.user_ids ?? [],
    notify_on_issue_user_ids: input.notify_on_issue_user_ids ?? [],
    notify_on_issue_email: input.notify_on_issue_email?.trim() || null,
  }

  if (input.id) {
    const { error } = await supabase
      .from('internal_task_templates')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(SETTINGS_PATH)
    return { ok: true, id: input.id }
  }

  const { data, error } = await supabase
    .from('internal_task_templates')
    .insert({ ...payload, created_by: userId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true, id: (data as { id: string }).id }
}

/**
 * Permanently deletes a template and (via ON DELETE CASCADE) every instance and
 * completion recorded against it. Manager-only.
 */
export async function deleteInternalTaskTemplate(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireManager()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('internal_task_templates')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function setInternalTaskTemplateActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireManager()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('internal_task_templates')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function duplicateInternalTaskTemplate(
  id: string,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const auth = await requireManager()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: src } = await supabase
    .from('internal_task_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (!src) return { ok: false, error: 'Template not found.' }

  const { id: _omitId, created_at: _c, updated_at: _u, created_by: _cb, ...rest } =
    src as InternalTaskTemplate
  const { data, error } = await supabase
    .from('internal_task_templates')
    .insert({ ...rest, name: `${src.name} (copy)`, active: false, created_by: userId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true, id: (data as { id: string }).id }
}

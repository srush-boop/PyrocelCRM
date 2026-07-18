'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Profile,
  InternalTaskTemplate,
  InternalTaskInstance,
  ChecklistResult,
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
  return { ok: true, instances: (data ?? []) as InternalTaskInstance[] }
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
  return { ok: true, instances: (data ?? []) as InternalTaskInstance[] }
}

// --- Completion -------------------------------------------------------------

/**
 * Persists a user's answers to their own task instance and marks it complete.
 * Conditional submit-gating is enforced client-side (mirrors task-execution);
 * here we just validate ownership + reference presence and store the result.
 */
export async function submitInternalTask(input: {
  instanceId: string
  answers: ChecklistResult[]
  referenceNumber?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: instance } = await supabase
    .from('internal_task_instances')
    .select('id, user_id, template:internal_task_templates(requires_reference)')
    .eq('id', input.instanceId)
    .single()

  if (!instance || instance.user_id !== userId) {
    return { ok: false, error: 'Task not found.' }
  }

  const template = Array.isArray(instance.template) ? instance.template[0] : instance.template
  const requiresRef = (template as { requires_reference?: boolean } | null)?.requires_reference
  if (requiresRef && !input.referenceNumber?.trim()) {
    return { ok: false, error: 'A reference number is required to complete this task.' }
  }

  const { error } = await supabase
    .from('internal_task_instances')
    .update({
      answers: input.answers,
      reference_number: input.referenceNumber?.trim() || null,
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.instanceId)
    .eq('user_id', userId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(MY_TASKS_PATH)
  return { ok: true }
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

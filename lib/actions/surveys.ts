'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Profile,
  InternalTaskTemplate,
  InternalTaskInstance,
} from '@/lib/types/database'
import { resolveAssigneeIds, type AssigneeCandidate } from '@/lib/internal-tasks/schedule'
import { buildSurveySummary, type SurveySummary } from '@/lib/surveys/summary'
import { deliverSurveySummary, surveyResultsPath } from '@/lib/surveys/deliver'
import { notifyUsers } from '@/lib/notifications'

// Server actions for the admin-only Surveys feature. Surveys are internal-task
// templates with task_kind='survey'; responses are ordinary task instances.
// Every mutating action here is gated to admins.

const SETTINGS_PATH = '/dashboard/settings'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || (profile as { role?: string }).role !== 'admin') {
    return { error: 'Only admins can manage surveys.' as const }
  }
  return { supabase, userId: user.id }
}

const resultsPath = surveyResultsPath

/**
 * Distributes a survey to its targeted staff: creates a pending response
 * instance for every resolved assignee that does not already have one, stamps
 * `survey_published_at`, and notifies respondents in-app. Idempotent — safe to
 * call again to reach newly-targeted staff without duplicating or wiping
 * existing responses.
 */
export async function publishSurvey(
  templateId: string,
): Promise<{ ok: boolean; error?: string; invited?: number }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: template } = await supabase
    .from('internal_task_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  const t = template as InternalTaskTemplate | null
  if (!t || t.task_kind !== 'survey') return { ok: false, error: 'Survey not found.' }
  if (t.survey_closed_at) return { ok: false, error: 'This survey is closed.' }

  // Resolve targeted staff from the union targeting fields.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, department_id, status')
    .eq('status', 'active')
    .neq('role', 'client')
  const candidates = (profiles ?? []) as AssigneeCandidate[]
  const assigneeIds = resolveAssigneeIds(t, candidates)
  if (assigneeIds.length === 0) {
    return { ok: false, error: 'No staff match this survey\u2019s audience.' }
  }

  // Skip anyone who already has an instance (avoids duplicates on re-publish).
  const { data: existing } = await supabase
    .from('internal_task_instances')
    .select('user_id')
    .eq('template_id', templateId)
  const have = new Set((existing ?? []).map((r) => (r as { user_id: string }).user_id))
  const toInsert = assigneeIds.filter((id) => !have.has(id))

  if (toInsert.length > 0) {
    const rows = toInsert.map((uid) => ({
      template_id: templateId,
      user_id: uid,
      period_start: null,
      period_end: null,
      due_at: t.survey_closes_at ?? null,
      status: 'pending' as const,
      answers: [],
    }))
    const { error: insErr } = await supabase.from('internal_task_instances').insert(rows)
    if (insErr) return { ok: false, error: insErr.message }
  }

  const { error: upErr } = await supabase
    .from('internal_task_templates')
    .update({
      survey_published_at: t.survey_published_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
  if (upErr) return { ok: false, error: upErr.message }

  // Invite the newly-added respondents in-app (best-effort).
  if (toInsert.length > 0) {
    try {
      await notifyUsers({
        userIds: toInsert,
        title: `Survey: ${t.name}`,
        body: t.survey_closes_at
          ? `Please share your views by ${new Date(t.survey_closes_at).toLocaleDateString('en-GB')}.`
          : 'Please share your views when you have a moment.',
        url: '/dashboard/my-tasks',
        category: 'internal_task',
        createdBy: userId,
        data: { kind: 'survey_invite', templateId },
      })
    } catch (err) {
      console.log('[v0] survey invite notify failed:', (err as Error).message)
    }
  }

  revalidatePath(SETTINGS_PATH)
  revalidatePath('/dashboard/my-tasks')
  return { ok: true, invited: assigneeIds.length }
}

/**
 * Manually closes a survey so it stops accepting responses. Idempotent.
 */
export async function closeSurvey(
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: template } = await supabase
    .from('internal_task_templates')
    .select('id, task_kind, survey_closed_at')
    .eq('id', templateId)
    .single()
  const t = template as Pick<InternalTaskTemplate, 'id' | 'task_kind' | 'survey_closed_at'> | null
  if (!t || t.task_kind !== 'survey') return { ok: false, error: 'Survey not found.' }
  if (t.survey_closed_at) return { ok: true }

  const { error } = await supabase
    .from('internal_task_templates')
    .update({ survey_closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', templateId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(SETTINGS_PATH)
  revalidatePath(resultsPath(templateId))
  return { ok: true }
}

/**
 * Builds the results summary for a survey and returns it (admin-only). Used by
 * the results page. When the survey is anonymous, respondent identities are
 * withheld from the summary.
 */
export async function getSurveyResults(templateId: string): Promise<{
  ok: boolean
  error?: string
  template?: InternalTaskTemplate
  summary?: SurveySummary
  // Names of staff who have NOT yet responded (omitted for anonymous surveys).
  outstanding?: string[]
}> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: template } = await supabase
    .from('internal_task_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  const t = template as InternalTaskTemplate | null
  if (!t || t.task_kind !== 'survey') return { ok: false, error: 'Survey not found.' }

  const { data: instances } = await supabase
    .from('internal_task_instances')
    .select('id, user_id, status, answers')
    .eq('template_id', templateId)
  const rows = (instances ?? []) as Pick<
    InternalTaskInstance,
    'id' | 'user_id' | 'status' | 'answers'
  >[]

  // Resolve names for text-response attribution + the outstanding list.
  const ids = Array.from(new Set(rows.map((r) => r.user_id)))
  const nameById: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
    for (const p of (people ?? []) as Pick<Profile, 'id' | 'full_name'>[]) {
      nameById[p.id] = p.full_name ?? 'Unknown'
    }
  }

  const summary = buildSurveySummary({
    questions: t.questions ?? [],
    instances: rows.map((r) => ({
      status: r.status,
      answers: r.answers ?? [],
      user_id: r.user_id,
    })),
    anonymous: t.survey_anonymous,
    nameById,
  })

  const outstanding = t.survey_anonymous
    ? undefined
    : rows
        .filter((r) => r.status !== 'completed')
        .map((r) => nameById[r.user_id] ?? 'Unknown')
        .sort((a, b) => a.localeCompare(b))

  return { ok: true, template: t, summary, outstanding }
}

/**
 * Sends the results summary to the survey creator + nominated recipients, in-app
 * and by email, and stamps `survey_summary_sent_at`. Can be run manually at any
 * time; the cron also calls the underlying logic once a survey closes.
 */
export async function sendSurveySummary(
  templateId: string,
): Promise<{ ok: boolean; error?: string; recipients?: number }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  const res = await deliverSurveySummary(auth.supabase, templateId)
  if (!res.ok) return res
  revalidatePath(SETTINGS_PATH)
  revalidatePath(resultsPath(templateId))
  return res
}

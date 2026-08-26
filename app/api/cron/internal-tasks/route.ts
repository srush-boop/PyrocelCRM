import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { computePeriod, resolveAssigneeIds, type AssigneeCandidate } from '@/lib/internal-tasks/schedule'
import { deliverSurveySummary } from '@/lib/surveys/deliver'
import type { InternalTaskTemplate } from '@/lib/types/database'

// Runs daily (see vercel.json). For every active internal-task template:
//  1) ensures the current-period instance exists for each assignee,
//  2) marks past-deadline pending instances overdue (+ notifies once/day),
//  3) sends reminders `reminder_days_before` the deadline (+ notifies once/day).
// Idempotent: notifications are guarded per instance per kind per day.
export const dynamic = 'force-dynamic'

function isAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Candidate assignees: all active non-client profiles.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, department_id, status')
    .eq('status', 'active')
    .neq('role', 'client')
  const candidates = (profiles ?? []) as AssigneeCandidate[]

  const { data: templates, error } = await admin
    .from('internal_task_templates')
    .select('*')
    .eq('active', true)
    .eq('task_kind', 'recurring')
  if (error) {
    console.log('[v0] internal-tasks cron template query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let generated = 0
  let reminded = 0
  let markedOverdue = 0

  // 1) Ensure current-period instances exist for all assignees.
  for (const t of (templates ?? []) as InternalTaskTemplate[]) {
    const assigneeIds = resolveAssigneeIds(t, candidates)
    if (assigneeIds.length === 0) continue
    const period = computePeriod(t, now)
    const rows = assigneeIds.map((uid) => ({
      template_id: t.id,
      user_id: uid,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      due_at: period.dueAt,
    }))
    const { error: upErr, count } = await admin
      .from('internal_task_instances')
      .upsert(rows, {
        onConflict: 'template_id,user_id,period_start',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (upErr) {
      console.log('[v0] internal-tasks cron upsert failed:', upErr.message)
    } else {
      generated += count ?? 0
    }
  }

  // 2) Mark overdue: pending instances past their deadline (whose template
  //    warns on overdue) → status overdue + one notification per day.
  const { data: overdueRows } = await admin
    .from('internal_task_instances')
    .select('id, user_id, due_at, template:internal_task_templates(name, warn_overdue, task_kind)')
    .eq('status', 'pending')
    .lt('due_at', now.toISOString())

  for (const row of overdueRows ?? []) {
    const template = Array.isArray(row.template) ? row.template[0] : row.template
    // Surveys close (they don't nag respondents as "overdue") — leave them
    // pending; the survey sweep below handles closing + summarising.
    if ((template as { task_kind?: string } | null)?.task_kind === 'survey') continue
    // Flip status regardless; only notify when the template warns.
    await admin.from('internal_task_instances').update({ status: 'overdue' }).eq('id', row.id)
    markedOverdue += 1
    if (!(template as { warn_overdue?: boolean } | null)?.warn_overdue) continue

    const already = await notifiedToday(admin, todayStart, 'internal_task_overdue', row.id as string, [
      row.user_id as string,
    ])
    if (already) continue
    await notifyUsers({
      userIds: [row.user_id as string],
      title: 'Internal task overdue',
      body: `${(template as { name?: string } | null)?.name ?? 'A task'} is now overdue.`,
      url: '/dashboard/my-tasks',
      category: 'internal_task',
      data: { kind: 'internal_task_overdue', instanceId: row.id },
    })
    reminded += 1
  }

  // 3) Reminders: pending instances due within their template's reminder window.
  const { data: pending } = await admin
    .from('internal_task_instances')
    .select('id, user_id, due_at, template:internal_task_templates(name, reminder_days_before)')
    .eq('status', 'pending')
    .gte('due_at', now.toISOString())

  for (const row of pending ?? []) {
    const template = Array.isArray(row.template) ? row.template[0] : row.template
    const windows = ((template as { reminder_days_before?: number[] } | null)?.reminder_days_before ?? [])
    if (windows.length === 0) continue
    const daysUntil = Math.ceil((new Date(row.due_at as string).getTime() - now.getTime()) / 86_400_000)
    if (!windows.includes(daysUntil)) continue

    const already = await notifiedToday(admin, todayStart, 'internal_task_reminder', row.id as string, [
      row.user_id as string,
    ])
    if (already) continue
    await notifyUsers({
      userIds: [row.user_id as string],
      title: 'Internal task due soon',
      body: `${(template as { name?: string } | null)?.name ?? 'A task'} is due in ${daysUntil} day(s).`,
      url: '/dashboard/my-tasks',
      category: 'internal_task',
      data: { kind: 'internal_task_reminder', instanceId: row.id },
    })
    reminded += 1
  }

  // 4) Surveys: auto-close any past their close date, then post the results
  //    summary for closed surveys whose summary has not yet been sent.
  let surveysClosed = 0
  let surveysSummarised = 0
  try {
    // Auto-close: close date reached and not already closed.
    const { data: toClose } = await admin
      .from('internal_task_templates')
      .select('id')
      .eq('task_kind', 'survey')
      .not('survey_closes_at', 'is', null)
      .lte('survey_closes_at', now.toISOString())
      .is('survey_closed_at', null)
    for (const s of toClose ?? []) {
      await admin
        .from('internal_task_templates')
        .update({ survey_closed_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', (s as { id: string }).id)
      surveysClosed += 1
    }

    // Auto-send summary: closed surveys with no summary sent yet.
    const { data: toSummarise } = await admin
      .from('internal_task_templates')
      .select('id')
      .eq('task_kind', 'survey')
      .not('survey_closed_at', 'is', null)
      .is('survey_summary_sent_at', null)
    for (const s of toSummarise ?? []) {
      const res = await deliverSurveySummary(admin, (s as { id: string }).id)
      if (res.ok) surveysSummarised += 1
    }
  } catch (err) {
    console.log('[v0] survey sweep failed:', (err as Error).message)
  }

  return NextResponse.json({
    ok: true,
    generated,
    reminded,
    markedOverdue,
    surveysClosed,
    surveysSummarised,
  })
}

// Idempotency guard: has this instance already produced a notification of this
// kind for these recipients today?
async function notifiedToday(
  admin: ReturnType<typeof createAdminClient>,
  todayStart: Date,
  kind: string,
  instanceId: string,
  recipients: string[],
): Promise<boolean> {
  const { data } = await admin
    .from('notifications')
    .select('user_id')
    .eq('category', 'internal_task')
    .eq('data->>kind', kind)
    .eq('data->>instanceId', instanceId)
    .gte('created_at', todayStart.toISOString())
    .in('user_id', recipients)
  return (data ?? []).length >= recipients.length
}

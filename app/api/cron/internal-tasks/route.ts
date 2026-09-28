import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { computePeriod, resolveAssigneeIds, type AssigneeCandidate } from '@/lib/internal-tasks/schedule'
import { deliverSurveySummary } from '@/lib/surveys/deliver'
import { computeCompletionReport } from '@/lib/internal-tasks/report-data'
import { renderCompletionReportHtml } from '@/lib/internal-tasks/completion-report'
import { dueReportWindow } from '@/lib/internal-tasks/report-schedule'
import { deliverScheduledReport } from '@/lib/internal-tasks/deliver-report'
import { sendEmail } from '@/lib/email/send-email'
import { getPublicBaseUrl } from '@/lib/rams/base-url'
import type { InternalTaskTemplate, InternalTaskReportSchedule } from '@/lib/types/database'

type ReminderContact = {
  id: string
  full_name: string | null
  email: string | null
  manager_id: string | null
  status: string | null
}

type OverdueTemplate = {
  name?: string
  warn_overdue?: boolean
  task_kind?: string
  email_reminders?: boolean
  overdue_repeat_days?: number
  overdue_notify_manager?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

async function sendReminderEmail(
  to: string,
  msg: { heading: string; intro: string; ctaUrl: string; ctaLabel: string },
): Promise<void> {
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;max-width:560px">
      <h2 style="margin:0 0 8px">${escapeHtml(msg.heading)}</h2>
      <p style="margin:0 0 16px">${escapeHtml(msg.intro)}</p>
      <p style="margin:0 0 16px">
        <a href="${escapeHtml(msg.ctaUrl)}" style="display:inline-block;background:#c8102e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(msg.ctaLabel)}</a>
      </p>
      <p style="margin:0;color:#666;font-size:12px">Sent automatically by PyrocelCRM Tasks &amp; Forms.</p>
    </div>`
  try {
    await sendEmail(to, msg.heading, html)
  } catch (err) {
    console.log('[v0] internal-tasks reminder email failed:', (err as Error).message)
  }
}

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
      // attempt 0 = the scheduled instance (extras are created on demand).
      attempt: 0,
    }))
    const { error: upErr, count } = await admin
      .from('internal_task_instances')
      .upsert(rows, {
        onConflict: 'template_id,user_id,period_start,attempt',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (upErr) {
      console.log('[v0] internal-tasks cron upsert failed:', upErr.message)
    } else {
      generated += count ?? 0
    }
  }

  // Contact directory for reminder emails + line-manager escalation.
  const { data: contactRows } = await admin
    .from('profiles')
    .select('id, full_name, email, manager_id, status')
  const contacts = new Map<string, ReminderContact>(
    ((contactRows ?? []) as ReminderContact[]).map((p) => [p.id, p]),
  )
  const baseUrl = getPublicBaseUrl()

  // 2) Overdue: open instances past their deadline. Newly-late pending rows
  //    flip to overdue and notify; already-overdue rows re-notify every
  //    `overdue_repeat_days` days. Assignee always; line manager if configured;
  //    email as well when `email_reminders` is on. Guarded once/day/instance.
  const { data: overdueRows } = await admin
    .from('internal_task_instances')
    .select(
      'id, user_id, due_at, status, template:internal_task_templates(name, warn_overdue, task_kind, email_reminders, overdue_repeat_days, overdue_notify_manager)',
    )
    .in('status', ['pending', 'overdue'])
    .lt('due_at', now.toISOString())

  for (const row of overdueRows ?? []) {
    const template = (Array.isArray(row.template) ? row.template[0] : row.template) as OverdueTemplate | null
    // Surveys close (they don't nag respondents as "overdue") — leave them
    // pending; the survey sweep below handles closing + summarising.
    if (template?.task_kind === 'survey') continue

    const justWentOverdue = row.status === 'pending'
    if (justWentOverdue) {
      await admin.from('internal_task_instances').update({ status: 'overdue' }).eq('id', row.id)
      markedOverdue += 1
    }
    if (!template?.warn_overdue) continue

    const daysOverdue = Math.floor((now.getTime() - new Date(row.due_at as string).getTime()) / 86_400_000)
    const repeat = template.overdue_repeat_days ?? 0
    const repeatDue = repeat > 0 && daysOverdue > 0 && daysOverdue % repeat === 0
    if (!justWentOverdue && !repeatDue) continue

    const assigneeId = row.user_id as string
    const already = await notifiedToday(admin, todayStart, 'internal_task_overdue', row.id as string, [assigneeId])
    if (already) continue

    const name = template.name ?? 'A task'
    const assignee = contacts.get(assigneeId)
    const lateLabel = daysOverdue >= 1 ? `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` : 'now overdue'

    await notifyUsers({
      userIds: [assigneeId],
      title: 'Task overdue',
      body: `${name} is ${lateLabel}.`,
      url: '/dashboard/my-tasks',
      category: 'internal_task',
      data: { kind: 'internal_task_overdue', instanceId: row.id },
    })
    if (template.email_reminders && assignee?.email) {
      await sendReminderEmail(assignee.email, {
        heading: `${name} is ${lateLabel}`,
        intro: `Hi ${assignee.full_name ?? 'there'}, this task/form was due ${formatDue(row.due_at as string)} and hasn't been completed yet.`,
        ctaUrl: `${baseUrl}/dashboard/my-tasks`,
        ctaLabel: 'Complete it now',
      })
    }

    // Line-manager escalation.
    const manager = template.overdue_notify_manager && assignee?.manager_id ? contacts.get(assignee.manager_id) : null
    if (manager && manager.status === 'active' && manager.id !== assigneeId) {
      const who = assignee?.full_name ?? 'A team member'
      await notifyUsers({
        userIds: [manager.id],
        title: 'Team member task overdue',
        body: `${who}'s "${name}" is ${lateLabel}.`,
        url: `/dashboard/internal-tasks/submissions?instance=${row.id}`,
        category: 'internal_task',
        data: { kind: 'internal_task_overdue_manager', instanceId: row.id },
      })
      if (manager.email) {
        await sendReminderEmail(manager.email, {
          heading: `${who}'s ${name} is ${lateLabel}`,
          intro: `You're receiving this as ${who}'s line manager. "${name}" was due ${formatDue(row.due_at as string)} and is still outstanding.`,
          ctaUrl: `${baseUrl}/dashboard/internal-tasks/submissions?instance=${row.id}`,
          ctaLabel: 'View task',
        })
      }
    }
    reminded += 1
  }

  // 3) Reminders: pending instances due within their template's reminder window.
  const { data: pending } = await admin
    .from('internal_task_instances')
    .select('id, user_id, due_at, template:internal_task_templates(name, reminder_days_before, email_reminders)')
    .eq('status', 'pending')
    .gte('due_at', now.toISOString())

  for (const row of pending ?? []) {
    const template = (Array.isArray(row.template) ? row.template[0] : row.template) as {
      name?: string
      reminder_days_before?: number[]
      email_reminders?: boolean
    } | null
    const windows = template?.reminder_days_before ?? []
    if (windows.length === 0) continue
    const daysUntil = Math.ceil((new Date(row.due_at as string).getTime() - now.getTime()) / 86_400_000)
    if (!windows.includes(daysUntil)) continue

    const already = await notifiedToday(admin, todayStart, 'internal_task_reminder', row.id as string, [
      row.user_id as string,
    ])
    if (already) continue
    const name = template?.name ?? 'A task'
    await notifyUsers({
      userIds: [row.user_id as string],
      title: 'Task due soon',
      body: `${name} is due in ${daysUntil} day(s).`,
      url: '/dashboard/my-tasks',
      category: 'internal_task',
      data: { kind: 'internal_task_reminder', instanceId: row.id },
    })
    const assignee = contacts.get(row.user_id as string)
    if (template?.email_reminders && assignee?.email) {
      await sendReminderEmail(assignee.email, {
        heading: `${name} is due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}`,
        intro: `Hi ${assignee.full_name ?? 'there'}, a reminder that this task/form is due ${formatDue(row.due_at as string)}.`,
        ctaUrl: `${baseUrl}/dashboard/my-tasks`,
        ctaLabel: 'Open my tasks',
      })
    }
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

  // 5) Monthly completion report: on the 1st of the month, email last month's
  //    report to all active admins. Idempotent via a global_config marker so it
  //    sends once per month even if the daily cron runs repeatedly.
  let reportSent = false
  try {
    if (now.getUTCDate() === 1) {
      const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const targetKey = `${prevMonthStart.getUTCFullYear()}-${String(
        prevMonthStart.getUTCMonth() + 1,
      ).padStart(2, '0')}`

      const { data: marker } = await admin
        .from('global_config')
        .select('value')
        .eq('key', 'internal_task_report_last_sent')
        .maybeSingle()
      const lastSent = (marker as { value?: unknown } | null)?.value

      if (lastSent !== targetKey) {
        const report = await computeCompletionReport(admin, prevMonthStart)
        const html = renderCompletionReportHtml(report)
        const subject = `Internal tasks completion report — ${report.monthLabel}`

        const { data: admins } = await admin
          .from('profiles')
          .select('id, email')
          .eq('role', 'admin')
          .eq('status', 'active')
        const recipients = (admins ?? []) as Array<{ id: string; email: string | null }>

        for (const r of recipients) {
          if (!r.email) continue
          try {
            await sendEmail(r.email, subject, html)
          } catch (err) {
            console.log('[v0] monthly report email failed:', (err as Error).message)
          }
        }
        if (recipients.length > 0) {
          await notifyUsers({
            userIds: recipients.map((r) => r.id),
            title: `Completion report — ${report.monthLabel}`,
            body: `${report.totalCompleted}/${report.totalAllocated} tasks completed · ${report.nonCompleters.length} people with outstanding tasks · ${report.flags.length} flagged items.`,
            url: '/dashboard/internal-tasks/submissions',
            category: 'internal_task_report',
          })
        }

        await admin
          .from('global_config')
          .upsert(
            {
              key: 'internal_task_report_last_sent',
              value: targetKey,
              updated_at: now.toISOString(),
            },
            { onConflict: 'key' },
          )
        reportSent = true
      }
    }
  } catch (err) {
    console.log('[v0] monthly report sweep failed:', (err as Error).message)
  }

  // 6) Configurable scheduled reports: for each active schedule whose cadence
  //    lands today, email its windowed report to the nominated recipients.
  //    Idempotent via last_period_key so a repeated daily run never double-sends.
  let schedulesSent = 0
  try {
    const { data: schedules } = await admin
      .from('internal_task_report_schedules')
      .select('*, template:internal_task_templates(name)')
      .eq('active', true)

    for (const s of (schedules ?? []) as InternalTaskReportSchedule[]) {
      const window = dueReportWindow(now, s.frequency, s.day_of_week, s.day_of_month)
      if (!window) continue
      if (s.last_period_key === window.periodKey) continue
      try {
        await deliverScheduledReport(admin, s, window)
        await admin
          .from('internal_task_report_schedules')
          .update({ last_period_key: window.periodKey, last_sent_at: now.toISOString() })
          .eq('id', s.id)
        schedulesSent += 1
      } catch (err) {
        console.log('[v0] scheduled report send failed:', (err as Error).message)
      }
    }
  } catch (err) {
    console.log('[v0] scheduled report sweep failed:', (err as Error).message)
  }

  return NextResponse.json({
    ok: true,
    generated,
    reminded,
    markedOverdue,
    surveysClosed,
    surveysSummarised,
    reportSent,
    schedulesSent,
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

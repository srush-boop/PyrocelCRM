import type { SupabaseClient } from '@supabase/supabase-js'
import type { InternalTaskReportSchedule } from '@/lib/types/database'
import { computeScheduledReport } from './report-data'
import { renderCompletionReportHtml } from './completion-report'
import type { ReportWindow } from './report-schedule'

// ============================================================================
// Internal Tasks — scheduled report delivery
// Builds the windowed completion report for a schedule and emails it to its
// resolved recipients (explicit users + whole roles + raw email addresses),
// plus an in-app notification for known users. Works with either the session
// client (manual "send now") or the admin client (cron), since it takes the
// client as an argument. Does NOT stamp idempotency markers — the caller owns
// that so a manual send never blocks the automatic one.
// ============================================================================

export async function deliverScheduledReport(
  client: SupabaseClient,
  schedule: InternalTaskReportSchedule,
  window: ReportWindow,
): Promise<{ ok: boolean; sent: number; error?: string }> {
  const report = await computeScheduledReport(client, {
    start: window.start,
    end: window.end,
    periodLabel: window.label,
    templateId: schedule.template_id,
  })
  const html = renderCompletionReportHtml(report)

  // Dedup emails case-insensitively but keep the original casing to send.
  const emails = new Map<string, string>()
  const notifyUserIds = new Set<string>()

  const collect = (rows: Array<{ id: string; email: string | null }>) => {
    for (const p of rows) {
      notifyUserIds.add(p.id)
      if (p.email) emails.set(p.email.toLowerCase(), p.email)
    }
  }

  if (schedule.recipient_user_ids.length > 0) {
    const { data } = await client
      .from('profiles')
      .select('id, email')
      .in('id', schedule.recipient_user_ids)
    collect((data ?? []) as Array<{ id: string; email: string | null }>)
  }
  if (schedule.recipient_role_names.length > 0) {
    const { data } = await client
      .from('profiles')
      .select('id, email')
      .in('role', schedule.recipient_role_names)
      .eq('status', 'active')
    collect((data ?? []) as Array<{ id: string; email: string | null }>)
  }
  for (const raw of schedule.recipient_emails) {
    const e = raw.trim()
    if (e) emails.set(e.toLowerCase(), e)
  }

  const scopeName = schedule.template?.name ?? 'All tasks & forms'
  const subject = `Report: ${scopeName} — ${window.label}`

  const { sendEmail } = await import('@/lib/email/send-email')
  let sent = 0
  for (const email of emails.values()) {
    try {
      await sendEmail(email, subject, html)
      sent += 1
    } catch (err) {
      console.log('[v0] scheduled report email failed:', (err as Error).message)
    }
  }

  if (notifyUserIds.size > 0) {
    try {
      const { notifyUsers } = await import('@/lib/notifications')
      await notifyUsers({
        userIds: Array.from(notifyUserIds),
        title: `Report: ${scopeName}`,
        body: `${report.totalCompleted}/${report.totalAllocated} responses · ${report.nonCompleters.length} outstanding · ${report.flags.length} flagged (${window.label}).`,
        url: '/dashboard/internal-tasks/submissions',
        category: 'internal_task_report',
      })
    } catch (err) {
      console.log('[v0] scheduled report notify failed:', (err as Error).message)
    }
  }

  return { ok: true, sent }
}

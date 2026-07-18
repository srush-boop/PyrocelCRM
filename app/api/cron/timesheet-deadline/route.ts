import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { isTimesheetRequired } from '@/lib/types/database'
import { weekEndingFor, fmtDate } from '@/lib/timesheets/compute'
import type { Role } from '@/lib/types/database'

// Timesheet deadline / reminder cron. Intended to run each morning (see
// vercel.json). It:
//   - On Sunday + Monday morning, reminds users with a still-draft sheet for the
//     week that the Mon 09:00 deadline is approaching / has arrived.
//   - After the Mon 09:00 deadline, flags any unsubmitted sheet for the just-
//     ended week as `late` and notifies the user + their manager. (Sheets stay
//     submittable; `late` is just a flag.)
//
// Idempotent: reminder notifications are de-duplicated per user+week+kind using
// the notification `data` payload, mirroring the asset-checks cron.

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // allow when unset (dev)
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // The week that ends on the most recent / current Sunday.
  const currentWeekEnding = weekEndingFor(now)
  // The just-ended week (previous Sunday) — its deadline is this Monday 09:00.
  const prevSunday = new Date(now)
  const day = prevSunday.getDay() // 0=Sun
  // Move back to the previous Sunday (if today is Sun, that's today).
  prevSunday.setDate(prevSunday.getDate() - day)
  const justEndedWeek = fmtDate(prevSunday)

  // Who needs timesheets? Load active profiles with role ref for inheritance.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, manager_id, timesheet_required, role_id, status')
    .eq('status', 'active')

  const { data: roles } = await admin.from('roles').select('*')
  const roleById = new Map<string, Role>()
  for (const r of (roles as Role[]) ?? []) roleById.set(r.id, r)

  const required = ((profiles as any[]) ?? []).filter((p) =>
    isTimesheetRequired({
      timesheet_required: p.timesheet_required ?? null,
      role_ref: p.role_id ? roleById.get(p.role_id) ?? null : null,
    }),
  )
  if (required.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const requiredIds = required.map((p) => p.id)

  // Deadline for the just-ended week = Monday 09:00 after it.
  const deadline = new Date(prevSunday)
  deadline.setDate(prevSunday.getDate() + 1)
  deadline.setHours(9, 0, 0, 0)
  const pastDeadline = now > deadline

  let lateFlagged = 0
  let reminders = 0

  // --- 1) Late flag after deadline for the just-ended week ---
  if (pastDeadline) {
    // Existing sheets for the week that are still draft → flag late.
    const { data: draftSheets } = await admin
      .from('timesheets')
      .select('id, user_id, status, late')
      .eq('week_ending', justEndedWeek)
      .eq('status', 'draft')
      .in('user_id', requiredIds)

    for (const sheet of (draftSheets as any[]) ?? []) {
      if (!sheet.late) {
        await admin.from('timesheets').update({ late: true }).eq('id', sheet.id)
      }
      lateFlagged += 1
      const profile = required.find((p) => p.id === sheet.user_id)
      const recipients = [sheet.user_id, profile?.manager_id].filter(Boolean) as string[]
      await notifyOnce(admin, recipients, {
        week: justEndedWeek,
        kind: 'timesheet_late',
        title: 'Timesheet overdue',
        body: `The timesheet for week ending ${justEndedWeek} is past the Monday 09:00 deadline and still needs submitting.`,
        url: '/dashboard/timesheet',
      })
    }

    // Users with NO sheet at all for the week → remind them to complete one.
    const haveSheet = new Set(((draftSheets as any[]) ?? []).map((s) => s.user_id))
    const { data: allWeekSheets } = await admin
      .from('timesheets')
      .select('user_id')
      .eq('week_ending', justEndedWeek)
      .in('user_id', requiredIds)
    for (const row of (allWeekSheets as any[]) ?? []) haveSheet.add(row.user_id)

    for (const p of required) {
      if (haveSheet.has(p.id)) continue
      const recipients = [p.id, p.manager_id].filter(Boolean) as string[]
      const sent = await notifyOnce(admin, recipients, {
        week: justEndedWeek,
        kind: 'timesheet_missing',
        title: 'Timesheet overdue',
        body: `No timesheet has been started for week ending ${justEndedWeek}. Please complete and submit it.`,
        url: '/dashboard/timesheet',
      })
      if (sent) reminders += 1
    }
  } else {
    // --- 2) Pre-deadline reminder (Sun/Mon morning) for the current week ---
    const dow = now.getDay() // 0=Sun, 1=Mon
    if (dow === 0 || dow === 1) {
      const { data: submitted } = await admin
        .from('timesheets')
        .select('user_id')
        .eq('week_ending', currentWeekEnding)
        .in('status', ['submitted', 'approved'])
        .in('user_id', requiredIds)
      const done = new Set(((submitted as any[]) ?? []).map((s) => s.user_id))

      for (const p of required) {
        if (done.has(p.id)) continue
        const sent = await notifyOnce(admin, [p.id], {
          week: currentWeekEnding,
          kind: `timesheet_reminder_${dow}`,
          title: 'Timesheet due soon',
          body: `Your timesheet for week ending ${currentWeekEnding} is due by Monday 09:00. Please review and submit it.`,
          url: '/dashboard/timesheet',
        })
        if (sent) reminders += 1
      }
    }
  }

  return NextResponse.json({ ok: true, lateFlagged, reminders })
}

/**
 * Sends a notification only once per (user, week, kind), using a marker row in
 * the notifications table (data payload) to guarantee idempotency across cron
 * runs. Returns true if it sent (i.e. wasn't already sent).
 */
async function notifyOnce(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  opts: { week: string; kind: string; title: string; body: string; url: string },
): Promise<boolean> {
  const recipients = Array.from(new Set(userIds.filter(Boolean)))
  if (recipients.length === 0) return false

  // Check whether we've already notified any of these users for this marker.
  const { data: existing } = await admin
    .from('notifications')
    .select('user_id')
    .eq('category', 'timesheet')
    .eq('data->>ts_kind', opts.kind)
    .eq('data->>ts_week', opts.week)
    .in('user_id', recipients)

  const alreadyDone = new Set(((existing as any[]) ?? []).map((n) => n.user_id))
  const toSend = recipients.filter((id) => !alreadyDone.has(id))
  if (toSend.length === 0) return false

  await notifyUsers({
    userIds: toSend,
    title: opts.title,
    body: opts.body,
    url: opts.url,
    category: 'timesheet',
    data: { ts_week: opts.week, ts_kind: opts.kind },
  })
  return true
}

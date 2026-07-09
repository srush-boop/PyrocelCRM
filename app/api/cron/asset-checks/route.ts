import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { dueStatus, daysUntil } from '@/lib/assets'

// Runs daily (see vercel.json). Notifies the responsible person about asset
// checks that are overdue or due within the next 14 days. Idempotent: each
// schedule triggers at most one notification per recipient per day (guarded by
// checking for an existing same-URL notification created today).
export const dynamic = 'force-dynamic'

function isAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Active schedules on non-disposed assets, with the asset + holder.
  const { data: schedules, error } = await admin
    .from('asset_check_schedules')
    .select(
      `id, name, next_due_date, responsible,
       asset:assets!inner(id, urn, name, status, assigned_to)`,
    )
    .eq('active', true)

  if (error) {
    console.log('[v0] asset-checks cron query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Asset managers (fallback recipients + manager-responsible checks).
  const { data: managers } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'office'])
  const managerIds = (managers ?? []).map((m) => m.id as string)

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  let notified = 0

  for (const s of schedules ?? []) {
    const asset = Array.isArray(s.asset) ? s.asset[0] : s.asset
    if (!asset || asset.status === 'disposed') continue

    const status = dueStatus(s.next_due_date)
    if (status !== 'overdue' && status !== 'due_soon') continue

    // Choose recipients: the holder if the check is holder-responsible and the
    // asset is assigned; otherwise the asset managers.
    let recipients: string[] = []
    if (s.responsible === 'holder' && asset.assigned_to) {
      recipients = [asset.assigned_to as string]
    } else {
      recipients = managerIds
    }
    if (recipients.length === 0) continue

    const url = `/dashboard/assets/${asset.urn}`
    const diff = daysUntil(s.next_due_date)
    const overdue = status === 'overdue'
    const title = overdue ? 'Asset check overdue' : 'Asset check due soon'
    const body = overdue
      ? `${s.name} for ${asset.name} was due ${Math.abs(diff ?? 0)} day(s) ago.`
      : `${s.name} for ${asset.name} is due in ${diff} day(s).`

    // Idempotency: skip recipients already reminded about THIS schedule today.
    // Keyed on the schedule id in `data` (not the url) so distinct schedules on
    // the same asset — and unrelated asset notifications like assignment alerts
    // that share the asset url — don't suppress this reminder.
    const { data: existing } = await admin
      .from('notifications')
      .select('user_id')
      .eq('category', 'asset')
      .eq('data->>kind', 'asset_check_due')
      .eq('data->>scheduleId', s.id)
      .gte('created_at', todayStart.toISOString())
      .in('user_id', recipients)

    const alreadyNotified = new Set((existing ?? []).map((n) => n.user_id as string))
    const toNotify = recipients.filter((r) => !alreadyNotified.has(r))
    if (toNotify.length === 0) continue

    await notifyUsers({
      userIds: toNotify,
      title,
      body,
      url,
      category: 'asset',
      data: { kind: 'asset_check_due', scheduleId: s.id },
    })
    notified += toNotify.length
  }

  return NextResponse.json({ ok: true, notified })
}

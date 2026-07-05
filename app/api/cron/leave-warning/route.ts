import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeLeaveBalances } from '@/lib/leave'
import { notifyUsers } from '@/lib/notifications'

// Runs daily (see vercel.json) but only sends warnings during November. Each
// manager is notified at most once per report per year, so repeated daily runs
// are idempotent. Guarded by CRON_SECRET.
export const dynamic = 'force-dynamic'

function isAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  // Month is 0-indexed: 10 = November. Skip silently outside November so the
  // daily schedule is a no-op for the rest of the year.
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (now.getUTCMonth() !== 10 && !force) {
    return NextResponse.json({ ok: true, skipped: 'not November', month: now.getUTCMonth() })
  }

  const admin = createAdminClient()

  // Active users with a nominated manager.
  const { data: users } = await admin
    .from('profiles')
    .select('id, full_name, email, manager_id, status')
    .not('manager_id', 'is', null)

  const balances = await computeLeaveBalances(year)

  // Only warn for users who still have entitlement left to use.
  const candidates = (users ?? []).filter((u) => {
    if (u.status && u.status !== 'active') return false
    const bal = balances.get(u.id as string)
    return bal != null && bal.remainingDays != null && bal.remainingDays > 0
  })

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, warned: 0, note: 'no candidates' })
  }

  // Dedupe: find leave reminders already sent this year for these reports.
  const { data: existing } = await admin
    .from('notifications')
    .select('data')
    .eq('category', 'leave')
    .contains('data', { kind: 'leave_reminder', year })

  const alreadyWarned = new Set<string>(
    (existing ?? [])
      .map((n) => (n.data as { subjectUserId?: string })?.subjectUserId)
      .filter(Boolean) as string[],
  )

  let warned = 0
  for (const u of candidates) {
    const userId = u.id as string
    if (alreadyWarned.has(userId)) continue
    const bal = balances.get(userId)!
    const remaining = bal.remainingDays!
    const name = (u.full_name as string) || (u.email as string) || 'An employee'
    const dayLabel = remaining === 1 ? 'day' : 'days'

    await notifyUsers({
      userIds: [u.manager_id as string],
      title: 'Annual leave reminder',
      body: `${name} still has ${remaining} ${dayLabel} of annual leave to use before 31 December ${year}.`,
      url: '/dashboard/engineers',
      category: 'leave',
      data: {
        kind: 'leave_reminder',
        year,
        subjectUserId: userId,
        remainingDays: remaining,
      },
    })
    warned += 1
  }

  return NextResponse.json({ ok: true, warned, year })
}

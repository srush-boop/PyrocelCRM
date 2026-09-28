import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateSessionRow, SESSION_COLS, type SessionRow } from '@/lib/lone-worker/engine'

// Runs every minute (see vercel.json). Advances every active lone-worker
// session's state machine so warnings/emergencies are raised even if the
// worker's device is closed. Sessions are NEVER auto-finished: once the planned
// shift end passes the worker gets a one-off "still working?" prompt (finish or
// extend) and check-ins continue until they act. Idempotent + CRON_SECRET-guarded.
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
  const now = new Date()

  const { data } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('status', 'active')
  const sessions = (data ?? []) as SessionRow[]

  let escalated = 0
  for (const s of sessions) {
    const res = await evaluateSessionRow(admin, s, now)
    if (res.changed && (res.state === 'amber' || res.state === 'red')) escalated += 1
  }

  return NextResponse.json({ ok: true, active: sessions.length, escalated })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

/**
 * Best-effort login audit hook. The login form calls this right after a
 * successful sign-in (the session cookie is set by then, so we can resolve the
 * user server-side and capture the IP + user-agent). Supabase's own auth log
 * already records the authentication event; this mirrors it into our app-level
 * audit trail for a single, admin-readable view.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Only log when there is a genuine authenticated session.
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  await logAudit({
    action: 'auth.login',
    entityType: 'profile',
    entityId: user.id,
    targetLabel: user.email ?? undefined,
    actor: { id: user.id, email: user.email },
    request: req,
  })

  return NextResponse.json({ ok: true })
}

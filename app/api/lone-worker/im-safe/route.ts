import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resetSessionCycle, type SessionRow } from '@/lib/lone-worker/engine'

const SESSION_COLS =
  'id, user_id, shift_start, shift_end, checkin_interval_minutes, amber_minutes, red_minutes, status, prompt_state, last_checkin_at, next_prompt_at, amber_at, red_at, last_lat, last_lng, location_updated_at, created_at, finished_at'

/**
 * "I'm safe" acknowledgement that can be triggered directly from a push
 * notification action button — including from a paired Android/Wear OS watch —
 * without opening the app. The service worker POSTs here with the session
 * cookie (same-origin fetch), so we authenticate the caller and reset their
 * active lone-worker check-in cycle exactly like the in-app "I'm safe" button.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('lone_worker_sessions')
    .select(SESSION_COLS)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  const session = (data as SessionRow | null) ?? null
  if (!session) {
    // No active shift — nothing to acknowledge, but treat as success so the
    // watch shows a confirmation rather than an error.
    return NextResponse.json({ ok: true, note: 'no-active-shift' })
  }

  await resetSessionCycle(admin, session, { via: 'self', by: user.id })
  return NextResponse.json({ ok: true })
}

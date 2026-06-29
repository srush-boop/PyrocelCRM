import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Returns the current user's most recent notifications + unread count.
// Polled by the header bell via SWR.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ notifications: [], unread: 0 }, { status: 200 })
  }

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, url, category, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const unread = (notifications ?? []).filter((n) => !n.read_at).length

  return NextResponse.json({ notifications: notifications ?? [], unread })
}

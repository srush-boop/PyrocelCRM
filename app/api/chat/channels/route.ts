import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listChannels } from '@/lib/chat/queries'

/** Channel list with unread counts + previews, for the sidebar (SWR polling). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const channels = await listChannels(user.id)
  return NextResponse.json({ channels })
}

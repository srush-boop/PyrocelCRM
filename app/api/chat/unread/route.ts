import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChatUnreadCount } from '@/lib/chat/queries'

/** Total unread chat messages for the signed-in user (header badge polling). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const count = await getChatUnreadCount(user.id)
  return NextResponse.json({ count })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWaitingForYou, totalWaiting } from '@/lib/todo/waiting-for-you'
import type { UserRole } from '@/lib/types/database'

// The aggregated "waiting on you" inbox. Split out from /api/todo because it
// fans out across approvals, chat, requests and notifications — far heavier
// than the personal to-do query — so it can poll and revalidate independently.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = ((profile?.role as UserRole) ?? 'engineer') as UserRole

  const buckets = await getWaitingForYou(user.id, role)

  return NextResponse.json({
    buckets,
    totalWaiting: totalWaiting(buckets),
    currentUserId: user.id,
  })
}

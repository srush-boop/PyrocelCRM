import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWaitingForYou, totalWaiting } from '@/lib/todo/waiting-for-you'
import { getTodoData } from '@/lib/todo/queries'
import type { UserRole } from '@/lib/types/database'

// Returns everything the To-Do panel and page need in one round-trip:
// the aggregated "waiting for you" buckets plus the user's personal to-dos.
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

  const [buckets, todo] = await Promise.all([
    getWaitingForYou(user.id, role),
    getTodoData(user.id),
  ])

  return NextResponse.json({
    buckets,
    totalWaiting: totalWaiting(buckets),
    lists: todo.lists,
    items: todo.items,
    assignees: todo.assignees,
    currentUserId: user.id,
  })
}

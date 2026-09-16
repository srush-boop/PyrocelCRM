import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTodoData } from '@/lib/todo/queries'

// Returns the user's personal to-dos (lists, items, assignees, attachments).
// Kept deliberately cheap and separate from the heavier "waiting on you"
// aggregation (see /api/todo/waiting) so ticking or deleting an item only
// re-runs this fast query, not every approval/chat/notification source.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todo = await getTodoData(user.id)

  return NextResponse.json({
    lists: todo.lists,
    items: todo.items,
    assignees: todo.assignees,
    attachments: todo.attachments,
    currentUserId: user.id,
  })
}

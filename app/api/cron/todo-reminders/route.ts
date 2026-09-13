import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import type { TodoItem } from '@/lib/types/database'

// Runs frequently (see vercel.json). Sends a single due-date reminder for any
// open to-do whose due time has arrived and that hasn't been reminded yet.
// The reminder goes to the owner plus anyone who accepted the to-do, and rides
// the shared notifyUsers path so it also fires web/native push. Idempotent via
// the reminded_at stamp — each to-do reminds at most once.
export const dynamic = 'force-dynamic'

function isAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function fmtDue(iso: string, allDay: boolean): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (allDay) return `today (${date})`
  return `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export async function GET(req: Request) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Due-or-overdue open to-dos that still need a reminder.
  const { data: due, error } = await admin
    .from('todo_items')
    .select('*')
    .eq('status', 'open')
    .is('reminded_at', null)
    .not('due_at', 'is', null)
    .lte('due_at', now)
    .limit(200)
  if (error) {
    console.log('[v0] todo-reminders query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (due ?? []) as TodoItem[]
  if (items.length === 0) return NextResponse.json({ reminded: 0 })

  // Load accepted collaborators for these items in one pass.
  const ids = items.map((i) => i.id)
  const { data: aRows } = await admin
    .from('todo_item_assignees')
    .select('item_id, user_id, response')
    .in('item_id', ids)
  const acceptedByItem = new Map<string, string[]>()
  for (const r of (aRows ?? []) as {
    item_id: string
    user_id: string
    response: string
  }[]) {
    if (r.response === 'declined') continue
    const arr = acceptedByItem.get(r.item_id) ?? []
    arr.push(r.user_id)
    acceptedByItem.set(r.item_id, arr)
  }

  let reminded = 0
  for (const item of items) {
    const recipients = Array.from(
      new Set([item.owner_id, ...(acceptedByItem.get(item.id) ?? [])]),
    )
    await notifyUsers({
      userIds: recipients,
      title: 'To-do reminder',
      body: `${item.title} — due ${fmtDue(item.due_at as string, item.all_day)}`,
      url: '/dashboard/todo',
      category: 'todo',
    })
    await admin.from('todo_items').update({ reminded_at: now }).eq('id', item.id)
    reminded += 1
  }

  return NextResponse.json({ reminded })
}

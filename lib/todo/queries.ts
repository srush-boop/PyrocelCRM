import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { TodoAttachment, TodoItem, TodoList } from '@/lib/types/database'

// A person attached to a to-do, joined with their display name for the UI.
export interface TodoAssigneeView {
  user_id: string
  role: 'assignee' | 'invitee'
  response: 'pending' | 'accepted' | 'declined'
  full_name: string | null
}

export interface TodoData {
  lists: TodoList[]
  items: TodoItem[]
  // item_id -> people on that item
  assignees: Record<string, TodoAssigneeView[]>
  // item_id -> files/emails attached to that item
  attachments: Record<string, TodoAttachment[]>
}

/**
 * Loads the signed-in user's to-do lists, all their items (owned + items they've
 * been assigned/invited to), and the people attached to each item. RLS already
 * scopes rows to what the user may see, so we don't re-filter here.
 */
export async function getTodoData(userId: string): Promise<TodoData> {
  const supabase = await createClient()

  const [listsRes, ownedRes, assignedRes] = await Promise.all([
    supabase
      .from('todo_lists')
      .select('*')
      .eq('owner_id', userId)
      .order('position', { ascending: true }),
    supabase
      .from('todo_items')
      .select('*')
      .eq('owner_id', userId)
      .order('position', { ascending: true }),
    // Items the user is assigned to / invited on but doesn't own.
    supabase
      .from('todo_item_assignees')
      .select('item:todo_items(*)')
      .eq('user_id', userId),
  ])

  const lists = (listsRes.data ?? []) as TodoList[]
  const owned = (ownedRes.data ?? []) as TodoItem[]

  const assignedRows = (assignedRes.data ?? []) as unknown as {
    item: TodoItem | TodoItem[] | null
  }[]
  const assignedItems: TodoItem[] = []
  for (const row of assignedRows) {
    const it = Array.isArray(row.item) ? row.item[0] : row.item
    if (it) assignedItems.push(it)
  }

  // Merge owned + assigned, de-duplicated by id.
  const byId = new Map<string, TodoItem>()
  for (const it of owned) byId.set(it.id, it)
  for (const it of assignedItems) if (!byId.has(it.id)) byId.set(it.id, it)

  // Pull in subtasks of every visible item, regardless of who owns them, so a
  // shared/assigned to-do shows the owner's subtasks to the collaborator and
  // the collaborator's subtasks back to the owner. RLS (is_todo_parent_participant)
  // authorises this cross-owner read.
  const parentIds = Array.from(byId.keys())
  if (parentIds.length > 0) {
    const { data: childRows } = await supabase
      .from('todo_items')
      .select('*')
      .in('parent_id', parentIds)
      .order('position', { ascending: true })
    for (const c of (childRows ?? []) as TodoItem[]) {
      if (!byId.has(c.id)) byId.set(c.id, c)
    }
  }

  const items = Array.from(byId.values())

  // Load assignees for all visible items, joined to profile names.
  const assignees: Record<string, TodoAssigneeView[]> = {}
  const attachments: Record<string, TodoAttachment[]> = {}
  const itemIds = items.map((i) => i.id)
  if (itemIds.length > 0) {
    const [aRes, attRes] = await Promise.all([
      supabase
        .from('todo_item_assignees')
        .select('item_id, user_id, role, response, profile:profiles(full_name)')
        .in('item_id', itemIds),
      supabase
        .from('todo_attachments')
        .select('*')
        .in('item_id', itemIds)
        .order('created_at', { ascending: true }),
    ])

    for (const row of (aRes.data ?? []) as unknown as {
      item_id: string
      user_id: string
      role: 'assignee' | 'invitee'
      response: 'pending' | 'accepted' | 'declined'
      profile: { full_name: string | null } | { full_name: string | null }[] | null
    }[]) {
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile
      if (!assignees[row.item_id]) assignees[row.item_id] = []
      assignees[row.item_id].push({
        user_id: row.user_id,
        role: row.role,
        response: row.response,
        full_name: prof?.full_name ?? null,
      })
    }

    for (const att of (attRes.data ?? []) as TodoAttachment[]) {
      if (!attachments[att.item_id]) attachments[att.item_id] = []
      attachments[att.item_id].push(att)
    }
  }

  return { lists, items, assignees, attachments }
}

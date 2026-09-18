'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/notifications'
import type { TodoItem, TodoList, TodoTeam } from '@/lib/types/database'

interface AuthCtx {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}

async function getAuth(): Promise<AuthCtx | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  return { supabase, userId: user.id }
}

// ------------------------------- Lists -------------------------------------

export async function createList(input: {
  name: string
  color?: string | null
}): Promise<{ ok: boolean; error?: string; list?: TodoList }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'A name is required.' }

  const { data: maxRow } = await supabase
    .from('todo_lists')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({ owner_id: userId, name, color: input.color ?? null, position })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true, list: data as TodoList }
}

export async function renameList(input: {
  id: string
  name: string
  color?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const patch: Record<string, unknown> = {}
  if (input.name.trim()) patch.name = input.name.trim()
  if (input.color !== undefined) patch.color = input.color
  const { error } = await supabase
    .from('todo_lists')
    .update(patch)
    .eq('id', input.id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function deleteList(
  id: string,
  opts?: { deleteItems?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  if (opts?.deleteItems) {
    // Caller chose to delete the list's tasks too. Clean up any mirrored
    // calendar entries first, then delete the items (subtasks cascade via FK).
    const { data: rows } = await supabase
      .from('todo_items')
      .select('calendar_entry_id')
      .eq('list_id', id)
      .eq('owner_id', userId)
    const calIds = (rows ?? [])
      .map((r) => r.calendar_entry_id)
      .filter((v): v is string => Boolean(v))
    if (calIds.length > 0) {
      await supabase.from('calendar_entries').delete().in('id', calIds)
    }
    await supabase.from('todo_items').delete().eq('list_id', id).eq('owner_id', userId)
  } else {
    // Otherwise the items fall back to the Inbox (list_id null) so they remain
    // visible in All to-dos.
    await supabase
      .from('todo_items')
      .update({ list_id: null })
      .eq('list_id', id)
      .eq('owner_id', userId)
  }

  const { error } = await supabase
    .from('todo_lists')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

// ------------------------------- Items -------------------------------------

// Normalises free-form tags: trims, drops empties, de-dupes case-insensitively
// (keeping the first-seen casing), caps length and count so a single item can't
// carry an unbounded tag list.
function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().slice(0, 40)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 20) break
  }
  return out
}

export async function createItem(input: {
  title: string
  listId?: string | null
  parentId?: string | null
  notes?: string | null
  dueAt?: string | null
  allDay?: boolean
  notable?: boolean
  tags?: string[]
}): Promise<{ ok: boolean; error?: string; item?: TodoItem }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'A title is required.' }

  const { data: maxRow } = await supabase
    .from('todo_items')
    .select('position')
    .eq('owner_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('todo_items')
    .insert({
      owner_id: userId,
      list_id: input.listId ?? null,
      parent_id: input.parentId ?? null,
      title,
      notes: input.notes ?? null,
      due_at: input.dueAt ?? null,
      all_day: input.allDay ?? false,
      notable: input.notable ?? true,
      tags: cleanTags(input.tags),
      position,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true, item: data as TodoItem }
}

export async function updateItem(input: {
  id: string
  title?: string
  notes?: string | null
  dueAt?: string | null
  allDay?: boolean
  listId?: string | null
  notable?: boolean
  tags?: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined && input.title.trim()) patch.title = input.title.trim()
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.dueAt !== undefined) patch.due_at = input.dueAt
  if (input.allDay !== undefined) patch.all_day = input.allDay
  if (input.listId !== undefined) patch.list_id = input.listId
  if (input.notable !== undefined) patch.notable = input.notable
  if (input.tags !== undefined) patch.tags = cleanTags(input.tags)
  patch.updated_at = new Date().toISOString()
  const { error } = await supabase
    .from('todo_items')
    .update(patch)
    .eq('id', input.id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function toggleItemDone(input: {
  id: string
  done: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth
  // No owner filter: anyone the to-do is shared with (assignee/invitee) or who
  // can access it as a subtask of a shared parent may tick it off. RLS
  // (owner / assignee / parent-participant) authorises the update.
  const { error } = await supabase
    .from('todo_items')
    .update({
      status: input.done ? 'done' : 'open',
      completed_at: input.done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function setItemFlag(input: {
  id: string
  field: 'starred' | 'pinned' | 'notable'
  value: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const { error } = await supabase
    .from('todo_items')
    .update({ [input.field]: input.value, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function reorderItems(input: {
  orderedIds: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  if (input.orderedIds.length === 0) return { ok: true }
  // Persist the new order as sequential positions. Only the owner's own rows
  // are touched (RLS + owner filter), so a drag can't reorder others' items.
  const now = new Date().toISOString()
  await Promise.all(
    input.orderedIds.map((id, index) =>
      supabase
        .from('todo_items')
        .update({ position: index, updated_at: now })
        .eq('id', id)
        .eq('owner_id', userId),
    ),
  )
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function respondToInvite(input: {
  itemId: string
  response: 'accepted' | 'declined'
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  // The current user updates only their own assignee row on this item.
  const { data: row, error } = await supabase
    .from('todo_item_assignees')
    .update({ response: input.response })
    .eq('item_id', input.itemId)
    .eq('user_id', userId)
    .select('item_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'You are not on this to-do.' }

  // Let the owner know how the person responded.
  const { data: item } = await supabase
    .from('todo_items')
    .select('title, owner_id')
    .eq('id', input.itemId)
    .maybeSingle()
  if (item?.owner_id && item.owner_id !== userId) {
    await notifyUsers({
      userIds: [item.owner_id],
      title: input.response === 'accepted' ? 'To-do accepted' : 'To-do declined',
      body: item.title,
      url: '/dashboard/todo',
      category: 'todo',
      createdBy: userId,
    })
  }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function deleteItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  // Read the item (RLS lets the owner or a collaborator see it).
  const { data: item } = await supabase
    .from('todo_items')
    .select('owner_id, calendar_entry_id')
    .eq('id', id)
    .maybeSingle()
  if (!item) return { ok: false, error: 'To-do not found.' }

  // A collaborator (assignee/invitee, not the owner) "deleting" the to-do only
  // removes it from their own list — the owner and everyone else keep it.
  if (item.owner_id !== userId) {
    const { error } = await supabase
      .from('todo_item_assignees')
      .delete()
      .eq('item_id', id)
      .eq('user_id', userId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/dashboard/todo')
    return { ok: true }
  }

  // Owner delete removes it for everyone. Subtasks cascade via FK; also remove
  // any mirrored calendar entry.
  if (item.calendar_entry_id) {
    await supabase.from('calendar_entries').delete().eq('id', item.calendar_entry_id)
  }
  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

// ------------------------- Assignment / invites ----------------------------

export async function assignUsers(input: {
  itemId: string
  userIds: string[]
  role: 'assignee' | 'invitee'
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  // Only the owner can invite/assign on their to-do.
  const { data: item } = await supabase
    .from('todo_items')
    .select('id, title, owner_id')
    .eq('id', input.itemId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'To-do not found.' }

  const targets = Array.from(new Set(input.userIds.filter((u) => u && u !== userId)))
  if (targets.length === 0) return { ok: true }

  const rows = targets.map((uid) => ({
    item_id: input.itemId,
    user_id: uid,
    role: input.role,
    response: 'pending' as const,
  }))
  const { error } = await supabase
    .from('todo_item_assignees')
    .upsert(rows, { onConflict: 'item_id,user_id' })
  if (error) return { ok: false, error: error.message }

  await notifyUsers({
    userIds: targets,
    title: input.role === 'assignee' ? 'You were assigned a to-do' : 'You were invited to a to-do',
    body: item.title,
    url: '/dashboard/todo',
    category: 'todo',
    createdBy: userId,
  })

  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function removeAssignee(input: {
  itemId: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const { data: item } = await supabase
    .from('todo_items')
    .select('id')
    .eq('id', input.itemId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'To-do not found.' }
  const { error } = await supabase
    .from('todo_item_assignees')
    .delete()
    .eq('item_id', input.itemId)
    .eq('user_id', input.userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

// ------------------------------ Attachments --------------------------------

export async function deleteAttachment(
  attachmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  // RLS restricts DELETE to the uploader or item owner. Read the blob path first
  // (also RLS-checked) so we can clean up storage after the row is removed.
  const { data: att } = await supabase
    .from('todo_attachments')
    .select('blob_path')
    .eq('id', attachmentId)
    .maybeSingle()

  const { error } = await supabase.from('todo_attachments').delete().eq('id', attachmentId)
  if (error) return { ok: false, error: error.message }

  if (att?.blob_path) {
    const { del } = await import('@vercel/blob')
    await del(att.blob_path).catch(() => {})
  }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

// ------------------------------- Teams -------------------------------------

// Replaces the full member set of a team the caller owns. Owner-scoped so a
// user can only edit their own teams (RLS also enforces this).
async function writeTeamMembers(
  supabase: AuthCtx['supabase'],
  userId: string,
  teamId: string,
  memberIds: string[],
): Promise<void> {
  const clean = Array.from(new Set(memberIds.filter((u) => u && u !== userId)))
  await supabase.from('todo_team_members').delete().eq('team_id', teamId)
  if (clean.length > 0) {
    await supabase
      .from('todo_team_members')
      .insert(clean.map((uid) => ({ team_id: teamId, user_id: uid })))
  }
}

export async function createTeam(input: {
  name: string
  color?: string | null
  memberIds?: string[]
}): Promise<{ ok: boolean; error?: string; team?: TodoTeam }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'A team name is required.' }

  const { data, error } = await supabase
    .from('todo_teams')
    .insert({ owner_id: userId, name, color: input.color ?? null })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }

  if (input.memberIds?.length) {
    await writeTeamMembers(supabase, userId, data.id, input.memberIds)
  }
  revalidatePath('/dashboard/todo')
  return { ok: true, team: data as TodoTeam }
}

export async function updateTeam(input: {
  id: string
  name?: string
  color?: string | null
  memberIds?: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim()
  if (input.color !== undefined) patch.color = input.color

  const { data: team, error } = await supabase
    .from('todo_teams')
    .update(patch)
    .eq('id', input.id)
    .eq('owner_id', userId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!team) return { ok: false, error: 'Team not found.' }

  if (input.memberIds !== undefined) {
    await writeTeamMembers(supabase, userId, input.id, input.memberIds)
  }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

export async function deleteTeam(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  // Members cascade via FK. Deleting a team never touches to-dos already
  // assigned from it — those assignees stand on their own.
  const { error } = await supabase
    .from('todo_teams')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

// Assigns (or invites) every member of a team to a to-do in one step. The team
// is just a convenience grouping — each member becomes an ordinary assignee row,
// so later team edits don't retroactively change existing to-dos.
export async function assignTeam(input: {
  itemId: string
  teamId: string
  role: 'assignee' | 'invitee'
}): Promise<{ ok: boolean; error?: string; added?: number }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  // Only the to-do owner can assign people.
  const { data: item } = await supabase
    .from('todo_items')
    .select('id, title, owner_id')
    .eq('id', input.itemId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'To-do not found.' }

  // Only pull members from a team the caller owns.
  const { data: team } = await supabase
    .from('todo_teams')
    .select('id')
    .eq('id', input.teamId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!team) return { ok: false, error: 'Team not found.' }

  const { data: memberRows } = await supabase
    .from('todo_team_members')
    .select('user_id')
    .eq('team_id', input.teamId)
  const targets = Array.from(
    new Set((memberRows ?? []).map((m) => m.user_id).filter((u) => u && u !== userId)),
  )
  if (targets.length === 0) return { ok: true, added: 0 }

  const rows = targets.map((uid) => ({
    item_id: input.itemId,
    user_id: uid,
    role: input.role,
    response: 'pending' as const,
  }))
  const { error } = await supabase
    .from('todo_item_assignees')
    .upsert(rows, { onConflict: 'item_id,user_id' })
  if (error) return { ok: false, error: error.message }

  await notifyUsers({
    userIds: targets,
    title: input.role === 'assignee' ? 'You were assigned a to-do' : 'You were invited to a to-do',
    body: item.title,
    url: '/dashboard/todo',
    category: 'todo',
    createdBy: userId,
  })

  revalidatePath('/dashboard/todo')
  return { ok: true, added: targets.length }
}

// --------------------------- Calendar inclusion ----------------------------

export async function addToCalendar(
  itemId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: item } = await supabase
    .from('todo_items')
    .select('id, title, notes, due_at, all_day, calendar_entry_id')
    .eq('id', itemId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'To-do not found.' }
  if (!item.due_at) return { ok: false, error: 'Set a date first.' }
  if (item.calendar_entry_id) return { ok: true }

  const start = new Date(item.due_at)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const { data: entry, error } = await supabase
    .from('calendar_entries')
    .insert({
      entry_type_id: null,
      user_id: userId,
      title: item.title,
      all_day: item.all_day,
      start_at: item.due_at,
      end_at: item.all_day ? item.due_at : end.toISOString(),
      is_public: false,
      notes: item.notes,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !entry) return { ok: false, error: error?.message ?? 'Could not add to calendar.' }

  await supabase
    .from('todo_items')
    .update({ calendar_entry_id: entry.id })
    .eq('id', itemId)
    .eq('owner_id', userId)

  revalidatePath('/dashboard/todo')
  revalidatePath('/dashboard/calendar')
  return { ok: true }
}

// --------------------------- Waiting-on-you inbox --------------------------

// Manually clears one item from the "Waiting on you" inbox. Most sources
// auto-clear once actioned; this is the escape hatch for anything that lingers
// (e.g. an approval you've delegated, an escalation you've handled elsewhere).
// Notifications are cleared by marking them read so they don't re-appear in the
// bell either; everything else is remembered in todo_waiting_dismissals.
export async function dismissWaitingItem(
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  const trimmed = (key ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Nothing to dismiss.' }

  if (trimmed.startsWith('notif-')) {
    const notifId = trimmed.slice('notif-'.length)
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notifId)
      .eq('user_id', userId)
      .is('read_at', null)
  }

  const { error } = await supabase
    .from('todo_waiting_dismissals')
    .upsert({ user_id: userId, item_key: trimmed }, { onConflict: 'user_id,item_key' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/todo')
  return { ok: true }
}

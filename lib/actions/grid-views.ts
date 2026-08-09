'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/notifications'
import type {
  SavedGridView,
  SharedGridView,
  SharedGridViewComment,
} from '@/lib/types/database'

// Human-readable label per grid, used in notifications and links.
const GRID_META: Record<string, { label: string; href: string }> = {
  calls: { label: 'Calls', href: '/dashboard/schedule' },
  quotes: { label: 'Quotes', href: '/dashboard/sales' },
  chargeable: { label: 'Chargeable Calls', href: '/dashboard/chargeable' },
  'follow-ups': { label: 'Follow-Ups', href: '/dashboard/follow-ups' },
}

async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  return { supabase, userId: user.id }
}

/** All saved presets for the signed-in user on a given grid. */
export async function getSavedGridViews(gridKey: string): Promise<SavedGridView[]> {
  const auth = await getAuth()
  if ('error' in auth) return []
  const { data } = await auth.supabase
    .from('saved_grid_views')
    .select('*')
    .eq('grid_key', gridKey)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  return (data ?? []) as SavedGridView[]
}

/** Shared views sent to (or by) the signed-in user for a grid. */
export async function getSharedGridViews(gridKey: string): Promise<SharedGridView[]> {
  const auth = await getAuth()
  if ('error' in auth) return []
  const { data } = await auth.supabase
    .from('shared_grid_views')
    .select(
      `*, sender:profiles!shared_grid_views_sender_id_fkey(id, full_name),
       recipient:profiles!shared_grid_views_recipient_id_fkey(id, full_name),
       comments:shared_grid_view_comments(
         id, created_at, shared_view_id, author_id, body,
         author:profiles(id, full_name)
       )`,
    )
    .eq('grid_key', gridKey)
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as SharedGridView[]
  // Sort each thread oldest-first for display.
  for (const r of rows) {
    r.comments?.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  return rows
}

export async function saveGridView(input: {
  gridKey: string
  name: string
  filters: Record<string, unknown>
  isDefault?: boolean
  /** When set, update an existing preset instead of inserting. */
  id?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Give the view a name.' }

  // Enforce a single default per (user, grid): clear others first.
  if (input.isDefault) {
    await auth.supabase
      .from('saved_grid_views')
      .update({ is_default: false })
      .eq('user_id', auth.userId)
      .eq('grid_key', input.gridKey)
  }

  if (input.id) {
    const { error } = await auth.supabase
      .from('saved_grid_views')
      .update({
        name,
        filters: input.filters,
        is_default: !!input.isDefault,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('user_id', auth.userId)
    if (error) return { ok: false, error: error.message }
    revalidate(input.gridKey)
    return { ok: true, id: input.id }
  }

  const { data, error } = await auth.supabase
    .from('saved_grid_views')
    .insert({
      user_id: auth.userId,
      grid_key: input.gridKey,
      name,
      filters: input.filters,
      is_default: !!input.isDefault,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(input.gridKey)
  return { ok: true, id: (data as { id: string }).id }
}

export async function setDefaultGridView(input: {
  gridKey: string
  /** null clears the current default. */
  id: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  await auth.supabase
    .from('saved_grid_views')
    .update({ is_default: false })
    .eq('user_id', auth.userId)
    .eq('grid_key', input.gridKey)
  if (input.id) {
    const { error } = await auth.supabase
      .from('saved_grid_views')
      .update({ is_default: true })
      .eq('id', input.id)
      .eq('user_id', auth.userId)
    if (error) return { ok: false, error: error.message }
  }
  revalidate(input.gridKey)
  return { ok: true }
}

export async function deleteGridView(
  gridKey: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('saved_grid_views')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId)
  if (error) return { ok: false, error: error.message }
  revalidate(gridKey)
  return { ok: true }
}

/** Capture the current filter and send it to another user with a note. */
export async function shareGridView(input: {
  gridKey: string
  name: string
  filters: Record<string, unknown>
  recipientId: string
  note?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!input.recipientId) return { ok: false, error: 'Choose someone to send it to.' }

  const { data, error } = await auth.supabase
    .from('shared_grid_views')
    .insert({
      grid_key: input.gridKey,
      name: input.name.trim() || 'Shared view',
      filters: input.filters,
      note: input.note?.trim() || null,
      sender_id: auth.userId,
      recipient_id: input.recipientId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  const id = (data as { id: string }).id
  const meta = GRID_META[input.gridKey] ?? { label: 'View', href: '/dashboard' }
  await notifyUsers({
    userIds: [input.recipientId],
    title: `${meta.label} view shared with you`,
    body: input.note?.trim() || `A filtered ${meta.label} view was shared with you.`,
    url: `${meta.href}?sharedView=${id}`,
    category: 'grid_view_shared',
    createdBy: auth.userId,
  })
  revalidate(input.gridKey)
  return { ok: true, id }
}

export async function addSharedViewComment(input: {
  sharedViewId: string
  body: string
}): Promise<{ ok: boolean; comment?: SharedGridViewComment; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Write a comment first.' }

  // Load the parent so we can notify the other participant.
  const { data: view } = await auth.supabase
    .from('shared_grid_views')
    .select('id, grid_key, name, sender_id, recipient_id')
    .eq('id', input.sharedViewId)
    .single()
  if (!view) return { ok: false, error: 'Shared view not found.' }

  const { data, error } = await auth.supabase
    .from('shared_grid_view_comments')
    .insert({ shared_view_id: input.sharedViewId, author_id: auth.userId, body })
    .select('id, created_at, shared_view_id, author_id, body, author:profiles(id, full_name)')
    .single()
  if (error) return { ok: false, error: error.message }

  const comment = data as unknown as SharedGridViewComment
  const v = view as { grid_key: string; name: string; sender_id: string; recipient_id: string }
  const other = v.sender_id === auth.userId ? v.recipient_id : v.sender_id
  const meta = GRID_META[v.grid_key] ?? { label: 'View', href: '/dashboard' }
  await notifyUsers({
    userIds: [other],
    title: `New comment on "${v.name}"`,
    body,
    url: `${meta.href}?sharedView=${input.sharedViewId}`,
    category: 'grid_view_comment',
    createdBy: auth.userId,
  })
  revalidate(v.grid_key)
  return { ok: true, comment }
}

export async function markSharedViewRead(
  sharedViewId: string,
): Promise<{ ok: boolean }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false }
  await auth.supabase
    .from('shared_grid_views')
    .update({ read_at: new Date().toISOString() })
    .eq('id', sharedViewId)
    .eq('recipient_id', auth.userId)
    .is('read_at', null)
  return { ok: true }
}

export async function setSharedViewResolved(
  sharedViewId: string,
  resolved: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('shared_grid_views')
    .update({ resolved })
    .eq('id', sharedViewId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteSharedView(
  sharedViewId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase
    .from('shared_grid_views')
    .delete()
    .eq('id', sharedViewId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Active internal staff the current user can share a view with (excludes self). */
export async function getShareableUsers(): Promise<
  { id: string; full_name: string | null }[]
> {
  const auth = await getAuth()
  if ('error' in auth) return []
  const { data } = await auth.supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('status', 'active')
    .in('role', ['admin', 'office', 'engineer'])
    .neq('id', auth.userId)
    .order('full_name', { ascending: true })
  return ((data ?? []) as { id: string; full_name: string | null }[]).map((u) => ({
    id: u.id,
    full_name: u.full_name,
  }))
}

function revalidate(gridKey: string) {
  const meta = GRID_META[gridKey]
  if (meta) revalidatePath(meta.href)
}

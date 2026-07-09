'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

type StaffAuth =
  | { ok: false; error: string }
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
      fullName: string | null
    }

async function requireStaff(): Promise<StaffAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('id', user.id)
    .maybeSingle()
  const p = profile as { id: string; full_name: string | null; role: string; status: string } | null
  if (!p || p.status !== 'active' || !['admin', 'office', 'engineer'].includes(p.role)) {
    return { ok: false, error: 'Not authorised' }
  }
  return { ok: true, supabase, userId: user.id, fullName: p.full_name }
}

/**
 * Send a text and/or image message to a channel. Membership is enforced by RLS
 * on the insert; we also notify the other channel members.
 */
export async function sendMessage(input: {
  channelId: string
  body?: string | null
  imageUrl?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, userId, fullName } = auth

  const body = input.body?.trim() || null
  if (!body && !input.imageUrl) return { ok: false, error: 'Message is empty' }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: input.channelId,
      sender_id: userId,
      body,
      image_url: input.imageUrl ?? null,
      kind: 'message',
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message || 'Failed to send' }

  await notifyChannel({
    channelId: input.channelId,
    exceptUserId: userId,
    title: fullName || 'New message',
    bodyText: body ? truncate(body) : 'Sent a photo',
  })

  revalidatePath('/dashboard/chat')
  return { ok: true, data: { id: (data as { id: string }).id } }
}

/** Toggle an emoji reaction on a message for the current user. */
export async function toggleReaction(input: {
  messageId: string
  emoji: string
}): Promise<ActionResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: existing } = await supabase
    .from('chat_reactions')
    .select('id')
    .eq('message_id', input.messageId)
    .eq('user_id', userId)
    .eq('emoji', input.emoji)
    .maybeSingle()

  if (existing) {
    await supabase.from('chat_reactions').delete().eq('id', (existing as { id: string }).id)
  } else {
    const { error } = await supabase.from('chat_reactions').insert({
      message_id: input.messageId,
      user_id: userId,
      emoji: input.emoji,
    })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/dashboard/chat')
  return { ok: true }
}

/** Mark a channel as read up to now for the current user. */
export async function markChannelRead(channelId: string): Promise<ActionResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, userId } = auth
  await supabase
    .from('chat_channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', userId)
  return { ok: true }
}

/**
 * Find or create a 1:1 DM channel between the current user and another staff
 * member. Uses the admin client to create the channel + both memberships
 * atomically (RLS would otherwise block adding the other member).
 */
export async function openDirectMessage(otherUserId: string): Promise<ActionResult<{ channelId: string }>> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { userId } = auth
  if (otherUserId === userId) return { ok: false, error: 'Cannot DM yourself' }

  const admin = createAdminClient()

  // Look for an existing DM containing exactly these two members.
  const { data: mine } = await admin
    .from('chat_channel_members')
    .select('channel_id, channel:chat_channels!inner(kind)')
    .eq('user_id', userId)
  const myDmChannelIds = ((mine ?? []) as unknown as { channel_id: string; channel: { kind: string } | null }[])
    .filter((r) => r.channel?.kind === 'dm')
    .map((r) => r.channel_id)

  if (myDmChannelIds.length > 0) {
    const { data: theirs } = await admin
      .from('chat_channel_members')
      .select('channel_id')
      .eq('user_id', otherUserId)
      .in('channel_id', myDmChannelIds)
    const shared = (theirs ?? [])[0] as { channel_id: string } | undefined
    if (shared) return { ok: true, data: { channelId: shared.channel_id } }
  }

  // Create a new DM channel + both memberships.
  const { data: channel, error: chErr } = await admin
    .from('chat_channels')
    .insert({ kind: 'dm', branch_id: null, name: null })
    .select('id')
    .single()
  if (chErr || !channel) return { ok: false, error: chErr?.message || 'Failed to create DM' }

  const channelId = (channel as { id: string }).id
  const { error: memErr } = await admin.from('chat_channel_members').insert([
    { channel_id: channelId, user_id: userId },
    { channel_id: channelId, user_id: otherUserId },
  ])
  if (memErr) return { ok: false, error: memErr.message }

  revalidatePath('/dashboard/chat')
  return { ok: true, data: { channelId } }
}

const WATER_BALLOON = '💦'

/**
 * Throw a water balloon at a colleague — a fun DM message. Rate-limited to once
 * per ISO week per thrower. Posts a water_balloon message into the DM channel
 * and notifies the target.
 */
export async function throwWaterBalloon(targetUserId: string): Promise<ActionResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, userId, fullName } = auth
  if (targetUserId === userId) return { ok: false, error: 'You cannot splash yourself' }

  // One throw per ISO week (Mon 00:00 as boundary).
  const now = new Date()
  const day = (now.getUTCDay() + 6) % 7 // 0 = Monday
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day))
  const { count } = await supabase
    .from('chat_water_balloons')
    .select('id', { count: 'exact', head: true })
    .eq('thrower_id', userId)
    .gte('thrown_at', weekStart.toISOString())
  if ((count ?? 0) >= 1) {
    return { ok: false, error: 'You have already thrown your water balloon this week. Recharge next Monday!' }
  }

  // Ensure a DM channel exists.
  const dm = await openDirectMessage(targetUserId)
  if (!dm.ok) return dm
  const channelId = dm.data!.channelId

  const admin = createAdminClient()
  await admin.from('chat_water_balloons').insert({ thrower_id: userId, target_id: targetUserId })
  const { error } = await admin.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: userId,
    body: `${WATER_BALLOON} ${fullName || 'Someone'} threw a water balloon at you!`,
    kind: 'water_balloon',
  })
  if (error) return { ok: false, error: error.message }

  await notifyUsers({
    userIds: [targetUserId],
    title: 'Splash!',
    body: `${fullName || 'A colleague'} threw a water balloon at you`,
    url: '/dashboard/chat',
    category: 'chat',
    createdBy: userId,
  })

  revalidatePath('/dashboard/chat')
  return { ok: true }
}

// --- helpers ---

function truncate(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Notify every other member of a channel about new activity. */
async function notifyChannel(input: {
  channelId: string
  exceptUserId: string
  title: string
  bodyText: string
}): Promise<void> {
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('chat_channel_members')
    .select('user_id')
    .eq('channel_id', input.channelId)
  const recipients = ((members ?? []) as { user_id: string }[])
    .map((m) => m.user_id)
    .filter((id) => id !== input.exceptUserId)
  if (recipients.length === 0) return
  await notifyUsers({
    userIds: recipients,
    title: input.title,
    body: input.bodyText,
    url: '/dashboard/chat',
    category: 'chat',
    createdBy: input.exceptUserId,
  })
}

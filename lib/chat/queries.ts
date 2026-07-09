import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ChatChannelSummary, ChatMessage, ChatReactionGroup, ChatUser } from './types'

/**
 * Idempotently provision the per-branch channels and make sure the given user
 * is enrolled in their own branch channel. Runs with the admin client because
 * creating channels / adding members for a fresh branch is a privileged setup
 * step. Cheap and safe to call on every chat page load.
 */
export async function ensureChatSetup(userId: string, branchId: string | null): Promise<void> {
  const admin = createAdminClient()

  // 1) A branch channel for every branch.
  const { data: branches } = await admin.from('branches').select('id, name')
  const { data: existing } = await admin
    .from('chat_channels')
    .select('branch_id')
    .eq('kind', 'branch')
  const have = new Set((existing ?? []).map((c) => c.branch_id as string))
  const missing = (branches ?? []).filter((b) => !have.has(b.id))
  if (missing.length > 0) {
    await admin
      .from('chat_channels')
      .insert(missing.map((b) => ({ kind: 'branch', branch_id: b.id, name: b.name })))
  }

  // 2) Ensure this user is a member of their branch channel.
  if (branchId) {
    const { data: channel } = await admin
      .from('chat_channels')
      .select('id')
      .eq('kind', 'branch')
      .eq('branch_id', branchId)
      .maybeSingle()
    if (channel) {
      await admin
        .from('chat_channel_members')
        .upsert(
          { channel_id: (channel as { id: string }).id, user_id: userId },
          { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
        )
    }
  }
}

interface RawMembership {
  channel_id: string
  last_read_at: string | null
  channel: {
    id: string
    kind: 'branch' | 'dm'
    branch_id: string | null
    name: string | null
  } | null
}

/**
 * All channels the user belongs to, with unread counts + last-message preview,
 * ordered by most recent activity. RLS ensures only the user's own channels and
 * their messages are visible.
 */
export async function listChannels(userId: string): Promise<ChatChannelSummary[]> {
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('chat_channel_members')
    .select('channel_id, last_read_at, channel:chat_channels(id, kind, branch_id, name)')
    .eq('user_id', userId)

  const rows = (memberships ?? []) as unknown as RawMembership[]
  const channelIds = rows.map((r) => r.channel_id)
  if (channelIds.length === 0) return []

  // Other members (for DM display names + water-balloon targets).
  const { data: allMembers } = await supabase
    .from('chat_channel_members')
    .select('channel_id, user_id')
    .in('channel_id', channelIds)

  const memberIdsByChannel = new Map<string, string[]>()
  for (const m of allMembers ?? []) {
    const list = memberIdsByChannel.get(m.channel_id as string) ?? []
    list.push(m.user_id as string)
    memberIdsByChannel.set(m.channel_id as string, list)
  }

  // Profiles for DM counterparts.
  const otherIds = new Set<string>()
  for (const [, ids] of memberIdsByChannel) {
    for (const id of ids) if (id !== userId) otherIds.add(id)
  }
  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  if (otherIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', Array.from(otherIds))
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        full_name: p.full_name as string | null,
        avatar_url: p.avatar_url as string | null,
      })
    }
  }

  // Recent messages across the user's channels (bounded); enough to derive the
  // last-message preview and an accurate-in-practice unread count for an
  // internal tool.
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, channel_id, sender_id, body, kind, created_at')
    .in('channel_id', channelIds)
    .order('created_at', { ascending: false })
    .limit(600)

  const summaries: ChatChannelSummary[] = rows.map((r) => {
    const ch = r.channel
    const memberIds = memberIdsByChannel.get(r.channel_id) ?? []
    const chMessages = (messages ?? []).filter((m) => m.channel_id === r.channel_id)
    const last = chMessages[0]
    const lastReadMs = r.last_read_at ? new Date(r.last_read_at).getTime() : 0
    const unread = chMessages.filter(
      (m) => m.sender_id !== userId && new Date(m.created_at as string).getTime() > lastReadMs,
    ).length

    let name = ch?.name ?? 'Channel'
    let avatarUrl: string | null = null
    if (ch?.kind === 'dm') {
      const otherId = memberIds.find((id) => id !== userId)
      const other = otherId ? profileMap.get(otherId) : null
      name = other?.full_name ?? 'Direct message'
      avatarUrl = other?.avatar_url ?? null
    }

    const preview = last
      ? last.kind === 'water_balloon'
        ? 'Threw a water balloon'
        : (last.body as string | null) ?? 'Photo'
      : null

    return {
      id: r.channel_id,
      kind: ch?.kind ?? 'branch',
      branchId: ch?.branch_id ?? null,
      name,
      avatarUrl,
      unread,
      lastMessageAt: (last?.created_at as string) ?? null,
      lastMessagePreview: preview,
      memberIds,
    }
  })

  // Branch channels first, then by most recent activity.
  summaries.sort((a, b) => {
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return bt - at
  })
  return summaries
}

/** Total unread across all the user's channels (for the header badge). */
export async function getChatUnreadCount(userId: string): Promise<number> {
  const channels = await listChannels(userId)
  return channels.reduce((sum, c) => sum + c.unread, 0)
}

interface RawMessage {
  id: string
  channel_id: string
  sender_id: string
  body: string | null
  image_url: string | null
  kind: 'message' | 'water_balloon'
  created_at: string
  sender: { full_name: string | null; avatar_url: string | null } | null
  reactions: { emoji: string; user_id: string }[]
}

/** Messages for a channel (oldest→newest) with grouped reactions. */
export async function listMessages(channelId: string, userId: string): Promise<ChatMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('chat_messages')
    .select(
      'id, channel_id, sender_id, body, image_url, kind, created_at, sender:profiles!chat_messages_sender_id_fkey(full_name, avatar_url), reactions:chat_reactions(emoji, user_id)',
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(300)

  const rows = (data ?? []) as unknown as RawMessage[]
  return rows.map((m) => {
    const groups = new Map<string, ChatReactionGroup>()
    for (const r of m.reactions ?? []) {
      const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, reactedByMe: false }
      g.count += 1
      if (r.user_id === userId) g.reactedByMe = true
      groups.set(r.emoji, g)
    }
    return {
      id: m.id,
      channelId: m.channel_id,
      senderId: m.sender_id,
      senderName: m.sender?.full_name ?? null,
      senderAvatar: m.sender?.avatar_url ?? null,
      body: m.body,
      imageUrl: m.image_url,
      kind: m.kind,
      createdAt: m.created_at,
      reactions: Array.from(groups.values()),
    }
  })
}

/** Active staff the user can start a DM with (excludes self). */
export async function listDmCandidates(userId: string): Promise<ChatUser[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, branch_id')
    .in('role', ['admin', 'office', 'engineer'])
    .eq('status', 'active')
    .neq('id', userId)
    .order('full_name')
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    fullName: (p.full_name as string) ?? null,
    avatarUrl: (p.avatar_url as string) ?? null,
    role: (p.role as string) ?? null,
    branchId: (p.branch_id as string) ?? null,
  }))
}

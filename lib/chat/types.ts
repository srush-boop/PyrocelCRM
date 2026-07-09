export type ChatChannelKind = 'branch' | 'dm'
export type ChatMessageKind = 'message' | 'water_balloon'

export interface ChatUser {
  id: string
  fullName: string | null
  avatarUrl: string | null
  role?: string | null
  branchId?: string | null
}

export interface ChatReactionGroup {
  emoji: string
  count: number
  reactedByMe: boolean
}

export interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  senderName: string | null
  senderAvatar: string | null
  body: string | null
  imageUrl: string | null
  kind: ChatMessageKind
  createdAt: string
  reactions: ChatReactionGroup[]
}

export interface ChatChannelSummary {
  id: string
  kind: ChatChannelKind
  branchId: string | null
  /** Display name: branch name for branch channels, the other person for DMs. */
  name: string
  /** For DMs, the other person's avatar. */
  avatarUrl: string | null
  unread: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  /** Member ids (used for DMs to identify the other participant / water balloon target). */
  memberIds: string[]
}

/** Quick-reaction palette shown in the composer / message hover menu. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const

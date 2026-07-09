'use client'

import { useEffect, useRef } from 'react'
import useSWR from 'swr'
import { format, isSameDay } from 'date-fns'
import { ArrowLeft, Hash, Droplets } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { ChatChannelSummary, ChatMessage } from '@/lib/chat/types'
import { throwWaterBalloon } from '@/lib/chat/actions'
import { MessageBubble } from './message-bubble'
import { MessageComposer } from './message-composer'
import { initialsFrom } from './utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface MessagePaneProps {
  channel: ChatChannelSummary
  currentUserId: string
  currentUserName: string | null
  currentUserAvatar: string | null
  onBack: () => void
  onActivity: () => void
}

export function MessagePane({
  channel,
  currentUserId,
  onBack,
  onActivity,
}: MessagePaneProps) {
  const { data, mutate } = useSWR<{ messages: ChatMessage[] }>(
    `/api/chat/messages?channelId=${channel.id}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true },
  )
  const messages = data?.messages ?? []

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastCountRef = useRef(0)

  // Auto-scroll to the bottom when new messages arrive.
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const dmTargetId =
    channel.kind === 'dm' ? channel.memberIds.find((id) => id !== currentUserId) ?? null : null

  const handleThrow = async () => {
    if (!dmTargetId) return
    const res = await throwWaterBalloon(dmTargetId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Splash! You got ${channel.name}.`)
    mutate()
    onActivity()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 md:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {channel.kind === 'branch' ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Hash className="h-4 w-4" />
          </span>
        ) : (
          <Avatar className="h-9 w-9">
            <AvatarImage src={channel.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{initialsFrom(channel.name)}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{channel.name}</p>
          <p className="text-xs text-muted-foreground">
            {channel.kind === 'branch' ? 'Branch channel' : 'Direct message'}
          </p>
        </div>
        {channel.kind === 'dm' && dmTargetId && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleThrow}
            className="gap-1.5"
            title="Throw a water balloon (once a week!)"
          >
            <Droplets className="h-4 w-4 text-sky-500" />
            <span className="hidden sm:inline">Water balloon</span>
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const showDivider =
              !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt))
            const grouped =
              !showDivider && prev?.senderId === m.senderId && m.kind === 'message'
            return (
              <div key={m.id}>
                {showDivider && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {format(new Date(m.createdAt), 'EEEE d MMM')}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  isOwn={m.senderId === currentUserId}
                  grouped={grouped}
                  onReacted={() => mutate()}
                />
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        channelId={channel.id}
        onSent={() => {
          mutate()
          onActivity()
        }}
      />
    </div>
  )
}

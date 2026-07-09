'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatChannelSummary, ChatUser } from '@/lib/chat/types'
import { markChannelRead } from '@/lib/chat/actions'
import { ChannelList } from './channel-list'
import { MessagePane } from './message-pane'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ChatIndexProps {
  currentUserId: string
  currentUserName: string | null
  currentUserAvatar: string | null
  initialChannels: ChatChannelSummary[]
  dmCandidates: ChatUser[]
}

export function ChatIndex({
  currentUserId,
  currentUserName,
  currentUserAvatar,
  initialChannels,
  dmCandidates,
}: ChatIndexProps) {
  const { data, mutate } = useSWR<{ channels: ChatChannelSummary[] }>(
    '/api/chat/channels',
    fetcher,
    { refreshInterval: 8000, revalidateOnFocus: true, fallbackData: { channels: initialChannels } },
  )
  const channels = useMemo(() => data?.channels ?? initialChannels, [data, initialChannels])

  const [activeId, setActiveId] = useState<string | null>(
    initialChannels.length > 0 ? initialChannels[0].id : null,
  )
  // On mobile we show either the list or the pane, not both.
  const [mobilePaneOpen, setMobilePaneOpen] = useState(false)

  const activeChannel = channels.find((c) => c.id === activeId) ?? null

  const openChannel = useCallback(
    (id: string) => {
      setActiveId(id)
      setMobilePaneOpen(true)
      // Optimistically clear unread, then persist.
      mutate(
        (prev) =>
          prev
            ? { channels: prev.channels.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) }
            : prev,
        { revalidate: false },
      )
      void markChannelRead(id)
    },
    [mutate],
  )

  // When the active channel changes or new messages land, keep it marked read.
  useEffect(() => {
    if (activeId) void markChannelRead(activeId)
  }, [activeId])

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-full shrink-0 border-r md:w-80 md:block',
            mobilePaneOpen ? 'hidden md:block' : 'block',
          )}
        >
          <ChannelList
            channels={channels}
            activeId={activeId}
            onSelect={openChannel}
            dmCandidates={dmCandidates}
            currentUserId={currentUserId}
            onChannelsChanged={() => mutate()}
          />
        </aside>

        {/* Message pane */}
        <section
          className={cn(
            'flex-1 flex-col',
            mobilePaneOpen ? 'flex' : 'hidden md:flex',
          )}
        >
          {activeChannel ? (
            <MessagePane
              key={activeChannel.id}
              channel={activeChannel}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatar={currentUserAvatar}
              onBack={() => setMobilePaneOpen(false)}
              onActivity={() => mutate()}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <div>
                <ArrowLeft className="mx-auto mb-2 h-5 w-5 md:hidden" />
                Select a conversation to start chatting.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

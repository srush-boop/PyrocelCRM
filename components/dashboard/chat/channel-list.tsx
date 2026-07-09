'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Hash, Plus, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ChatChannelSummary, ChatUser } from '@/lib/chat/types'
import { openDirectMessage } from '@/lib/chat/actions'
import { initialsFrom } from './utils'

interface ChannelListProps {
  channels: ChatChannelSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  dmCandidates: ChatUser[]
  currentUserId: string
  onChannelsChanged: () => Promise<unknown> | void
}

export function ChannelList({
  channels,
  activeId,
  onSelect,
  dmCandidates,
  onChannelsChanged,
}: ChannelListProps) {
  const branchChannels = channels.filter((c) => c.kind === 'branch')
  const dmChannels = channels.filter((c) => c.kind === 'dm')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <h2 className="text-sm font-semibold">Messages</h2>
        <NewDmDialog
          dmCandidates={dmCandidates}
          onOpened={async (id) => {
            // Refresh the channel list first so the new DM exists before we
            // select it, then open it.
            await onChannelsChanged()
            onSelect(id)
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {branchChannels.length > 0 && (
          <Section title="Branches">
            {branchChannels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                active={c.id === activeId}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </Section>
        )}

        <Section title="Direct messages">
          {dmChannels.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No direct messages yet. Start one with the + button.
            </p>
          ) : (
            dmChannels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                active={c.id === activeId}
                onClick={() => onSelect(c.id)}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div>{children}</div>
    </div>
  )
}

function ChannelRow({
  channel,
  active,
  onClick,
}: {
  channel: ChatChannelSummary
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted',
        active && 'bg-muted',
      )}
    >
      {channel.kind === 'branch' ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Hash className="h-4 w-4" />
        </span>
      ) : (
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={channel.avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{initialsFrom(channel.name)}</AvatarFallback>
        </Avatar>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{channel.name}</span>
          {channel.lastMessageAt && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(channel.lastMessageAt), { addSuffix: false })}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {channel.lastMessagePreview ?? 'No messages yet'}
          </span>
          {channel.unread > 0 && (
            <Badge className="h-5 min-w-5 shrink-0 justify-center px-1.5">{channel.unread}</Badge>
          )}
        </span>
      </span>
    </button>
  )
}

function NewDmDialog({
  dmCandidates,
  onOpened,
}: {
  dmCandidates: ChatUser[]
  onOpened: (channelId: string) => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = dmCandidates.filter((u) =>
    (u.fullName ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  const start = async (userId: string) => {
    setPendingId(userId)
    const res = await openDirectMessage(userId)
    if (!res.ok) {
      setPendingId(null)
      toast.error(res.error)
      return
    }
    await onOpened(res.data!.channelId)
    setPendingId(null)
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="New direct message">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search colleagues"
            className="pl-8"
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No colleagues found.</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={pendingId !== null}
                onClick={() => void start(u.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted disabled:opacity-60"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>{initialsFrom(u.fullName)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">{u.fullName ?? 'Unknown'}</span>
                {u.role && (
                  <span className="text-xs capitalize text-muted-foreground">{u.role}</span>
                )}
                {pendingId === u.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

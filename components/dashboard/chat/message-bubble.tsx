'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { SmilePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { ChatMessage } from '@/lib/chat/types'
import { toggleReaction } from '@/lib/chat/actions'
import { initialsFrom, QUICK_REACTIONS } from './utils'

interface MessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
  grouped: boolean
  onReacted: () => void
}

export function MessageBubble({ message, isOwn, grouped, onReacted }: MessageBubbleProps) {
  const [, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)

  const react = (emoji: string) => {
    setPickerOpen(false)
    startTransition(async () => {
      await toggleReaction({ messageId: message.id, emoji })
      onReacted()
    })
  }

  // Water-balloon messages get a playful, centered treatment.
  if (message.kind === 'water_balloon') {
    return (
      <div className="my-2 flex justify-center">
        <div className="rounded-full bg-sky-500/10 px-4 py-1.5 text-center text-sm text-sky-700 dark:text-sky-300">
          {message.body}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group flex gap-2', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-8 shrink-0">
        {!grouped && !isOwn && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.senderAvatar ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{initialsFrom(message.senderName)}</AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className={cn('flex max-w-[75%] flex-col', isOwn ? 'items-end' : 'items-start')}>
        {!grouped && !isOwn && (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
            {message.senderName ?? 'Unknown'}
          </span>
        )}
        <div className={cn('flex items-center gap-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm',
              isOwn
                ? 'rounded-br-sm bg-primary text-primary-foreground'
                : 'rounded-bl-sm bg-muted text-foreground',
            )}
          >
            {message.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.imageUrl || '/placeholder.svg'}
                alt="Shared attachment"
                className="mb-1 max-h-64 rounded-lg object-cover"
              />
            )}
            {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
            <span
              className={cn(
                'mt-0.5 block text-[10px]',
                isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
          </div>

          {/* Reaction picker */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                aria-label="Add reaction"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" side="top">
              <div className="flex gap-0.5">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(emoji)}
                    className="rounded p-1.5 text-lg leading-none hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Existing reactions */}
        {message.reactions.length > 0 && (
          <div className={cn('mt-1 flex flex-wrap gap-1', isOwn && 'justify-end')}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => react(r.emoji)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                  r.reactedByMe
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-transparent bg-muted hover:bg-muted/70',
                )}
              >
                <span className="leading-none">{r.emoji}</span>
                <span className="text-[10px] text-muted-foreground">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

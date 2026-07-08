'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, Check, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { markNotificationsRead } from '@/app/(dashboard)/dashboard/notifications/actions'
import { PushToggle } from './push-toggle'

interface NotificationRow {
  id: string
  title: string
  body: string | null
  url: string | null
  category: string
  read_at: string | null
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { data, mutate } = useSWR<{ notifications: NotificationRow[]; unread: number }>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const notifications = data?.notifications ?? []
  const unread = data?.unread ?? 0
  // Any unread emergency call ⇒ make the bell impossible to miss.
  const hasUnreadEmergency = notifications.some(
    (n) => n.category === 'emergency_call' && !n.read_at,
  )

  async function handleMarkAll() {
    await markNotificationsRead()
    mutate()
  }

  async function handleClick(n: NotificationRow) {
    if (!n.read_at) {
      await markNotificationsRead(n.id)
      mutate()
    }
    setOpen(false)
    if (n.url) router.push(n.url)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', hasUnreadEmergency && 'text-destructive')}
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}${
            hasUnreadEmergency ? ', including an emergency' : ''
          }`}
        >
          {hasUnreadEmergency ? (
            <Siren className="h-5 w-5 animate-pulse" />
          ) : unread > 0 ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unread > 0 && (
            <Badge
              className={cn(
                'absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] tabular-nums',
                hasUnreadEmergency && 'animate-pulse',
              )}
              variant="destructive"
            >
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-auto gap-1.5 px-2 py-1 text-xs" onClick={handleMarkAll}>
              <Check className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="border-b px-4 py-3">
          <PushToggle />
        </div>

        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      'flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      !n.read_at && 'bg-muted/40',
                      n.category === 'emergency_call' &&
                        !n.read_at &&
                        'border-l-2 border-destructive bg-destructive/5',
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span
                        className={cn(
                          'flex items-center gap-1.5 text-sm font-medium leading-snug',
                          n.category === 'emergency_call' && 'text-destructive',
                        )}
                      >
                        {n.category === 'emergency_call' && <Siren className="h-3.5 w-3.5 shrink-0" />}
                        {n.title}
                      </span>
                      {!n.read_at && (
                        <span
                          className={cn(
                            'mt-1 h-2 w-2 shrink-0 rounded-full bg-primary',
                            n.category === 'emergency_call' && 'bg-destructive',
                          )}
                          aria-hidden
                        />
                      )}
                    </div>
                    {n.body && (
                      <span className="text-sm text-muted-foreground line-clamp-2">{n.body}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-xs">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

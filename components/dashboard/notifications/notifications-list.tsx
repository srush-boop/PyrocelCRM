'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Bell } from 'lucide-react'
import { cn, UK_TIME_ZONE } from '@/lib/utils'
import { markNotificationsRead } from '@/app/(dashboard)/dashboard/notifications/actions'

interface NotificationRow {
  id: string
  title: string
  body: string | null
  url: string | null
  category: string
  read_at: string | null
  created_at: string
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: UK_TIME_ZONE,
  })
}

export function NotificationsList({
  initialNotifications,
}: {
  initialNotifications: NotificationRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialNotifications)
  const hasUnread = items.some((n) => !n.read_at)

  async function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    await markNotificationsRead()
    router.refresh()
  }

  async function handleClick(n: NotificationRow) {
    if (!n.read_at) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)),
      )
      await markNotificationsRead(n.id)
    }
    if (n.url) router.push(n.url)
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You have no notifications yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {hasUnread && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleMarkAll}>
            <Check className="h-4 w-4" />
            Mark all as read
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex w-full flex-col items-start gap-1 px-4 py-4 text-left transition-colors hover:bg-muted/60',
                    !n.read_at && 'bg-muted/40',
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <span className="font-medium leading-snug">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatWhen(n.created_at)}
                    </span>
                  </div>
                  {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
                  {!n.read_at && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                      Unread
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

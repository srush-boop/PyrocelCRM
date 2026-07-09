'use client'

import useSWR from 'swr'
import { SidebarMenuBadge } from '@/components/ui/sidebar'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Small unread-count badge for the Chat item in the sidebar. Polls the unread
 * endpoint so the count stays roughly live without a websocket. Renders nothing
 * when there is nothing unread.
 */
export function ChatNavBadge() {
  const { data } = useSWR<{ count: number }>('/api/chat/unread', fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  })
  const total = data?.count ?? 0
  if (total <= 0) return null
  return <SidebarMenuBadge className="bg-primary text-primary-foreground">{total > 99 ? '99+' : total}</SidebarMenuBadge>
}

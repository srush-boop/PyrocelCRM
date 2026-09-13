'use client'

import useSWR from 'swr'
import type { TodoAttachment, TodoItem, TodoList } from '@/lib/types/database'
import type { WaitingBucket } from '@/lib/todo/waiting-for-you'
import type { TodoAssigneeView } from '@/lib/todo/queries'

export interface TodoPayload {
  buckets: WaitingBucket[]
  totalWaiting: number
  lists: TodoList[]
  items: TodoItem[]
  assignees: Record<string, TodoAssigneeView[]>
  attachments: Record<string, TodoAttachment[]>
  currentUserId: string
}

export interface Member {
  id: string
  full_name: string | null
  email: string
  role: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Central data hook for the To-Do feature. Polls modestly so the header badge
// and open panels stay fresh without hammering the aggregation sources.
export function useTodo() {
  const { data, error, isLoading, mutate } = useSWR<TodoPayload>('/api/todo', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
  return { data, error, isLoading, mutate }
}

export function useMembers(enabled: boolean) {
  const { data } = useSWR<{ members: Member[] }>(
    enabled ? '/api/todo/members' : null,
    fetcher,
  )
  return data?.members ?? []
}

'use client'

import useSWR from 'swr'
import type { TodoAttachment, TodoItem, TodoList } from '@/lib/types/database'
import type { WaitingBucket } from '@/lib/todo/waiting-for-you'
import type { TodoAssigneeView } from '@/lib/todo/queries'

// Personal to-do data — cheap to query, mutated constantly (check/delete/etc).
export interface TodoPersonalPayload {
  lists: TodoList[]
  items: TodoItem[]
  assignees: Record<string, TodoAssigneeView[]>
  attachments: Record<string, TodoAttachment[]>
  currentUserId: string
}

// The "waiting on you" aggregation — expensive, fetched on its own key so a
// to-do check/delete never blocks on it.
export interface TodoWaitingPayload {
  buckets: WaitingBucket[]
  totalWaiting: number
  currentUserId: string
}

// Merged shape consumers see (unchanged from before the split).
export interface TodoPayload extends TodoPersonalPayload {
  buckets: WaitingBucket[]
  totalWaiting: number
}

export interface Member {
  id: string
  full_name: string | null
  email: string
  role: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Central data hook for the To-Do feature. Personal to-dos and the "waiting on
// you" aggregation are fetched on SEPARATE keys: checking/deleting a to-do only
// revalidates the cheap personal key, so the UI never blocks on the heavy
// aggregation (which is what made check/delete feel like it wasn't working).
export function useTodo() {
  const {
    data: personal,
    error,
    isLoading,
    mutate: mutatePersonal,
  } = useSWR<TodoPersonalPayload>('/api/todo', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
  const { data: waiting, mutate: mutateWaiting } = useSWR<TodoWaitingPayload>(
    '/api/todo/waiting',
    fetcher,
    { refreshInterval: 120_000, revalidateOnFocus: true },
  )

  const data: TodoPayload | undefined = personal
    ? {
        ...personal,
        buckets: waiting?.buckets ?? [],
        totalWaiting: waiting?.totalWaiting ?? 0,
      }
    : undefined

  // Back-compat: mutate() refreshes both; mutateWaiting() only the inbox.
  const mutate = () => {
    void mutatePersonal()
    void mutateWaiting()
  }

  return { data, error, isLoading, mutate, mutatePersonal, mutateWaiting }
}

export function useMembers(enabled: boolean) {
  const { data } = useSWR<{ members: Member[] }>(
    enabled ? '/api/todo/members' : null,
    fetcher,
  )
  return data?.members ?? []
}

export interface TeamMemberView {
  user_id: string
  full_name: string | null
}

export interface TodoTeamView {
  id: string
  name: string
  color: string | null
  members: TeamMemberView[]
}

export function useTeams(enabled: boolean) {
  const { data, mutate } = useSWR<{ teams: TodoTeamView[] }>(
    enabled ? '/api/todo/teams' : null,
    fetcher,
  )
  return { teams: data?.teams ?? [], mutate }
}

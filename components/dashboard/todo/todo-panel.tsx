'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTodo } from './use-todo'
import { WaitingBuckets } from './waiting-buckets'
import { TodoItemRow } from './todo-item-row'
import { TodoComposer } from './todo-composer'
import { Button } from '@/components/ui/button'
import { ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// The slide-over contents: two tabs — what's waiting on you (aggregated) and
// your own to-dos (quick capture + list). Kept lean; the full page has lists.
export function TodoPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isLoading, mutate } = useTodo()
  const [tab, setTab] = useState<'waiting' | 'mine'>('waiting')

  const topLevel = (data?.items ?? []).filter((i) => !i.parent_id && i.status !== 'done')
  const sorted = [...topLevel].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.starred !== b.starred) return a.starred ? -1 : 1
    return 0
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-4 pb-3">
        <button
          type="button"
          onClick={() => setTab('waiting')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium',
            tab === 'waiting'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Waiting on you
          {data && data.totalWaiting > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {data.totalWaiting}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium',
            tab === 'mine'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          My to-dos
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : tab === 'waiting' ? (
          <WaitingBuckets buckets={data?.buckets ?? []} onNavigate={onNavigate} />
        ) : (
          <div className="space-y-3">
            <TodoComposer onCreated={() => mutate()} />
            <div className="space-y-0.5">
              {sorted.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No to-dos yet. Add one above.
                </p>
              ) : (
                sorted.map((item) => (
                  <TodoItemRow
                    key={item.id}
                    item={item}
                    subtasks={(data?.items ?? []).filter((s) => s.parent_id === item.id)}
                    assignees={data?.assignees[item.id] ?? []}
                    attachments={data?.attachments[item.id] ?? []}
                    currentUserId={data?.currentUserId}
                    onChanged={() => mutate()}
                    compact
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button asChild variant="outline" className="w-full gap-2" onClick={onNavigate}>
          <Link href="/dashboard/todo">
            <ExternalLink className="h-4 w-4" />
            Open full To-Do
          </Link>
        </Button>
      </div>
    </div>
  )
}

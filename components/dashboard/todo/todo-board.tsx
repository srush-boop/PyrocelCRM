'use client'

import { useMemo, useState } from 'react'
import { useTodo } from './use-todo'
import { WaitingBuckets } from './waiting-buckets'
import { TodoItemRow } from './todo-item-row'
import { TodoComposer } from './todo-composer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Inbox,
  Star,
  Pin,
  Plus,
  ListChecks,
  CircleDot,
  Trash2,
  Loader2,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodoItem, TodoList } from '@/lib/types/database'
import { createList, deleteList } from '@/app/(dashboard)/dashboard/todo/actions'

type Selection =
  | { kind: 'waiting' }
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'pinned' }
  | { kind: 'today' }
  | { kind: 'list'; id: string }

const LIST_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// Full-page To-Do workspace: left rail of smart views + custom lists, main
// column showing the selected view with quick capture. Mirrors Wunderlist-style
// organisation while reusing the same item row as the slide-over.
export function TodoBoard() {
  const { data, isLoading, mutate } = useTodo()
  const [selection, setSelection] = useState<Selection>({ kind: 'waiting' })
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListColor, setNewListColor] = useState<string>(LIST_COLORS[5])
  const [busy, setBusy] = useState(false)

  const items = data?.items ?? []
  const lists = data?.lists ?? []
  const topLevel = useMemo(() => items.filter((i) => !i.parent_id), [items])

  const counts = useMemo(() => {
    const open = topLevel.filter((i) => i.status !== 'done')
    return {
      all: open.length,
      starred: open.filter((i) => i.starred).length,
      pinned: open.filter((i) => i.pinned).length,
      today: open.filter((i) => isToday(i.due_at)).length,
      byList: (id: string) => open.filter((i) => i.list_id === id).length,
    }
  }, [topLevel])

  const visible = useMemo(() => {
    let rows = topLevel.filter((i) => i.status !== 'done')
    switch (selection.kind) {
      case 'starred':
        rows = rows.filter((i) => i.starred)
        break
      case 'pinned':
        rows = rows.filter((i) => i.pinned)
        break
      case 'today':
        rows = rows.filter((i) => isToday(i.due_at))
        break
      case 'list':
        rows = rows.filter((i) => i.list_id === selection.id)
        break
      case 'all':
      default:
        break
    }
    return [...rows].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.starred !== b.starred) return a.starred ? -1 : 1
      const at = a.due_at ? new Date(a.due_at).getTime() : Infinity
      const bt = b.due_at ? new Date(b.due_at).getTime() : Infinity
      return at - bt
    })
  }, [topLevel, selection])

  const doneItems = useMemo(
    () =>
      selection.kind === 'list'
        ? topLevel.filter((i) => i.status === 'done' && i.list_id === selection.id)
        : topLevel.filter((i) => i.status === 'done'),
    [topLevel, selection],
  )

  const activeListId = selection.kind === 'list' ? selection.id : null

  async function handleCreateList() {
    if (!newListName.trim() || busy) return
    setBusy(true)
    const res = await createList({ name: newListName.trim(), color: newListColor })
    setBusy(false)
    if (res.ok) {
      setShowNewList(false)
      setNewListName('')
      await mutate()
      if (res.list) setSelection({ kind: 'list', id: res.list.id })
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Left rail */}
      <aside className="w-full shrink-0 space-y-1 lg:w-60">
        <NavRow
          icon={<CircleDot className="h-4 w-4" />}
          label="Waiting on you"
          count={data?.totalWaiting}
          active={selection.kind === 'waiting'}
          onClick={() => setSelection({ kind: 'waiting' })}
          accent
        />
        <NavRow
          icon={<ListChecks className="h-4 w-4" />}
          label="All to-dos"
          count={counts.all}
          active={selection.kind === 'all'}
          onClick={() => setSelection({ kind: 'all' })}
        />
        <NavRow
          icon={<CircleDot className="h-4 w-4" />}
          label="Today"
          count={counts.today}
          active={selection.kind === 'today'}
          onClick={() => setSelection({ kind: 'today' })}
        />
        <NavRow
          icon={<Star className="h-4 w-4" />}
          label="Starred"
          count={counts.starred}
          active={selection.kind === 'starred'}
          onClick={() => setSelection({ kind: 'starred' })}
        />
        <NavRow
          icon={<Pin className="h-4 w-4" />}
          label="Pinned"
          count={counts.pinned}
          active={selection.kind === 'pinned'}
          onClick={() => setSelection({ kind: 'pinned' })}
        />

        <div className="flex items-center justify-between px-2 pb-1 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lists
          </span>
          <button
            type="button"
            onClick={() => setShowNewList(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="New list"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {lists.map((list) => (
          <ListNavRow
            key={list.id}
            list={list}
            count={counts.byList(list.id)}
            active={activeListId === list.id}
            onClick={() => setSelection({ kind: 'list', id: list.id })}
            onDelete={async () => {
              await deleteList(list.id)
              if (activeListId === list.id) setSelection({ kind: 'all' })
              await mutate()
            }}
          />
        ))}
        {lists.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            No lists yet. Create one to group your to-dos.
          </p>
        )}
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : selection.kind === 'waiting' ? (
          <WaitingBuckets buckets={data?.buckets ?? []} />
        ) : (
          <div className="space-y-4">
            <TodoComposer listId={activeListId} onCreated={() => mutate()} autoFocus />
            <div className="space-y-0.5">
              {visible.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 py-12 text-center">
                  <p className="text-sm font-medium">Nothing here yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a to-do above to get started.
                  </p>
                </div>
              ) : (
                visible.map((item) => (
                  <TodoItemRow
                    key={item.id}
                    item={item}
                    subtasks={items.filter((s) => s.parent_id === item.id)}
                    assignees={data?.assignees[item.id] ?? []}
                    onChanged={() => mutate()}
                  />
                ))
              )}
            </div>

            {doneItems.length > 0 && (
              <details className="pt-2">
                <summary className="cursor-pointer px-1 text-xs font-medium text-muted-foreground">
                  Completed ({doneItems.length})
                </summary>
                <div className="mt-1 space-y-0.5">
                  {doneItems.map((item) => (
                    <TodoItemRow
                      key={item.id}
                      item={item}
                      subtasks={items.filter((s) => s.parent_id === item.id)}
                      assignees={data?.assignees[item.id] ?? []}
                      onChanged={() => mutate()}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <Dialog open={showNewList} onOpenChange={setShowNewList}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New list</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newListName}
              autoFocus
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  handleCreateList()
                }
              }}
              placeholder="List name"
            />
            <div className="flex flex-wrap gap-2">
              {LIST_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewListColor(c)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background',
                    newListColor === c && 'ring-2 ring-foreground',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Colour ${c}`}
                >
                  {newListColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewList(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={busy || !newListName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NavRow({
  icon,
  label,
  count,
  active,
  onClick,
  accent,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
        active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted/60',
      )}
    >
      <span className={cn(active ? 'text-primary' : accent ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 text-xs',
            accent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function ListNavRow({
  list,
  count,
  active,
  onClick,
  onDelete,
}: {
  list: TodoList
  count: number
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
        active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted/60',
      )}
    >
      <button type="button" onClick={onClick} className="flex flex-1 items-center gap-2.5 text-left">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: list.color ?? '#94a3b8' }}
        />
        <span className="flex-1 truncate">{list.name}</span>
      </button>
      {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
        aria-label={`Delete list ${list.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

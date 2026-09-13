'use client'

import { useState } from 'react'
import type { TodoItem } from '@/lib/types/database'
import type { TodoAssigneeView } from '@/lib/todo/queries'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Star,
  Pin,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  CalendarPlus,
  Download,
  Trash2,
  MoreHorizontal,
  GripVertical,
  Check,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AssignPopover } from './assign-popover'
import { TodoComposer } from './todo-composer'
import {
  toggleItemDone,
  setItemFlag,
  deleteItem,
  updateItem,
  addToCalendar,
  respondToInvite,
} from '@/app/(dashboard)/dashboard/todo/actions'

function fmtDue(iso: string, allDay: boolean): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (allDay) return date
  return `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function TodoItemRow({
  item,
  subtasks,
  assignees,
  onChanged,
  compact,
  currentUserId,
  dragHandle,
}: {
  item: TodoItem
  subtasks: TodoItem[]
  assignees: TodoAssigneeView[]
  onChanged: () => void
  compact?: boolean
  currentUserId?: string
  dragHandle?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const done = item.status === 'done'
  const doneCount = subtasks.filter((s) => s.status === 'done').length

  // Whether the signed-in user is a collaborator (not the owner) who still
  // needs to respond to an assignment/invite.
  const me =
    currentUserId && item.owner_id !== currentUserId
      ? assignees.find((a) => a.user_id === currentUserId)
      : undefined
  const needsResponse = me?.response === 'pending'

  async function saveTitle() {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== item.title) {
      await updateItem({ id: item.id, title: trimmed })
      onChanged()
    } else {
      setTitle(item.title)
    }
  }

  async function setDue(value: string, allDay: boolean) {
    await updateItem({ id: item.id, dueAt: value || null, allDay })
    onChanged()
  }

  return (
    <div className="group/row rounded-lg border border-transparent hover:border-border/60 hover:bg-muted/30">
      <div className="flex items-start gap-2 px-2 py-1.5">
        {dragHandle}
        <Checkbox
          checked={done}
          onCheckedChange={async (v) => {
            await toggleItemDone({ id: item.id, done: Boolean(v) })
            onChanged()
          }}
          className="mt-1"
          aria-label={done ? 'Mark as not done' : 'Mark as done'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {(subtasks.length > 0 || !compact) && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {editing ? (
              <Input
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    saveTitle()
                  }
                  if (e.key === 'Escape') {
                    setTitle(item.title)
                    setEditing(false)
                  }
                }}
                className="h-7"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={cn(
                  'truncate text-left text-sm',
                  done && 'text-muted-foreground line-through',
                )}
              >
                {item.title}
              </button>
            )}
            {item.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
          </div>

          {/* meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-2 pl-5">
            {item.due_at && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs',
                  isOverdue(item.due_at) && !done ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="h-3 w-3" />
                {fmtDue(item.due_at, item.all_day)}
              </span>
            )}
            {subtasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {doneCount}/{subtasks.length} subtasks
              </span>
            )}
            {assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.user_id} className="h-4 w-4 border border-background">
                    <AvatarFallback className="bg-primary/10 text-[8px] text-primary">
                      {initials(a.full_name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
            {me?.response === 'declined' && (
              <span className="text-xs text-muted-foreground">You declined</span>
            )}
            {me?.response === 'accepted' && (
              <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-500">
                <Check className="h-3 w-3" /> You accepted
              </span>
            )}
          </div>

          {/* invite response prompt */}
          {needsResponse && (
            <div className="mt-1.5 flex items-center gap-2 pl-5">
              <span className="text-xs text-muted-foreground">
                {me?.role === 'invitee' ? 'You were invited' : 'Assigned to you'}
              </span>
              <Button
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={async () => {
                  await respondToInvite({ itemId: item.id, response: 'accepted' })
                  onChanged()
                }}
              >
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-2 text-xs"
                onClick={async () => {
                  await respondToInvite({ itemId: item.id, response: 'declined' })
                  onChanged()
                }}
              >
                <X className="h-3 w-3" /> Decline
              </Button>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={async () => {
              await setItemFlag({ id: item.id, field: 'starred', value: !item.starred })
              onChanged()
            }}
            aria-label={item.starred ? 'Unstar' : 'Star'}
          >
            <Star
              className={cn(
                'h-4 w-4',
                item.starred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
              )}
            />
          </Button>
          <AssignPopover
            itemId={item.id}
            existingUserIds={assignees.map((a) => a.user_id)}
            onChanged={onChanged}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DueDatePicker
                onPick={setDue}
                trigger={
                  <div className="flex cursor-pointer items-center px-2 py-1.5 text-sm hover:bg-muted/60">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {item.due_at ? 'Change date' : 'Set date'}
                  </div>
                }
              />
              <DropdownMenuItem
                onClick={async () => {
                  await setItemFlag({ id: item.id, field: 'pinned', value: !item.pinned })
                  onChanged()
                }}
              >
                <Pin className="mr-2 h-4 w-4" />
                {item.pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              {item.due_at && !item.calendar_entry_id && (
                <DropdownMenuItem
                  onClick={async () => {
                    await addToCalendar(item.id)
                    onChanged()
                  }}
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Add to calendar
                </DropdownMenuItem>
              )}
              {item.due_at && (
                <DropdownMenuItem asChild>
                  <a href={`/api/todo/${item.id}/ics`} download>
                    <Download className="mr-2 h-4 w-4" />
                    Download .ics
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={async () => {
                  await deleteItem(item.id)
                  onChanged()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1 pb-2 pl-9 pr-2">
          {item.notes && (
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              {item.notes}
            </p>
          )}
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 py-0.5">
              <Checkbox
                checked={sub.status === 'done'}
                onCheckedChange={async (v) => {
                  await toggleItemDone({ id: sub.id, done: Boolean(v) })
                  onChanged()
                }}
                aria-label="Toggle subtask"
              />
              <span
                className={cn(
                  'flex-1 text-sm',
                  sub.status === 'done' && 'text-muted-foreground line-through',
                )}
              >
                {sub.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={async () => {
                  await deleteItem(sub.id)
                  onChanged()
                }}
                aria-label="Delete subtask"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <div className="pt-1">
            <TodoComposer
              parentId={item.id}
              placeholder="Add a subtask..."
              onCreated={onChanged}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// A small date+time picker rendered inside the actions menu.
function DueDatePicker({
  onPick,
  trigger,
}: {
  onPick: (value: string, allDay: boolean) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Time (optional)</label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8" />
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!date}
          onClick={() => {
            if (!date) return
            const iso = time
              ? new Date(`${date}T${time}`).toISOString()
              : new Date(`${date}T09:00`).toISOString()
            onPick(iso, !time)
            setOpen(false)
          }}
        >
          Set date
        </Button>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TodoAttachment, TodoItem } from '@/lib/types/database'
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
  Check,
  X,
  Paperclip,
  FileText,
  Mail,
  Bell,
  BellOff,
  Tag as TagIcon,
  Plus,
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
  deleteAttachment,
} from '@/app/(dashboard)/dashboard/todo/actions'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  attachments = [],
  onChanged,
  compact,
  currentUserId,
  dragHandle,
}: {
  item: TodoItem
  subtasks: TodoItem[]
  assignees: TodoAssigneeView[]
  attachments?: TodoAttachment[]
  onChanged: () => void
  compact?: boolean
  currentUserId?: string
  dragHandle?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [uploading, setUploading] = useState(false)
  const [newTag, setNewTag] = useState('')
  // Optimistic completion + removal so the row responds instantly instead of
  // waiting on the round-trip (the old behaviour felt broken for 3-10s).
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null)
  const [removed, setRemoved] = useState(false)
  // Optimistic per-subtask completion state, keyed by subtask id.
  const [subDone, setSubDone] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const done = optimisticDone ?? item.status === 'done'
  const doneCount = subtasks.filter((s) => (subDone[s.id] ?? s.status === 'done')).length

  // The signed-in user is a collaborator (shared with) rather than the owner.
  const isCollaborator = Boolean(currentUserId && item.owner_id !== currentUserId)

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/todo/${item.id}/attachments`, {
        method: 'POST',
        body,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Upload failed.')
        return
      }
      toast.success('Attachment added.')
      onChanged()
    } catch {
      toast.error('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

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

  // Optimistically removed (deleted, or left by a collaborator) — drop it from
  // the list immediately; the revalidation confirms it.
  if (removed) return null

  return (
    <div
      className={cn(
        'group/row rounded-xl border transition-all',
        done
          ? 'border-transparent'
          : 'border-border/60 bg-card hover:border-border hover:shadow-sm',
        item.notable === false && !done && 'border-dashed opacity-75',
        item.pinned && !done && 'border-primary/40 bg-primary/[0.03]',
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {dragHandle}
        <Checkbox
          checked={done}
          onCheckedChange={async (v) => {
            const next = Boolean(v)
            setOptimisticDone(next)
            const res = await toggleItemDone({ id: item.id, done: next })
            if (!res.ok) {
              setOptimisticDone(null)
              toast.error(res.error || 'Could not update the to-do.')
              return
            }
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
            {item.notable === false && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title="Not counted in your open to-do totals"
              >
                <BellOff className="h-2.5 w-2.5" />
                Quiet
              </span>
            )}
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
            {attachments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {attachments.length}
              </span>
            )}
            {item.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                <TagIcon className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
            {assignees.length > 0 && (
              <div className="flex -space-x-2">
                {assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.user_id} className="h-7 w-7 border border-background">
                    <AvatarFallback className="bg-primary/10 text-[11px] text-primary">
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
              <DropdownMenuItem
                onClick={async () => {
                  await setItemFlag({
                    id: item.id,
                    field: 'notable',
                    value: item.notable === false,
                  })
                  onChanged()
                }}
              >
                {item.notable === false ? (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Count in totals
                  </>
                ) : (
                  <>
                    <BellOff className="mr-2 h-4 w-4" />
                    {"Don't count in totals"}
                  </>
                )}
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
                  setRemoved(true)
                  const res = await deleteItem(item.id)
                  if (!res.ok) {
                    setRemoved(false)
                    toast.error(res.error || 'Could not delete the to-do.')
                    return
                  }
                  onChanged()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isCollaborator ? 'Remove from my list' : 'Delete'}
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

          {/* attachments */}
          <div className="space-y-1">
            {attachments.map((att) => {
              const canRemove = !currentUserId || att.uploaded_by === currentUserId || item.owner_id === currentUserId
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1"
                >
                  {att.kind === 'email' ? (
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <a
                    href={`/api/todo/attachment/${att.id}`}
                    className="min-w-0 flex-1 truncate text-xs hover:underline"
                    title={att.file_name}
                  >
                    {att.file_name}
                  </a>
                  {att.size_bytes != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatBytes(att.size_bytes)}
                    </span>
                  )}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={async () => {
                        const res = await deleteAttachment(att.id)
                        if (!res.ok) {
                          toast.error(res.error || 'Could not remove attachment.')
                          return
                        }
                        onChanged()
                      }}
                      aria-label={`Remove ${att.file_name}`}
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              )
            })}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
                e.target.value = ''
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {uploading ? 'Uploading...' : 'Attach file or email'}
            </Button>
          </div>

          {/* tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {item.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-primary"
              >
                {t}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-primary/20"
                  aria-label={`Remove tag ${t}`}
                  onClick={async () => {
                    const next = item.tags.filter((x) => x !== t)
                    const res = await updateItem({ id: item.id, tags: next })
                    if (!res.ok) {
                      toast.error(res.error || 'Could not update tags.')
                      return
                    }
                    onChanged()
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={async (e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key !== 'Enter') return
                e.preventDefault()
                const t = newTag.trim()
                if (!t) return
                if (item.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
                  setNewTag('')
                  return
                }
                const res = await updateItem({ id: item.id, tags: [...item.tags, t] })
                if (!res.ok) {
                  toast.error(res.error || 'Could not add tag.')
                  return
                }
                setNewTag('')
                onChanged()
              }}
              placeholder="Add tag..."
              className="h-6 w-24 border-dashed px-2 text-[11px]"
            />
          </div>

          {subtasks.map((sub) => {
            const subChecked = subDone[sub.id] ?? sub.status === 'done'
            return (
            <div key={sub.id} className="flex items-center gap-2 py-0.5">
              <Checkbox
                checked={subChecked}
                onCheckedChange={async (v) => {
                  const next = Boolean(v)
                  setSubDone((m) => ({ ...m, [sub.id]: next }))
                  const res = await toggleItemDone({ id: sub.id, done: next })
                  if (!res.ok) {
                    setSubDone((m) => ({ ...m, [sub.id]: !next }))
                    toast.error(res.error || 'Could not update the subtask.')
                    return
                  }
                  onChanged()
                }}
                aria-label="Toggle subtask"
              />
              <span
                className={cn(
                  'flex-1 text-sm',
                  subChecked && 'text-muted-foreground line-through',
                )}
              >
                {sub.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={async () => {
                  const res = await deleteItem(sub.id)
                  if (!res.ok) {
                    toast.error(res.error || 'Could not delete the subtask.')
                    return
                  }
                  onChanged()
                }}
                aria-label="Delete subtask"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
            )
          })}
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

'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  Printer,
  Send,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { SavedGridView, SharedGridView } from '@/lib/types/database'
import {
  addSharedViewComment,
  deleteGridView,
  deleteSharedView,
  getShareableUsers,
  markSharedViewRead,
  saveGridView,
  setDefaultGridView,
  setSharedViewResolved,
  shareGridView,
} from '@/lib/actions/grid-views'

export interface PrintMode {
  key: string
  label: string
}

interface GridViewsBarProps {
  gridKey: string
  /** Current serialised filter state of the grid. */
  filters: Record<string, unknown>
  /** True when the current filters differ from the unfiltered baseline. */
  isFiltered: boolean
  /** Apply a saved/shared filter object back onto the grid. */
  onApply: (filters: Record<string, unknown>) => void
  savedViews: SavedGridView[]
  sharedViews: SharedGridView[]
  currentUserId: string
  /** Print handler; receives the chosen mode key. */
  onPrint?: (mode: string) => void
  /** Optional multiple print modes; when >1 a menu is shown. */
  printModes?: PrintMode[]
}

export function GridViewsBar({
  gridKey,
  filters,
  isFiltered,
  onApply,
  savedViews,
  sharedViews,
  currentUserId,
  onPrint,
  printModes,
}: GridViewsBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Name of the currently-applied view (for the title). Cleared when the user
  // edits filters away from it.
  const [activeView, setActiveView] = useState<{ id: string; name: string } | null>(null)
  const appliedFiltersRef = useRef<string>('')

  // Auto-apply the user's default view once on first mount.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const deepLink = searchParams.get('sharedView')
    if (deepLink) {
      const shared = sharedViews.find((v) => v.id === deepLink)
      if (shared) {
        applyView(shared.filters, { id: shared.id, name: shared.name })
        setInboxOpen(true)
        if (shared.recipient_id === currentUserId && !shared.read_at) {
          void markSharedViewRead(shared.id)
        }
        return
      }
    }
    const def = savedViews.find((v) => v.is_default)
    if (def) applyView(def.filters, { id: def.id, name: def.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When filters change away from the applied view, drop the active-view label.
  useEffect(() => {
    const serialised = JSON.stringify(filters)
    if (activeView && serialised !== appliedFiltersRef.current) {
      setActiveView(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  function applyView(f: Record<string, unknown>, view: { id: string; name: string } | null) {
    onApply(f)
    appliedFiltersRef.current = JSON.stringify(f)
    setActiveView(view)
  }

  // ---- Save dialog -------------------------------------------------------
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDefault, setSaveDefault] = useState(false)

  function handleSave() {
    startTransition(async () => {
      const res = await saveGridView({
        gridKey,
        name: saveName,
        filters,
        isDefault: saveDefault,
      })
      if (res.ok) {
        toast.success('View saved')
        setSaveOpen(false)
        setSaveName('')
        setSaveDefault(false)
        if (res.id) {
          appliedFiltersRef.current = JSON.stringify(filters)
          setActiveView({ id: res.id, name: saveName.trim() })
        }
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save view')
      }
    })
  }

  function handleSetDefault(id: string | null) {
    startTransition(async () => {
      const res = await setDefaultGridView({ gridKey, id })
      if (res.ok) {
        toast.success(id ? 'Default view set' : 'Default cleared')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not update default')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteGridView(gridKey, id)
      if (res.ok) {
        toast.success('View deleted')
        if (activeView?.id === id) setActiveView(null)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not delete view')
      }
    })
  }

  // ---- Share dialog ------------------------------------------------------
  const [shareOpen, setShareOpen] = useState(false)
  const [shareName, setShareName] = useState('')
  const [shareNote, setShareNote] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [users, setUsers] = useState<{ id: string; full_name: string | null }[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  function openShare() {
    setShareName(activeView?.name ?? '')
    setShareOpen(true)
    if (users.length === 0) {
      setUsersLoading(true)
      getShareableUsers()
        .then(setUsers)
        .finally(() => setUsersLoading(false))
    }
  }

  function handleShare() {
    startTransition(async () => {
      const res = await shareGridView({
        gridKey,
        name: shareName.trim() || 'Shared view',
        filters,
        recipientId,
        note: shareNote,
      })
      if (res.ok) {
        toast.success('View shared')
        setShareOpen(false)
        setShareNote('')
        setRecipientId('')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not share view')
      }
    })
  }

  // ---- Shared inbox ------------------------------------------------------
  const [inboxOpen, setInboxOpen] = useState(false)
  const unreadShared = useMemo(
    () =>
      sharedViews.filter((v) => v.recipient_id === currentUserId && !v.read_at && !v.resolved)
        .length,
    [sharedViews, currentUserId],
  )

  const printModeList = printModes && printModes.length > 0 ? printModes : null

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      {/* Active view name in the title area */}
      {activeView && (
        <Badge variant="secondary" className="gap-1.5 py-1 pl-2 pr-1">
          <Bookmark className="h-3.5 w-3.5" />
          <span className="max-w-[160px] truncate">{activeView.name}</span>
          <button
            onClick={() => {
              onApply({})
              setActiveView(null)
            }}
            className="rounded p-0.5 hover:bg-muted"
            aria-label="Clear applied view"
          >
            <Check className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {/* Saved views dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-4 w-4" />
            Views
            {savedViews.length > 0 && (
              <span className="text-xs text-muted-foreground">({savedViews.length})</span>
            )}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {savedViews.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No saved views yet. Filter the grid, then save a view.
            </div>
          ) : (
            savedViews.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-accent"
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-sm"
                  onClick={() => applyView(v.filters, { id: v.id, name: v.name })}
                >
                  <span className="truncate">{v.name}</span>
                  {v.is_default && (
                    <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                      Default
                    </Badge>
                  )}
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-amber-500"
                  title={v.is_default ? 'Remove as default' : 'Set as default'}
                  onClick={() => handleSetDefault(v.is_default ? null : v.id)}
                >
                  <Star className={cn('h-3.5 w-3.5', v.is_default && 'fill-amber-400 text-amber-500')} />
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Delete view"
                  onClick={() => handleDelete(v.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setSaveName(activeView?.name ?? '')
              setSaveDefault(false)
              setSaveOpen(true)
            }}
            disabled={!isFiltered}
          >
            <BookmarkPlus className="mr-2 h-4 w-4" />
            Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Share */}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={openShare} disabled={!isFiltered}>
        <Send className="h-4 w-4" />
        Send
      </Button>

      {/* Shared-with-me inbox */}
      <Popover open={inboxOpen} onOpenChange={setInboxOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Shared
            {unreadShared > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {unreadShared}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <SharedInbox
            sharedViews={sharedViews}
            currentUserId={currentUserId}
            onApply={(f, v) => {
              applyView(f, v)
              setInboxOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Print */}
      {onPrint &&
        (printModeList ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {printModeList.map((m) => (
                <DropdownMenuItem key={m.key} onClick={() => onPrint(m.key)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPrint('default')}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        ))}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Save the current filters as a reusable view. Set it as your default to apply it
              automatically when you open this grid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. My overdue calls"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={saveDefault}
                onCheckedChange={(c) => setSaveDefault(c === true)}
              />
              Set as my default view for this grid
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || !saveName.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this view</DialogTitle>
            <DialogDescription>
              Send the current filtered view to a colleague with a note. They can open it and reply
              in a shared discussion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="share-name">View name</Label>
              <Input
                id="share-name"
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
                placeholder="e.g. Overdue in Leeds"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={recipientId} onValueChange={setRecipientId}>
                <SelectTrigger>
                  <SelectValue placeholder={usersLoading ? 'Loading…' : 'Choose a colleague'} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name ?? 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-note">Note / comment</Label>
              <Textarea
                id="share-note"
                value={shareNote}
                onChange={(e) => setShareNote(e.target.value)}
                placeholder="Add context or a question for the recipient…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={isPending || !recipientId}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Inbox popover body: list of shared views + inline comment thread. */
function SharedInbox({
  sharedViews,
  currentUserId,
  onApply,
}: {
  sharedViews: SharedGridView[]
  currentUserId: string
  onApply: (filters: Record<string, unknown>, view: { id: string; name: string }) => void
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)

  if (sharedViews.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No shared views yet. Filter a grid and use “Send” to share one with a colleague.
      </div>
    )
  }

  return (
    <ScrollArea className="max-h-[420px]">
      <div className="divide-y">
        {sharedViews.map((v) => {
          const incoming = v.recipient_id === currentUserId
          const who = incoming ? v.sender?.full_name : v.recipient?.full_name
          const unread = incoming && !v.read_at && !v.resolved
          const isOpen = openId === v.id
          return (
            <div key={v.id} className="p-3">
              <div className="flex items-start gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setOpenId(isOpen ? null : v.id)
                    if (unread) void markSharedViewRead(v.id).then(() => router.refresh())
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                    <span className="truncate text-sm font-medium">{v.name}</span>
                    {v.resolved && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {incoming ? 'From' : 'To'} {who ?? 'Unknown'} ·{' '}
                    {v.comments?.length ?? 0} comment{(v.comments?.length ?? 0) === 1 ? '' : 's'}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => onApply(v.filters, { id: v.id, name: v.name })}
                >
                  Apply
                </Button>
              </div>
              {isOpen && <SharedThread view={v} currentUserId={currentUserId} />}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function SharedThread({
  view,
  currentUserId,
}: {
  view: SharedGridView
  currentUserId: string
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!body.trim()) return
    startTransition(async () => {
      const res = await addSharedViewComment({ sharedViewId: view.id, body })
      if (res.ok) {
        setBody('')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not post comment')
      }
    })
  }

  function toggleResolved() {
    startTransition(async () => {
      await setSharedViewResolved(view.id, !view.resolved)
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await deleteSharedView(view.id)
      router.refresh()
    })
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
      {view.note && (
        <p className="whitespace-pre-wrap rounded bg-background p-2 text-xs">{view.note}</p>
      )}
      <div className="space-y-1.5">
        {(view.comments ?? []).map((c) => (
          <div
            key={c.id}
            className={cn(
              'rounded p-1.5 text-xs',
              c.author_id === currentUserId ? 'bg-primary/10' : 'bg-background',
            )}
          >
            <span className="font-medium">{c.author?.full_name ?? 'Unknown'}: </span>
            <span className="whitespace-pre-wrap">{c.body}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply…"
          rows={2}
          className="min-h-0 text-xs"
        />
        <Button size="sm" className="h-8 shrink-0" onClick={submit} disabled={isPending || !body.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={toggleResolved}>
          {view.resolved ? 'Reopen' : 'Mark resolved'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-muted-foreground hover:text-destructive"
          onClick={remove}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>
      </div>
    </div>
  )
}

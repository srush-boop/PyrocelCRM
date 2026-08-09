'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  GripVertical,
  LayoutGrid,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  setTileOrder,
  setTileHidden,
  setCustomTiles,
} from '@/app/(dashboard)/dashboard/tile-color-actions'
import { TILE_COLOR_OPTIONS } from '@/lib/service-colors'
import type { CustomDashboardTile } from '@/lib/types/database'
import Link from 'next/link'
import { toast } from 'sonner'

export type DashboardTile = {
  /** Stable key — the tile's title. */
  title: string
  /** Server-rendered card node for this tile. */
  node: ReactNode
}

/**
 * Client wrapper around the manager/admin dashboard module grid. In edit mode a
 * user can: drag built-in tiles into their preferred order, show/hide built-in
 * tiles, and add/remove custom shortcut tiles that link anywhere in the app.
 *
 * Built-in tiles are server-rendered and passed in as { title, node }; custom
 * tiles are rendered here from the persisted profile list.
 */
export function DashboardTileGrid({
  tiles,
  savedOrder,
  hiddenTiles,
  customTiles,
}: {
  tiles: DashboardTile[]
  savedOrder: string[]
  hiddenTiles: string[]
  customTiles: CustomDashboardTile[]
}) {
  const initialOrder = useMemo(() => orderTitles(tiles, savedOrder), [tiles, savedOrder])

  const [order, setOrder] = useState<string[]>(initialOrder)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenTiles))
  const [custom, setCustom] = useState<CustomDashboardTile[]>(customTiles)
  const [editing, setEditing] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)

  const byTitle = useMemo(() => {
    const map = new Map<string, ReactNode>()
    for (const t of tiles) map.set(t.title, t.node)
    return map
  }, [tiles])

  const dirty = useMemo(
    () => order.length !== initialOrder.length || order.some((t, i) => t !== initialOrder[i]),
    [order, initialOrder],
  )

  const handleDragStart = (index: number) => setDraggedIndex(index)

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(draggedIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => setDraggedIndex(null)

  const toggleHidden = (title: string) => {
    const willHide = !hidden.has(title)
    setHidden((prev) => {
      const next = new Set(prev)
      if (willHide) next.add(title)
      else next.delete(title)
      return next
    })
    startTransition(async () => {
      const res = await setTileHidden(title, willHide)
      if (!res.ok) toast.error(res.error ?? 'Could not update tile visibility.')
    })
  }

  const save = () => {
    startTransition(async () => {
      const res = await setTileOrder(order)
      if (res.ok) {
        toast.success('Dashboard layout saved.')
        setEditing(false)
      } else {
        toast.error(res.error ?? 'Could not save your layout.')
      }
    })
  }

  const reset = () => {
    const natural = tiles.map((t) => t.title)
    setOrder(natural)
    startTransition(async () => {
      const res = await setTileOrder([])
      if (res.ok) {
        toast.success('Dashboard layout reset to default.')
        setEditing(false)
      } else {
        toast.error(res.error ?? 'Could not reset your layout.')
      }
    })
  }

  const persistCustom = (next: CustomDashboardTile[]) => {
    setCustom(next)
    startTransition(async () => {
      const res = await setCustomTiles(next)
      if (!res.ok) toast.error(res.error ?? 'Could not save your shortcut tiles.')
    })
  }

  const removeCustom = (id: string) => persistCustom(custom.filter((t) => t.id !== id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)} disabled={isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Add shortcut
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset order
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOrder(initialOrder)
                setEditing(false)
              }}
              disabled={isPending}
            >
              Done
            </Button>
            <Button size="sm" onClick={save} disabled={isPending || !dirty}>
              <Check className="mr-2 h-4 w-4" />
              {isPending ? 'Saving…' : 'Save order'}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Customise
          </Button>
        )}
      </div>

      {editing && (
        <p className="text-sm text-muted-foreground">
          Drag tiles to reorder, use the eye icon to hide a tile, and add custom shortcut tiles that
          link anywhere in the app. Changes to visibility and shortcuts save automatically; press
          “Save order” to keep a new arrangement.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {order.map((title, index) => {
          const node = byTitle.get(title)
          if (!node) return null
          const isHidden = hidden.has(title)
          // When not editing, hidden tiles are removed entirely.
          if (isHidden && !editing) return null
          return (
            <div
              key={title}
              draggable={editing}
              onDragStart={editing ? () => handleDragStart(index) : undefined}
              onDragOver={editing ? (e) => handleDragOver(e, index) : undefined}
              onDragEnd={editing ? handleDragEnd : undefined}
              className={cn(
                'relative transition-opacity',
                editing && 'cursor-grab active:cursor-grabbing',
                editing && draggedIndex === index && 'opacity-50',
                isHidden && editing && 'opacity-40',
              )}
            >
              {editing && (
                <div className="absolute right-2 top-2 z-[2] flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleHidden(title)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
                    aria-label={isHidden ? `Show ${title} tile` : `Hide ${title} tile`}
                    title={isHidden ? 'Show tile' : 'Hide tile'}
                  >
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm"
                    aria-hidden="true"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                </div>
              )}
              <div className={editing ? 'pointer-events-none select-none' : undefined}>{node}</div>
            </div>
          )
        })}

        {/* Custom shortcut tiles render after the built-in tiles. */}
        {custom.map((tile) => (
          <div key={tile.id} className="relative">
            {editing && (
              <button
                type="button"
                onClick={() => removeCustom(tile.id)}
                className="absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm hover:text-destructive"
                aria-label={`Remove ${tile.title} shortcut`}
                title="Remove shortcut"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <Link
              href={editing ? '#' : tile.href}
              onClick={editing ? (e) => e.preventDefault() : undefined}
              className={cn(
                'flex h-full min-h-[104px] flex-col justify-between rounded-xl border p-4 shadow-sm transition-colors hover:bg-accent/40',
                editing && 'pointer-events-none',
              )}
              style={
                tile.color
                  ? { borderLeftColor: tile.color, borderLeftWidth: 4 }
                  : { borderLeftColor: 'var(--primary)', borderLeftWidth: 4 }
              }
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${tile.color ?? '#2563eb'}1a`, color: tile.color ?? '#2563eb' }}
              >
                <ExternalLink className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium leading-tight text-balance">{tile.title}</p>
                <p className="truncate text-xs text-muted-foreground">{tile.href}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <AddCustomTileDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(tile) => persistCustom([...custom, tile])}
      />
    </div>
  )
}

/** Dialog to create a custom shortcut tile. */
function AddCustomTileDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (tile: CustomDashboardTile) => void
}) {
  const [title, setTitle] = useState('')
  const [href, setHref] = useState('')
  const [color, setColor] = useState<string>(TILE_COLOR_OPTIONS[0].value)

  const reset = () => {
    setTitle('')
    setHref('')
    setColor(TILE_COLOR_OPTIONS[0].value)
  }

  const valid = title.trim() !== '' && href.trim().startsWith('/')

  const submit = () => {
    if (!valid) return
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim().slice(0, 40),
      href: href.trim(),
      color,
      icon: null,
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a shortcut tile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tile-title">Label</Label>
            <Input
              id="tile-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Overdue calls"
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tile-href">Link (in-app path)</Label>
            <Input
              id="tile-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/dashboard/schedule"
            />
            <p className="text-xs text-muted-foreground">
              Must start with “/”. Copy it from the address bar of the page you want to link to.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {TILE_COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform',
                    color === c.value
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.label}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Add tile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Order tile titles: saved titles that still exist first (in saved order), then
 * any remaining tiles in their natural (server) order.
 */
function orderTitles(tiles: DashboardTile[], savedOrder: string[]): string[] {
  const existing = new Set(tiles.map((t) => t.title))
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const title of savedOrder) {
    if (existing.has(title) && !seen.has(title)) {
      ordered.push(title)
      seen.add(title)
    }
  }
  for (const t of tiles) {
    if (!seen.has(t.title)) ordered.push(t.title)
  }
  return ordered
}

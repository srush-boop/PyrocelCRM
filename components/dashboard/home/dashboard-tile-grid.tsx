'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { GripVertical, LayoutGrid, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setTileOrder } from '@/app/(dashboard)/dashboard/tile-color-actions'
import { toast } from 'sonner'

export type DashboardTile = {
  /** Stable key — the tile's title. */
  title: string
  /** Server-rendered card node for this tile. */
  node: ReactNode
}

/**
 * Client wrapper around the manager/admin dashboard module grid that lets a user
 * drag tiles into their preferred order. The order is applied on the server via
 * `savedOrder` (so first paint is already correct) and edits are persisted to
 * the user's profile.
 *
 * Tiles are server-rendered and passed in as { title, node }; this component
 * only reorders them, so all data/colour logic stays on the server.
 */
export function DashboardTileGrid({
  tiles,
  savedOrder,
}: {
  tiles: DashboardTile[]
  savedOrder: string[]
}) {
  // Resolve the initial order: saved titles first (that still exist), then any
  // new tiles appended in their natural order.
  const initialOrder = useMemo(() => orderTitles(tiles, savedOrder), [tiles, savedOrder])

  const [order, setOrder] = useState<string[]>(initialOrder)
  const [editing, setEditing] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const byTitle = useMemo(() => {
    const map = new Map<string, ReactNode>()
    for (const t of tiles) map.set(t.title, t.node)
    return map
  }, [tiles])

  // Whether the current order differs from what's saved.
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
    // Reset to natural (unsaved) order and persist the empty preference.
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
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
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={isPending || !dirty}>
              <Check className="mr-2 h-4 w-4" />
              {isPending ? 'Saving…' : 'Save layout'}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Customise layout
          </Button>
        )}
      </div>

      {editing && (
        <p className="text-sm text-muted-foreground">
          Drag the tiles into your preferred order, then save.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {order.map((title, index) => {
          const node = byTitle.get(title)
          if (!node) return null
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
              )}
            >
              {editing && (
                <span
                  className="absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm"
                  aria-hidden="true"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
              )}
              {/* While editing, block the card's own links/pickers so the whole
                  tile acts as a drag handle. */}
              <div className={editing ? 'pointer-events-none select-none' : undefined}>{node}</div>
            </div>
          )
        })}
      </div>
    </div>
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

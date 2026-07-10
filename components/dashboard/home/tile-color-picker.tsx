'use client'

import { useState, useTransition } from 'react'
import { Check, Palette, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TILE_COLOR_OPTIONS } from '@/lib/dashboard-tile-colors'
import { setTileColor } from '@/app/(dashboard)/dashboard/tile-color-actions'

interface TileColorPickerProps {
  /** Tile identity (its title) used as the stored key. */
  tileKey: string
  /** Currently saved hex colour, or null for the theme default. */
  currentColor: string | null
}

/**
 * Small palette button shown on each dashboard tile. Lets the user recolour the
 * tile (or reset to default). Rendered above the tile's navigation overlay, so
 * it captures its own clicks without triggering navigation.
 */
export function TileColorPicker({ tileKey, currentColor }: TileColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function apply(color: string | null) {
    startTransition(async () => {
      const res = await setTileColor(tileKey, color)
      if (res.ok) {
        setOpen(false)
        toast.success(color ? `${tileKey} tile recoloured` : `${tileKey} tile reset`)
      } else {
        toast.error(res.error || 'Could not save tile colour')
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Change ${tileKey} tile colour`}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
      >
        <Palette className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Tile colour</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${tileKey} tile colour`}>
          {TILE_COLOR_OPTIONS.map((option) => {
            const selected = option.value.toLowerCase() === (currentColor ?? '').toLowerCase()
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                disabled={isPending}
                onClick={() => apply(option.value)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50',
                  selected ? 'ring-2 ring-ring ring-offset-2' : 'hover:scale-105',
                )}
                style={{ backgroundColor: option.value }}
              >
                {selected && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          disabled={isPending || !currentColor}
          onClick={() => apply(null)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to default
        </button>
      </PopoverContent>
    </Popover>
  )
}

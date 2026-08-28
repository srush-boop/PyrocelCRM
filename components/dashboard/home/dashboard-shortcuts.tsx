'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Check, X, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  SHORTCUT_GROUPS,
  resolveShortcut,
  normaliseShortcuts,
} from '@/lib/dashboard/shortcuts'
import { TILE_COLOR_OPTIONS } from '@/lib/service-colors'
import { setShortcut, setShortcutColor } from '@/app/(dashboard)/dashboard/tile-color-actions'

/**
 * User-configurable quick-shortcut cards in the dashboard "Quick links" row.
 * Only pinned shortcuts render as cards; a single "Add shortcut" tile appears
 * while below MAX_SHORTCUTS. Each card links to its destination and exposes a
 * pencil to change/clear it. Selections persist via `setShortcut`; per-shortcut
 * colour coding persists via `setShortcutColor` (keyed by catalogue key).
 */
export function DashboardShortcuts({
  saved,
  colors: savedColors,
}: {
  saved: string[] | null
  colors?: Record<string, string> | null
}) {
  // Local optimistic copy of the (padded) slots so the UI updates instantly.
  const [slots, setSlots] = useState<(string | null)[]>(() => normaliseShortcuts(saved))
  const [colors, setColors] = useState<Record<string, string>>(() => ({ ...(savedColors ?? {}) }))
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  const choose = (slot: number, key: string | null) => {
    setSlots((prev) => {
      const next = [...prev]
      // Moving a key already pinned elsewhere clears the old slot (no dupes).
      if (key) {
        for (let i = 0; i < next.length; i++) if (next[i] === key) next[i] = null
      }
      next[slot] = key
      return next
    })
    setOpenSlot(null)
    startTransition(async () => {
      await setShortcut(slot, key)
    })
  }

  const recolour = (key: string, color: string | null) => {
    setColors((prev) => {
      const next = { ...prev }
      if (color) next[key] = color
      else delete next[key]
      return next
    })
    startTransition(async () => {
      await setShortcutColor(key, color)
    })
  }

  // First empty slot index — where the "Add shortcut" tile writes to.
  const firstEmpty = slots.findIndex((s) => s === null)

  return (
    <>
      {slots.map((key, slot) => {
        const def = resolveShortcut(key)
        if (!def) return null
        const Icon = def.icon
        const color = key ? colors[key] : undefined
        return (
          <Card
            key={slot}
            className="group/shortcut relative flex items-center gap-1 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-accent/40"
            style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
          >
            <Link
              href={def.href}
              className="flex min-w-0 flex-1 items-center gap-2.5 focus:outline-none"
              aria-label={`Open ${def.label}`}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg',
                  !color && 'bg-primary/10 text-primary',
                )}
                style={color ? { backgroundColor: `${color}1a`, color } : undefined}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {def.label}
                </span>
                <span className="block text-xs text-muted-foreground">Shortcut</span>
              </span>
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Popover
                open={openSlot === slot}
                onOpenChange={(o) => setOpenSlot(o ? slot : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Change ${def.label} shortcut`}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:outline-none focus-visible:opacity-100 group-hover/shortcut:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <ShortcutPicker
                  activeKeys={slots}
                  onSelect={(k) => choose(slot, k)}
                  onClear={() => choose(slot, null)}
                  hasValue
                  colorKey={key}
                  currentColor={color ?? null}
                  onRecolour={recolour}
                />
              </Popover>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover/shortcut:translate-x-0.5" />
            </div>
          </Card>
        )
      })}

      {firstEmpty !== -1 && (
        <Popover
          open={openSlot === firstEmpty}
          onOpenChange={(o) => setOpenSlot(o ? firstEmpty : null)}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-xl border border-dashed bg-transparent px-3 py-2.5 text-left text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed">
                <Plus className="size-4" />
              </span>
              <span className="text-sm font-medium">Add shortcut</span>
            </button>
          </PopoverTrigger>
          <ShortcutPicker
            activeKeys={slots}
            onSelect={(k) => choose(firstEmpty, k)}
            onClear={() => choose(firstEmpty, null)}
            hasValue={false}
          />
        </Popover>
      )}
    </>
  )
}

function ShortcutPicker({
  activeKeys,
  onSelect,
  onClear,
  hasValue,
  colorKey,
  currentColor,
  onRecolour,
}: {
  activeKeys: (string | null)[]
  onSelect: (key: string) => void
  onClear: () => void
  hasValue: boolean
  // Colour coding is only offered for an already-pinned shortcut.
  colorKey?: string | null
  currentColor?: string | null
  onRecolour?: (key: string, color: string | null) => void
}) {
  return (
    <PopoverContent align="start" className="w-64 p-0">
      <Command>
        <CommandInput placeholder="Find a shortcut..." />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {SHORTCUT_GROUPS.map((group) => (
            <CommandGroup key={group.section} heading={group.section}>
              {group.items.map((s) => {
                const inUse = activeKeys.includes(s.key)
                return (
                  <CommandItem
                    key={s.key}
                    value={`${group.section} ${s.label}`}
                    onSelect={() => onSelect(s.key)}
                  >
                    <s.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{s.label}</span>
                    {inUse && <Check className="size-4 text-primary" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
          {hasValue && (
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={onClear}
                className="text-muted-foreground"
              >
                <X className="size-4" />
                Clear this slot
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      {hasValue && colorKey && onRecolour && (
        <div className="border-t p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Colour</p>
          <div className="flex flex-wrap gap-1.5">
            {TILE_COLOR_OPTIONS.map((c) => {
              const selected = (currentColor ?? '').toLowerCase() === c.value.toLowerCase()
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onRecolour(colorKey, c.value)}
                  aria-label={c.label}
                  title={c.label}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full transition',
                    selected ? 'ring-2 ring-ring ring-offset-1' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c.value }}
                >
                  {selected && <Check className="size-3 text-white" />}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => onRecolour(colorKey, null)}
              disabled={!currentColor}
              className="flex h-6 items-center rounded-md border px-2 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </PopoverContent>
  )
}

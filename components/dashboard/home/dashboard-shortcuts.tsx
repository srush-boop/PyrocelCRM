'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Check, X } from 'lucide-react'
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
  SHORTCUT_CATALOGUE,
  resolveShortcut,
  normaliseShortcuts,
} from '@/lib/dashboard/shortcuts'
import { setShortcut } from '@/app/(dashboard)/dashboard/tile-color-actions'

/**
 * Three user-configurable quick-shortcut slots that share the Lone Worker row.
 * Each slot links to its destination; the pencil opens a searchable picker to
 * change/clear it. Selections persist to the user's profile via `setShortcut`.
 */
export function DashboardShortcuts({ saved }: { saved: string[] | null }) {
  // Local optimistic copy of the 3 slots so the UI updates instantly on pick.
  const [slots, setSlots] = useState<(string | null)[]>(() => normaliseShortcuts(saved))
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

  return (
    <>
      {slots.map((key, slot) => {
        const def = resolveShortcut(key)
        const Icon = def?.icon
        return (
          <Card
            key={slot}
            className="group/shortcut relative flex items-center gap-2 px-3 py-2.5"
          >
            {def && Icon ? (
              <Link
                href={def.href}
                className="flex min-w-0 flex-1 items-center gap-2.5 focus:outline-none"
                aria-label={`Open ${def.label}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {def.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">Shortcut</span>
                </span>
              </Link>
            ) : (
              <Popover
                open={openSlot === slot}
                onOpenChange={(o) => setOpenSlot(o ? slot : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed">
                      <Plus className="size-4" />
                    </span>
                    <span className="text-sm font-medium">Add shortcut</span>
                  </button>
                </PopoverTrigger>
                <ShortcutPicker
                  activeKeys={slots}
                  onSelect={(k) => choose(slot, k)}
                  onClear={() => choose(slot, null)}
                  hasValue={false}
                />
              </Popover>
            )}

            {def && (
              <Popover
                open={openSlot === slot}
                onOpenChange={(o) => setOpenSlot(o ? slot : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Change ${def.label} shortcut`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:outline-none focus-visible:opacity-100 group-hover/shortcut:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <ShortcutPicker
                  activeKeys={slots}
                  onSelect={(k) => choose(slot, k)}
                  onClear={() => choose(slot, null)}
                  hasValue
                />
              </Popover>
            )}
          </Card>
        )
      })}
    </>
  )
}

function ShortcutPicker({
  activeKeys,
  onSelect,
  onClear,
  hasValue,
}: {
  activeKeys: (string | null)[]
  onSelect: (key: string) => void
  onClear: () => void
  hasValue: boolean
}) {
  return (
    <PopoverContent align="start" className="w-64 p-0">
      <Command>
        <CommandInput placeholder="Find a shortcut..." />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup>
            {SHORTCUT_CATALOGUE.map((s) => {
              const inUse = activeKeys.includes(s.key)
              return (
                <CommandItem
                  key={s.key}
                  value={s.label}
                  onSelect={() => onSelect(s.key)}
                >
                  <s.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{s.label}</span>
                  {inUse && <Check className="size-4 text-primary" />}
                </CommandItem>
              )
            })}
          </CommandGroup>
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
    </PopoverContent>
  )
}

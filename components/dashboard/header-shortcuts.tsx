'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Settings2, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SHORTCUT_GROUPS,
  MAX_HEADER_SHORTCUTS,
  normaliseHeaderShortcutKeys,
  resolveHeaderShortcuts,
} from '@/lib/dashboard/shortcuts'
import { setHeaderShortcuts } from '@/app/(dashboard)/dashboard/tile-color-actions'
import { toast } from 'sonner'

interface HeaderShortcutsProps {
  /** The user's currently pinned header shortcut keys (raw, unvalidated). */
  shortcuts: string[] | null
}

/**
 * Row of configurable micro-icon shortcuts rendered in the main dashboard
 * header. Each pinned catalogue destination shows as a compact icon button;
 * an inline gear popover lets the user toggle which destinations are pinned
 * (up to MAX_HEADER_SHORTCUTS), persisted per-user via setHeaderShortcuts.
 */
export function HeaderShortcuts({ shortcuts }: HeaderShortcutsProps) {
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  // Local optimistic copy so toggles feel instant; seeded from the server value.
  const [keys, setKeys] = useState<string[]>(() => normaliseHeaderShortcutKeys(shortcuts))

  const pinned = useMemo(() => resolveHeaderShortcuts(keys), [keys])

  const persist = (next: string[]) => {
    const clean = normaliseHeaderShortcutKeys(next)
    const prev = keys
    setKeys(clean)
    startTransition(async () => {
      const res = await setHeaderShortcuts(clean)
      if (!res.ok) {
        setKeys(prev) // roll back on failure
        toast.error(res.error ?? 'Could not save shortcuts.')
      }
    })
  }

  const toggle = (key: string) => {
    if (keys.includes(key)) {
      persist(keys.filter((k) => k !== key))
    } else {
      if (keys.length >= MAX_HEADER_SHORTCUTS) {
        toast.error(`You can pin up to ${MAX_HEADER_SHORTCUTS} shortcuts.`)
        return
      }
      persist([...keys, key])
    }
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <TooltipProvider delayDuration={200}>
      <div className="hidden items-center gap-0.5 md:flex">
        {pinned.map((s) => {
          const Icon = s.icon
          return (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-8 w-8 text-muted-foreground hover:text-foreground',
                    isActive(s.href) && 'bg-accent text-foreground',
                  )}
                >
                  <Link href={s.href} aria-label={s.label}>
                    <Icon className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{s.label}</TooltipContent>
            </Tooltip>
          )
        })}

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground/70 hover:text-foreground"
                  aria-label="Configure header shortcuts"
                >
                  {pinned.length === 0 ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <Settings2 className="h-4 w-4" />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {pinned.length === 0 ? 'Add shortcuts' : 'Edit shortcuts'}
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="flex items-center justify-between px-3 py-2.5">
              <p className="text-sm font-medium">Header shortcuts</p>
              <span className="text-xs text-muted-foreground">
                {pinned.length}/{MAX_HEADER_SHORTCUTS}
              </span>
            </div>
            <Separator />
            <Command>
              <CommandInput placeholder="Search pages..." />
              <CommandList className="max-h-72">
                <CommandEmpty>No matches.</CommandEmpty>
                {SHORTCUT_GROUPS.map((group) => (
                  <CommandGroup key={group.section} heading={group.section}>
                    {group.items.map((s) => {
                      const Icon = s.icon
                      const on = keys.includes(s.key)
                      const atCap = !on && keys.length >= MAX_HEADER_SHORTCUTS
                      return (
                        <CommandItem
                          key={s.key}
                          value={`${group.section} ${s.label}`}
                          disabled={pending || atCap}
                          onSelect={() => toggle(s.key)}
                          className={cn(on && 'bg-accent/60')}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1">{s.label}</span>
                          {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  )
}

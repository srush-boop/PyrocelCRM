'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface MultiSelectOption {
  id: string
  name: string
}

/**
 * Searchable multi-select filter. An empty selection means "All". Disabled with
 * a "None available" hint when there are no options (e.g. no areas configured).
 */
export function MultiSelectFilter({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const empty = options.length === 0
  const selected = new Set(value)

  const summary = empty
    ? 'None available'
    : value.length === 0
      ? 'All'
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.name ?? '1 selected')
        : `${value.length} selected`

  const toggle = (optionId: string) => {
    const next = new Set(selected)
    if (next.has(optionId)) next.delete(optionId)
    else next.add(optionId)
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id))
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {/* modal so wheel-scrolling the list works inside the parent Dialog */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={empty}
            className={cn(
              'w-full justify-between gap-2 px-3 font-normal',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">{summary}</span>
            <span className="flex shrink-0 items-center gap-1">
              {value.length > 1 && (
                <span className="rounded bg-secondary px-1.5 text-xs font-medium text-secondary-foreground">
                  {value.length}
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" aria-hidden="true" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList className="max-h-64">
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const checked = selected.has(o.id)
                  return (
                    <CommandItem
                      key={o.id}
                      value={`${o.name} ${o.id}`}
                      onSelect={() => toggle(o.id)}
                      className="gap-2"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary',
                          checked ? 'bg-primary text-primary-foreground' : 'opacity-50',
                        )}
                        aria-hidden="true"
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{o.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
            {value.length > 0 && (
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center gap-1 text-muted-foreground"
                  onClick={() => onChange([])}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear selection
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

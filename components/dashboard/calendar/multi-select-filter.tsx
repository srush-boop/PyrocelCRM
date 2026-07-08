'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
  hint?: string
}

interface MultiSelectFilterProps {
  // Short label shown when nothing is selected (e.g. "All items").
  allLabel: string
  // Noun used in the summary, e.g. "items" → "3 items".
  noun: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}

// A compact multi-select shown as a dropdown of checkboxes. An empty selection
// means "no filter" (all), which keeps the calendar's filter semantics simple.
export function MultiSelectFilter({
  allLabel,
  noun,
  options,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const selectedSet = new Set(selected)

  const toggle = (value: string) => {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange([...next])
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? `1 ${noun}`)
        : `${selected.length} ${noun}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('h-9 justify-between gap-2 font-normal', className)}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">{allLabel}</span>
          {selected.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No options</p>
            ) : (
              options.map((opt) => {
                const checked = selectedSet.has(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <Checkbox
                      checked={checked}
                      className="pointer-events-none"
                      tabIndex={-1}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {opt.hint}
                      </span>
                    )}
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchMultiSelectOption {
  value: string
  /** Text shown in the list and matched against the search query. */
  label: string
}

interface SearchMultiSelectProps {
  /** Currently selected values. Empty array = nothing selected (i.e. "all"). */
  values: string[]
  onChange: (values: string[]) => void
  options: SearchMultiSelectOption[]
  /** Trigger text shown when nothing is selected. */
  placeholder?: string
  /** Placeholder shown inside the search box. */
  searchPlaceholder?: string
  /** Message shown when the query matches nothing. */
  emptyText?: string
  disabled?: boolean
  id?: string
}

/**
 * A searchable multi-select dropdown (combobox) for large option lists such as
 * system and service types. Users type to filter and click to toggle options;
 * the trigger summarises the selection (label when one, "N selected" when many).
 * An empty selection means "all". Built on the shared Command + Popover
 * primitives, matching the single-select SearchSelect.
 */
export function SearchMultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Select options',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  disabled = false,
  id,
}: SearchMultiSelectProps) {
  const [open, setOpen] = useState(false)

  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value))
    else onChange([...values, value])
  }

  // Trigger summary: single label, count when many, placeholder when none.
  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? placeholder)
        : `${values.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', values.length === 0 && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {values.length > 0 && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => onChange([])}
                  className="justify-center text-xs text-muted-foreground"
                >
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((option) => {
                const checked = values.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DamperSizeOption } from '@/lib/types/database'

interface SizeComboboxProps {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}

/**
 * Editable size/shape dropdown bound to the shared `damper_size_options` table.
 * Users can pick an existing option or type a new one and add it to the shared
 * list (visible to everyone, across all sites).
 */
export function SizeCombobox({ value, onChange, id, placeholder }: SizeComboboxProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<DamperSizeOption[]>([])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let active = true
    supabase
      .from('damper_size_options')
      .select('*')
      .order('label')
      .then(({ data }) => {
        if (active && data) setOptions(data as DamperSizeOption[])
      })
    return () => {
      active = false
    }
  }, [supabase])

  const trimmed = query.trim()
  const exactExists = options.some(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  )

  const handleAdd = async () => {
    if (!trimmed) return
    setAdding(true)
    const { data, error } = await supabase
      .from('damper_size_options')
      .insert({ label: trimmed })
      .select()
      .single()
    setAdding(false)
    if (!error && data) {
      const added = data as DamperSizeOption
      setOptions((prev) =>
        [...prev, added].sort((a, b) => a.label.localeCompare(b.label)),
      )
      onChange(added.label)
    } else {
      // If it already existed (unique conflict) just select the typed value.
      onChange(trimmed)
    }
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && 'text-muted-foreground')}>
            {value || placeholder || 'Select size / shape'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type a new size…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-2">
              <p className="px-2 text-center text-sm text-muted-foreground">
                No matching size.
              </p>
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.label)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.label ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {trimmed && !exactExists && (
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleAdd}
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add &ldquo;{trimmed}&rdquo;
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

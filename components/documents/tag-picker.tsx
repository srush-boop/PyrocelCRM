'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, X, Tag as TagIcon } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DocumentTag } from '@/lib/types/database'

// A selected tag is either an existing tag (has id) or a pending new tag (name only).
export interface TagSelection {
  // Existing tag ids selected.
  tagIds: string[]
  // Brand-new tag names to be created on save.
  newTags: string[]
}

interface TagPickerProps {
  allTags: DocumentTag[]
  value: TagSelection
  onChange: (value: TagSelection) => void
  // Whether the user may create brand-new tags inline (admin/office only).
  allowCreate?: boolean
  disabled?: boolean
  placeholder?: string
}

export function TagPicker({
  allTags,
  value,
  onChange,
  allowCreate = true,
  disabled = false,
  placeholder = 'Add tags…',
}: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags])

  const selectedExisting = value.tagIds
    .map((id) => tagById.get(id))
    .filter((t): t is DocumentTag => !!t)

  const toggleExisting = (id: string) => {
    if (value.tagIds.includes(id)) {
      onChange({ ...value, tagIds: value.tagIds.filter((x) => x !== id) })
    } else {
      onChange({ ...value, tagIds: [...value.tagIds, id] })
    }
  }

  const removeNew = (name: string) =>
    onChange({ ...value, newTags: value.newTags.filter((n) => n !== name) })

  const trimmed = query.trim()
  // Does the typed text match an existing tag (case-insensitive)?
  const existingMatch = allTags.find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  )
  const alreadyNew = value.newTags.some(
    (n) => n.toLowerCase() === trimmed.toLowerCase(),
  )
  const canCreate = allowCreate && trimmed.length > 0 && !existingMatch && !alreadyNew

  const addNew = () => {
    if (!canCreate) return
    onChange({ ...value, newTags: [...value.newTags, trimmed] })
    setQuery('')
  }

  const hasSelection = selectedExisting.length > 0 || value.newTags.length > 0

  return (
    <div className="flex flex-col gap-2">
      {/* Selected chips */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1.5">
          {selectedExisting.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1">
              {t.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleExisting(t.id)}
                  aria-label={`Remove ${t.name}`}
                  className="ml-0.5 rounded-full hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {value.newTags.map((name) => (
            <Badge key={`new-${name}`} className="gap-1">
              {name}
              <span className="text-[10px] opacity-70">new</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeNew(name)}
                  aria-label={`Remove ${name}`}
                  className="ml-0.5 rounded-full hover:text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full justify-start text-muted-foreground font-normal"
          >
            <TagIcon className="mr-2 h-4 w-4" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-64" align="start">
          <Command>
            <CommandInput
              placeholder={allowCreate ? 'Search or create…' : 'Search tags…'}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) {
                  e.preventDefault()
                  addNew()
                }
              }}
            />
            <CommandList>
              {allTags.length === 0 && !canCreate && (
                <CommandEmpty>No tags yet.</CommandEmpty>
              )}
              {allTags.length > 0 && (
                <CommandGroup heading="Tags">
                  {allTags.map((t) => {
                    const selected = value.tagIds.includes(t.id)
                    return (
                      <CommandItem
                        key={t.id}
                        value={t.name}
                        onSelect={() => toggleExisting(t.id)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {t.name}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
              {canCreate && (
                <CommandGroup heading="Create">
                  <CommandItem value={`__create_${trimmed}`} onSelect={addNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create “{trimmed}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

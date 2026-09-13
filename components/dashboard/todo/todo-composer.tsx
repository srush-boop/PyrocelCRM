'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { createItem } from '@/app/(dashboard)/dashboard/todo/actions'

// A single-line quick-add. Enter (respecting IME composition) or the button
// creates the item, then clears for rapid entry.
export function TodoComposer({
  listId,
  parentId,
  placeholder = 'Add a to-do...',
  onCreated,
  autoFocus,
}: {
  listId?: string | null
  parentId?: string | null
  placeholder?: string
  onCreated: () => void
  autoFocus?: boolean
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setTitle('')
    await createItem({ title: trimmed, listId: listId ?? null, parentId: parentId ?? null })
    setBusy(false)
    onCreated()
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={title}
          autoFocus={autoFocus}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="h-9 pl-8"
        />
      </div>
      <Button size="sm" onClick={submit} disabled={busy || !title.trim()}>
        Add
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UserPlus, Check } from 'lucide-react'
import { useMembers } from './use-todo'
import { assignUsers } from '@/app/(dashboard)/dashboard/todo/actions'
import { cn } from '@/lib/utils'

function initials(name: string | null, email: string) {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return email.slice(0, 2).toUpperCase()
}

// Popover to assign or invite internal users to a to-do. Assignees are expected
// to do the task; invitees are collaborators. Both get an in-app notification.
export function AssignPopover({
  itemId,
  existingUserIds,
  onChanged,
}: {
  itemId: string
  existingUserIds: string[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'assignee' | 'invitee'>('assignee')
  const [busy, setBusy] = useState<string | null>(null)
  const members = useMembers(open)

  const filtered = members.filter((m) => {
    const q = query.toLowerCase()
    return (
      (m.full_name ?? '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
  })

  async function add(userId: string) {
    setBusy(userId)
    await assignUsers({ itemId, userIds: [userId], role })
    setBusy(null)
    onChanged()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Assign or invite people"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center gap-1 border-b border-border p-2">
          <Button
            variant={role === 'assignee' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => setRole('assignee')}
          >
            Assign
          </Button>
          <Button
            variant={role === 'invitee' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => setRole('invitee')}
          >
            Invite
          </Button>
        </div>
        <div className="p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No people found</p>
          ) : (
            filtered.map((m) => {
              const already = existingUserIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={already || busy === m.id}
                  onClick={() => add(m.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60 disabled:opacity-60',
                  )}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                      {initials(m.full_name, m.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{m.full_name ?? m.email}</span>
                  {already && <Check className="h-4 w-4 text-primary" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

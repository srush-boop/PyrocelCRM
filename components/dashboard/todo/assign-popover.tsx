'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UserPlus, Check, Users, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMembers, useTeams } from './use-todo'
import { assignUsers, assignTeam } from '@/app/(dashboard)/dashboard/todo/actions'
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

// Popover to assign or invite internal people to a to-do — individually or by
// picking a whole team at once. Assignees are expected to do the task; invitees
// are collaborators. Both get an in-app notification.
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
  const [tab, setTab] = useState<'people' | 'teams'>('people')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'assignee' | 'invitee'>('assignee')
  const [busy, setBusy] = useState<string | null>(null)
  const members = useMembers(open)
  const { teams } = useTeams(open && tab === 'teams')

  const filtered = members.filter((m) => {
    const q = query.toLowerCase()
    return (
      (m.full_name ?? '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
  })

  async function addPerson(userId: string) {
    setBusy(userId)
    await assignUsers({ itemId, userIds: [userId], role })
    setBusy(null)
    onChanged()
  }

  async function addTeam(teamId: string) {
    setBusy(teamId)
    const res = await assignTeam({ itemId, teamId, role })
    setBusy(null)
    if (res.ok) {
      toast.success(
        res.added
          ? `Added ${res.added} ${res.added === 1 ? 'person' : 'people'}`
          : 'No new people to add',
      )
      onChanged()
    } else {
      toast.error(res.error ?? 'Could not assign team')
    }
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
        {/* People vs Teams */}
        <div className="flex items-center gap-1 border-b border-border p-2">
          <Button
            variant={tab === 'people' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 flex-1 gap-1.5 text-xs"
            onClick={() => setTab('people')}
          >
            <User className="h-3.5 w-3.5" />
            People
          </Button>
          <Button
            variant={tab === 'teams' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 flex-1 gap-1.5 text-xs"
            onClick={() => setTab('teams')}
          >
            <Users className="h-3.5 w-3.5" />
            Teams
          </Button>
        </div>

        {/* Assign vs Invite role */}
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

        {tab === 'people' ? (
          <>
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
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No people found
                </p>
              ) : (
                filtered.map((m) => {
                  const already = existingUserIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={already || busy === m.id}
                      onClick={() => addPerson(m.id)}
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
                      {already ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : busy === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <div className="max-h-72 overflow-y-auto py-2">
            {teams.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No teams yet. Build one from the To-Do page.
              </p>
            ) : (
              teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  disabled={busy === team.id || team.members.length === 0}
                  onClick={() => addTeam(team.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-60"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{team.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {team.members.length === 0
                        ? 'No members'
                        : `${team.members.length} ${team.members.length === 1 ? 'person' : 'people'}`}
                    </p>
                  </div>
                  {busy === team.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

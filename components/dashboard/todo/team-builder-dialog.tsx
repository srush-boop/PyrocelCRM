'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Users,
  Plus,
  Trash2,
  Check,
  ArrowLeft,
  Loader2,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useMembers, useTeams, type TodoTeamView } from './use-todo'
import {
  createTeam,
  updateTeam,
  deleteTeam,
} from '@/app/(dashboard)/dashboard/todo/actions'

const TEAM_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

function initials(name: string | null, fallback = '?') {
  if (!name) return fallback
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

type View = { mode: 'list' } | { mode: 'edit'; team: TodoTeamView | null }

// Build and manage reusable people-groups ("teams") that can be assigned to a
// to-do in one action. Owner-scoped: you only see and edit teams you created.
export function TeamBuilderDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged?: () => void
}) {
  const { teams, mutate } = useTeams(open)
  const [view, setView] = useState<View>({ mode: 'list' })

  useEffect(() => {
    if (open) setView({ mode: 'list' })
  }, [open])

  async function refresh() {
    await mutate()
    onChanged?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {view.mode === 'list' ? 'Teams' : view.team ? 'Edit team' : 'New team'}
          </DialogTitle>
          <DialogDescription>
            {view.mode === 'list'
              ? 'Reusable groups of people you can assign a to-do to in one click.'
              : 'Name the team, pick a colour, and choose who belongs to it.'}
          </DialogDescription>
        </DialogHeader>

        {view.mode === 'list' ? (
          <TeamList
            teams={teams}
            onNew={() => setView({ mode: 'edit', team: null })}
            onEdit={(team) => setView({ mode: 'edit', team })}
            onDeleted={refresh}
          />
        ) : (
          <TeamEditor
            team={view.team}
            onBack={() => setView({ mode: 'list' })}
            onSaved={async () => {
              await refresh()
              setView({ mode: 'list' })
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TeamList({
  teams,
  onNew,
  onEdit,
  onDeleted,
}: {
  teams: TodoTeamView[]
  onNew: () => void
  onEdit: (team: TodoTeamView) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(team: TodoTeamView) {
    if (!confirm(`Delete team "${team.name}"? To-dos already assigned from it are unaffected.`))
      return
    setBusy(team.id)
    const res = await deleteTeam(team.id)
    setBusy(null)
    if (res.ok) {
      toast.success('Team deleted')
      onDeleted()
    } else {
      toast.error(res.error ?? 'Could not delete team')
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {teams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 py-10 text-center">
            <p className="text-sm font-medium">No teams yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a team to assign a group of people at once.
            </p>
          </div>
        ) : (
          teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: team.color ?? '#94a3b8' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{team.name}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {team.members.length}{' '}
                    {team.members.length === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {team.members.length === 0
                    ? 'No members yet'
                    : team.members
                        .map((m) => m.full_name ?? 'Unknown')
                        .join(', ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(team)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Edit team ${team.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(team)}
                  disabled={busy === team.id}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label={`Delete team ${team.name}`}
                >
                  {busy === team.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <Button onClick={onNew} className="w-full gap-2">
        <Plus className="h-4 w-4" />
        New team
      </Button>
    </div>
  )
}

function TeamEditor({
  team,
  onBack,
  onSaved,
}: {
  team: TodoTeamView | null
  onBack: () => void
  onSaved: () => void
}) {
  const members = useMembers(true)
  const [name, setName] = useState(team?.name ?? '')
  const [color, setColor] = useState<string>(team?.color ?? TEAM_COLORS[5])
  const [selected, setSelected] = useState<Set<string>>(
    new Set((team?.members ?? []).map((m) => m.user_id)),
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = members.filter((m) => {
    const q = query.toLowerCase()
    return (
      (m.full_name ?? '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
  })

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function save() {
    if (!name.trim() || busy) return
    setBusy(true)
    const memberIds = Array.from(selected)
    const res = team
      ? await updateTeam({ id: team.id, name: name.trim(), color, memberIds })
      : await createTeam({ name: name.trim(), color, memberIds })
    setBusy(false)
    if (res.ok) {
      toast.success(team ? 'Team updated' : 'Team created')
      onSaved()
    } else {
      toast.error(res.error ?? 'Could not save team')
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to teams
      </button>

      <Input
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name (e.g. Fire engineers)"
      />

      <div className="flex flex-wrap gap-2">
        {TEAM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background',
              color === c && 'ring-2 ring-foreground',
            )}
            style={{ backgroundColor: c }}
            aria-label={`Colour ${c}`}
          >
            {color === c && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border/60">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="h-8"
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No people found
            </p>
          ) : (
            filtered.map((m) => {
              const on = selected.has(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                      {initials(m.full_name, m.email.slice(0, 2).toUpperCase())}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{m.full_name ?? m.email}</span>
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selected.size} {selected.size === 1 ? 'person' : 'people'} selected
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {team ? 'Save' : 'Create team'}
          </Button>
        </div>
      </div>
    </div>
  )
}

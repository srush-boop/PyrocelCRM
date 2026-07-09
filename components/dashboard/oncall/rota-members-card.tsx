'use client'

import { useMemo, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Users, Plus, Trash2 } from 'lucide-react'
import { addRotaMember, removeRotaMember, setRotaMemberActive } from '@/lib/oncall/actions'
import type { RotaMember } from '@/lib/oncall/types'
import type { BranchRef } from '@/lib/oncall/queries'
import type { OncallEngineer } from './oncall-index'

interface RotaMembersCardProps {
  branches: BranchRef[]
  rota: RotaMember[]
  engineers: OncallEngineer[]
  branchFilter: string // 'all' or branch id
}

export function RotaMembersCard({ branches, rota, engineers, branchFilter }: RotaMembersCardProps) {
  const [pending, startTransition] = useTransition()
  const [addBranch, setAddBranch] = useState<string>(branchFilter !== 'all' ? branchFilter : '')
  const [addEngineer, setAddEngineer] = useState<string>('')

  const shownBranches = branchFilter === 'all' ? branches : branches.filter((b) => b.id === branchFilter)

  const rotaByBranch = useMemo(() => {
    const map = new Map<string, RotaMember[]>()
    for (const m of rota) {
      const list = map.get(m.branchId) ?? []
      list.push(m)
      map.set(m.branchId, list)
    }
    return map
  }, [rota])

  // Engineers eligible to add to the chosen branch: exclude those already on it.
  const eligibleEngineers = useMemo(() => {
    if (!addBranch) return []
    const existing = new Set((rotaByBranch.get(addBranch) ?? []).map((m) => m.engineerId))
    return engineers.filter((e) => !existing.has(e.id))
  }, [addBranch, engineers, rotaByBranch])

  const handleAdd = () => {
    if (!addBranch || !addEngineer) {
      toast.error('Choose a branch and an engineer')
      return
    }
    startTransition(async () => {
      const res = await addRotaMember(addBranch, addEngineer)
      if (res.ok) {
        toast.success('Added to rota')
        setAddEngineer('')
      } else {
        toast.error(res.error ?? 'Could not add to rota')
      }
    })
  }

  const handleToggle = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await setRotaMemberActive(id, active)
      if (!res.ok) toast.error(res.error ?? 'Update failed')
    })
  }

  const handleRemove = (id: string) => {
    startTransition(async () => {
      const res = await removeRotaMember(id)
      if (res.ok) toast.success('Removed from rota')
      else toast.error(res.error ?? 'Could not remove')
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5" />
            Add engineer to a branch rota
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Select value={addBranch} onValueChange={setAddBranch}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Engineer</label>
              <Select value={addEngineer} onValueChange={setAddEngineer} disabled={!addBranch}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={addBranch ? 'Select engineer' : 'Choose a branch first'} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleEngineers.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No engineers available
                    </SelectItem>
                  ) : (
                    eligibleEngineers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name ?? 'Engineer'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={pending || !addBranch || !addEngineer}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Not every engineer is on the call-out rota — only those added here can be assigned on-call shifts.
          </p>
        </CardContent>
      </Card>

      {shownBranches.map((b) => {
        const members = rotaByBranch.get(b.id) ?? []
        return (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                {b.name}
                <Badge variant="secondary">{members.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No engineers on this rota.</p>
              ) : (
                <ul className="divide-y">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{m.engineer?.fullName ?? 'Engineer'}</span>
                        {(m.engineer?.phone || m.engineer?.secondaryPhone) && (
                          <p className="text-xs text-muted-foreground">
                            {m.engineer?.phone ?? '—'}
                            {m.engineer?.secondaryPhone && (
                              <span> · {m.engineer.secondaryPhone} (secondary)</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={m.active}
                            onCheckedChange={(v) => handleToggle(m.id, v)}
                            disabled={pending}
                          />
                          {m.active ? 'Active' : 'Paused'}
                        </label>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(m.id)}
                          disabled={pending}
                          aria-label="Remove from rota"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

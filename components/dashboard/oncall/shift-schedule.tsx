'use client'

import { useMemo, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { CalendarClock, LifeBuoy, CalendarRange } from 'lucide-react'
import { assignShift } from '@/lib/oncall/actions'
import { BAND_META, deriveBand, type OncallBand, type OncallShift, type RotaMember } from '@/lib/oncall/types'
import type { BranchRef } from '@/lib/oncall/queries'
import { CoverRequestDialog } from './cover-request-dialog'
import { CreateBlockDialog } from './create-block-dialog'

interface ShiftScheduleProps {
  month: string // yyyy-mm
  branchId: string // 'all' or a branch id
  branches: BranchRef[]
  shifts: OncallShift[]
  rota: RotaMember[]
  isManager: boolean
  currentUserId: string
}

const UNASSIGNED = '__unassigned__'

// All yyyy-mm-dd dates within a month.
function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return Array.from(
    { length: days },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  )
}

function bandBadge(band: OncallBand) {
  const meta = BAND_META[band]
  const variant = band === 'bank_holiday' ? 'destructive' : band === 'weekend' ? 'default' : 'secondary'
  return (
    <Badge variant={variant} title={meta.hint}>
      {meta.short}
    </Badge>
  )
}

export function ShiftSchedule({
  month,
  branchId,
  branches,
  shifts,
  rota,
  isManager,
  currentUserId,
}: ShiftScheduleProps) {
  const [pending, startTransition] = useTransition()
  const [coverShift, setCoverShift] = useState<OncallShift | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)

  // Lookup: `${branchId}|${date}` -> shift
  const shiftMap = useMemo(() => {
    const map = new Map<string, OncallShift>()
    for (const s of shifts) map.set(`${s.branchId}|${s.shiftDate}`, s)
    return map
  }, [shifts])

  const activeRotaByBranch = useMemo(() => {
    const map = new Map<string, RotaMember[]>()
    for (const m of rota) {
      if (!m.active) continue
      const list = map.get(m.branchId) ?? []
      list.push(m)
      map.set(m.branchId, list)
    }
    return map
  }, [rota])

  const dates = useMemo(() => monthDates(month), [month])

  // Bank-holiday classification is done server-side on assign; for display we
  // trust the stored band, and fall back to weekday/weekend for empty days.
  const bankHolidaySet = useMemo(() => new Set<string>(), [])

  const handleAssign = (branch: string, date: string, engineerId: string | null) => {
    startTransition(async () => {
      const res = await assignShift({ branchId: branch, shiftDate: date, engineerId })
      if (res.ok) toast.success('Rota updated')
      else toast.error(res.error ?? 'Could not update rota')
    })
  }

  // "All branches": show only assigned shifts, grouped by date.
  if (branchId === 'all') {
    const assigned = shifts.filter((s) => s.engineerId).sort((a, b) => a.shiftDate.localeCompare(b.shiftDate))
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            On-call this month
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assigned.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No on-call shifts assigned this month. Select a branch to build the rota.
            </p>
          ) : (
            <ul className="divide-y">
              {assigned.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-3">
                    <span className="min-w-[6.5rem] text-sm font-medium">{formatDay(s.shiftDate)}</span>
                    {bandBadge(s.band)}
                    <span className="text-sm text-muted-foreground">{s.branchName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.engineer?.fullName ?? 'Unassigned'}</span>
                    {s.engineerId === currentUserId && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setCoverShift(s)}>
                        <LifeBuoy className="h-3.5 w-3.5" />
                        Cover
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        {coverShift && (
          <CoverRequestDialog
            open={!!coverShift}
            onOpenChange={(o) => !o && setCoverShift(null)}
            shift={coverShift}
            myShifts={shifts.filter((s) => s.engineerId === currentUserId)}
          />
        )}
      </Card>
    )
  }

  const rotaMembers = activeRotaByBranch.get(branchId) ?? []
  const branchName = branches.find((b) => b.id === branchId)?.name ?? 'Branch'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            {branchName} rota — {new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </CardTitle>
          {isManager && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setBlockOpen(true)}
              disabled={rotaMembers.length === 0}
            >
              <CalendarRange className="h-4 w-4" />
              Create block
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isManager && rotaMembers.length === 0 && (
          <p className="mb-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No engineers on this branch&apos;s rota yet. Add them under the <strong>Rota members</strong> tab
            before assigning shifts.
          </p>
        )}
        <ul className="divide-y">
          {dates.map((date) => {
            const shift = shiftMap.get(`${branchId}|${date}`)
            const band = shift?.band ?? deriveBand(date, bankHolidaySet)
            const mine = shift?.engineerId === currentUserId
            return (
              <li key={date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-[6.5rem] text-sm font-medium">{formatDay(date)}</span>
                  {bandBadge(band)}
                </div>
                <div className="flex items-center gap-2">
                  {isManager ? (
                    <Select
                      value={shift?.engineerId ?? UNASSIGNED}
                      onValueChange={(v) =>
                        handleAssign(branchId, date, v === UNASSIGNED ? null : v)
                      }
                      disabled={pending}
                    >
                      <SelectTrigger className="h-8 w-[190px]">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {rotaMembers.map((m) => (
                          <SelectItem key={m.engineerId} value={m.engineerId}>
                            {m.engineer?.fullName ?? 'Engineer'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium">
                      {shift?.engineer?.fullName ?? <span className="text-muted-foreground">Unassigned</span>}
                    </span>
                  )}
                  {mine && shift && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setCoverShift(shift)}>
                      <LifeBuoy className="h-3.5 w-3.5" />
                      Cover
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
      {coverShift && (
        <CoverRequestDialog
          open={!!coverShift}
          onOpenChange={(o) => !o && setCoverShift(null)}
          shift={coverShift}
          myShifts={shifts.filter((s) => s.engineerId === currentUserId)}
        />
      )}
      {isManager && (
        <CreateBlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          branchId={branchId}
          branchName={branchName}
          members={rotaMembers}
        />
      )}
    </Card>
  )
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

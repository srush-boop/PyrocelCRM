'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, CalendarClock, Users, History, PoundSterling, LifeBuoy } from 'lucide-react'
import { ShiftSchedule } from './shift-schedule'
import { RotaMembersCard } from './rota-members-card'
import { CoverBoard } from './cover-board'
import { ChangeLogTable } from './change-log-table'
import { OncallSummary } from './oncall-summary'
import type { BranchRef } from '@/lib/oncall/queries'
import type {
  RotaMember,
  OncallShift,
  CoverRequest,
  ChangeLogEntry,
  OncallSummaryRow,
  OncallRates,
} from '@/lib/oncall/types'

export interface OncallEngineer {
  id: string
  full_name: string | null
  branch_id: string | null
  phone: string | null
}

interface OncallIndexProps {
  isManager: boolean
  currentUserId: string
  currentUserBranchId: string | null
  month: string // yyyy-mm
  branches: BranchRef[]
  rota: RotaMember[]
  shifts: OncallShift[]
  coverRequests: CoverRequest[]
  changeLog: ChangeLogEntry[]
  summary: OncallSummaryRow[]
  rates: OncallRates
  engineers: OncallEngineer[]
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function OncallIndex({
  isManager,
  currentUserId,
  currentUserBranchId,
  month,
  branches,
  rota,
  shifts,
  coverRequests,
  changeLog,
  summary,
  rates,
  engineers,
}: OncallIndexProps) {
  const router = useRouter()
  // Default the branch filter to the user's own branch when they have one.
  const [branchId, setBranchId] = useState<string>(
    currentUserBranchId && branches.some((b) => b.id === currentUserBranchId)
      ? currentUserBranchId
      : 'all',
  )

  const navigateMonth = (delta: number) => {
    const params = new URLSearchParams()
    params.set('month', shiftMonth(month, delta))
    router.push(`/dashboard/oncall?${params.toString()}`)
  }

  const scoped = <T extends { branchId: string }>(rows: T[]) =>
    branchId === 'all' ? rows : rows.filter((r) => r.branchId === branchId)

  const visibleShifts = useMemo(() => scoped(shifts), [shifts, branchId])
  const visibleRota = useMemo(() => scoped(rota), [rota, branchId])
  const visibleRequests = useMemo(() => scoped(coverRequests), [coverRequests, branchId])
  const visibleLog = useMemo(() => scoped(changeLog), [changeLog, branchId])

  const openRequestCount = coverRequests.filter((r) => r.status === 'open').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-balance">Out-of-hours on-call</h1>
          <p className="text-sm text-muted-foreground">
            Emergency evening &amp; weekend cover rota, swaps and pay bands
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="rota" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="rota" className="gap-1.5">
            <CalendarClock className="h-4 w-4" />
            Rota
          </TabsTrigger>
          <TabsTrigger value="cover" className="gap-1.5">
            <LifeBuoy className="h-4 w-4" />
            Cover board
            {openRequestCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {openRequestCount}
              </Badge>
            )}
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="rotamembers" className="gap-1.5">
              <Users className="h-4 w-4" />
              Rota members
            </TabsTrigger>
          )}
          <TabsTrigger value="log" className="gap-1.5">
            <History className="h-4 w-4" />
            Change log
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="summary" className="gap-1.5">
              <PoundSterling className="h-4 w-4" />
              Summary
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="rota" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] text-center text-sm font-medium">{monthLabel(month)}</span>
            <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <ShiftSchedule
            month={month}
            branchId={branchId}
            branches={branches}
            shifts={visibleShifts}
            rota={visibleRota}
            isManager={isManager}
            currentUserId={currentUserId}
          />
        </TabsContent>

        <TabsContent value="cover">
          <CoverBoard
            requests={visibleRequests}
            shifts={shifts}
            isManager={isManager}
            currentUserId={currentUserId}
            currentUserBranchId={currentUserBranchId}
            branches={branches}
          />
        </TabsContent>

        {isManager && (
          <TabsContent value="rotamembers">
            <RotaMembersCard
              branches={branches}
              rota={rota}
              engineers={engineers}
              branchFilter={branchId}
            />
          </TabsContent>
        )}

        <TabsContent value="log">
          <ChangeLogTable entries={visibleLog} />
        </TabsContent>

        {isManager && (
          <TabsContent value="summary">
            <OncallSummary summary={summary} rates={rates} monthLabel={monthLabel(month)} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

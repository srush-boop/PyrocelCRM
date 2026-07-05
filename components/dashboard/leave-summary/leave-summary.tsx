'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, CalendarRange } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { FilterMultiSelect } from './filter-multi-select'
import type { SummaryEntry, SummaryFilterOptions } from '@/lib/leave-summary'

interface Props {
  entries: SummaryEntry[]
  options: SummaryFilterOptions
  initial: {
    from?: string
    to?: string
    entryTypeIds: string[]
    departmentIds: string[]
    branchIds: string[]
    userIds: string[]
  }
}

export function LeaveSummary({ entries, options, initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [from, setFrom] = useState(initial.from ?? '')
  const [to, setTo] = useState(initial.to ?? '')
  const [entryTypeIds, setEntryTypeIds] = useState<string[]>(initial.entryTypeIds)
  const [departmentIds, setDepartmentIds] = useState<string[]>(initial.departmentIds)
  const [branchIds, setBranchIds] = useState<string[]>(initial.branchIds)
  const [userIds, setUserIds] = useState<string[]>(initial.userIds)

  const hasFilters =
    !!from ||
    !!to ||
    entryTypeIds.length > 0 ||
    departmentIds.length > 0 ||
    branchIds.length > 0 ||
    userIds.length > 0

  // Pushes the current filter state to the URL, which re-runs the server fetch.
  const apply = useCallback(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (entryTypeIds.length) params.set('types', entryTypeIds.join(','))
    if (departmentIds.length) params.set('depts', departmentIds.join(','))
    if (branchIds.length) params.set('branches', branchIds.join(','))
    if (userIds.length) params.set('users', userIds.join(','))
    startTransition(() => router.push(`/dashboard/leave-summary?${params.toString()}`))
  }, [from, to, entryTypeIds, departmentIds, branchIds, userIds, router])

  const clear = useCallback(() => {
    setFrom('')
    setTo('')
    setEntryTypeIds([])
    setDepartmentIds([])
    setBranchIds([])
    setUserIds([])
    startTransition(() => router.push('/dashboard/leave-summary'))
  }, [router])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <FilterMultiSelect
            label="Leave type"
            options={options.entryTypes}
            selected={entryTypeIds}
            onChange={setEntryTypeIds}
          />
          <FilterMultiSelect
            label="Department"
            options={options.departments}
            selected={departmentIds}
            onChange={setDepartmentIds}
          />
          <FilterMultiSelect
            label="Branch"
            options={options.branches}
            selected={branchIds}
            onChange={setBranchIds}
          />
          <FilterMultiSelect
            label="User"
            options={options.users}
            selected={userIds}
            onChange={setUserIds}
          />
          <div className="flex items-center gap-2">
            <Button onClick={apply} disabled={isPending}>
              Apply
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={clear} disabled={isPending}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Branch</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <CalendarRange className="h-8 w-8 opacity-40" />
                      <span className="text-sm">No diary entries match these filters.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {e.entryTypeColor && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: e.entryTypeColor }}
                            aria-hidden
                          />
                        )}
                        {e.entryTypeName ?? 'Entry'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{e.userName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {e.departmentName ?? '—'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {e.branchName ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateUK(e.startAt)}
                      {e.startAt.slice(0, 10) !== e.endAt.slice(0, 10) &&
                        ` – ${formatDateUK(e.endAt)}`}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.approvalStatus} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        {entries.length >= 500 && ' (capped at 500 — narrow the filters to see more)'}.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: SummaryEntry['approvalStatus'] }) {
  if (status === 'approved')
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">Approved</Badge>
  if (status === 'requested') return <Badge variant="secondary">Requested</Badge>
  if (status === 'rejected') return <Badge variant="destructive">Declined</Badge>
  return <Badge variant="outline">—</Badge>
}

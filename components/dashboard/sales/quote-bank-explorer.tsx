'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { formatPence, workTypeLabel, computeBankStats, WORK_TYPES } from '@/lib/sales'
import { formatDateUK } from '@/lib/utils'
import type { QuoteBankValue, SystemType } from '@/lib/types/database'

const ALL = '__all__'

export function QuoteBankExplorer({
  values,
  systemTypes,
}: {
  values: QuoteBankValue[]
  systemTypes: SystemType[]
}) {
  const [systemCode, setSystemCode] = useState<string>(ALL)
  const [workType, setWorkType] = useState<string>(ALL)

  // Distinct system codes that actually appear in the bank, paired with a name.
  const codeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const st of systemTypes) {
      if (st.code) map.set(st.code, st.name)
    }
    // Include any codes present in the data but not in current system types.
    for (const v of values) {
      if (v.system_code && !map.has(v.system_code)) map.set(v.system_code, v.system_name)
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }))
  }, [systemTypes, values])

  const filtered = useMemo(() => {
    return values.filter((v) => {
      if (systemCode !== ALL && v.system_code !== systemCode) return false
      if (workType !== ALL && v.work_type !== workType) return false
      return true
    })
  }, [values, systemCode, workType])

  const stats = useMemo(
    () => computeBankStats(filtered.map((v) => v.subtotal_pence)),
    [filtered],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow the bank by system code and type of work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>System</Label>
              <Select value={systemCode} onValueChange={setSystemCode}>
                <SelectTrigger>
                  <SelectValue placeholder="All systems" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All systems</SelectItem>
                  {codeOptions.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.code} — {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Type of work</Label>
              <Select value={workType} onValueChange={setWorkType}>
                <SelectTrigger>
                  <SelectValue placeholder="All work types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All work types</SelectItem>
                  {WORK_TYPES.map((w) => (
                    <SelectItem key={w.code} value={w.code}>
                      {w.code} — {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Matches" value={stats.count.toString()} />
        <StatCard label="Lowest" value={stats.count ? formatPence(stats.minPence) : '—'} />
        <StatCard label="Average" value={stats.count ? formatPence(stats.avgPence) : '—'} />
        <StatCard label="Highest" value={stats.count ? formatPence(stats.maxPence) : '—'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matching systems</CardTitle>
          <CardDescription>
            {filtered.length} system{filtered.length === 1 ? '' : 's'} from sent/accepted quotes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Work type</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No matching historical values.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((v) => (
                    <TableRow key={v.system_id}>
                      <TableCell className="font-mono text-xs">
                        {v.reference ?? v.quote_number ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {v.system_code && (
                            <Badge variant="outline" className="font-mono">
                              {v.system_code}
                            </Badge>
                          )}
                          <span>{v.system_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{workTypeLabel(v.work_type)}</TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/sales/${v.quote_id}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {v.quote_title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateUK(v.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPence(v.subtotal_pence)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4" />
    </Card>
  )
}

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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [department, setDepartment] = useState<string>(ALL)
  const [quotedBy, setQuotedBy] = useState<string>(ALL)
  const [client, setClient] = useState<string>(ALL)
  const [site, setSite] = useState<string>(ALL)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

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

  // Build distinct id→label option lists from the data that is actually present.
  const departmentOptions = useDistinctOptions(values, (v) => [v.department_id, v.department_name])
  const quotedByOptions = useDistinctOptions(values, (v) => [v.created_by, v.quoted_by_name])
  const clientOptions = useDistinctOptions(values, (v) => [v.client_id, v.client_name])
  const siteOptions = useDistinctOptions(values, (v) => [v.site_id, v.site_name])

  const filtered = useMemo(() => {
    // Interpret the date range as inclusive calendar days.
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null
    return values.filter((v) => {
      if (systemCode !== ALL && v.system_code !== systemCode) return false
      if (workType !== ALL && v.work_type !== workType) return false
      if (department !== ALL && v.department_id !== department) return false
      if (quotedBy !== ALL && v.created_by !== quotedBy) return false
      if (client !== ALL && v.client_id !== client) return false
      if (site !== ALL && v.site_id !== site) return false
      if (fromMs !== null || toMs !== null) {
        const t = new Date(v.created_at).getTime()
        if (fromMs !== null && t < fromMs) return false
        if (toMs !== null && t > toMs) return false
      }
      return true
    })
  }, [values, systemCode, workType, department, quotedBy, client, site, dateFrom, dateTo])

  const stats = useMemo(
    () => computeBankStats(filtered.map((v) => v.subtotal_pence)),
    [filtered],
  )

  const hasActiveFilters =
    systemCode !== ALL ||
    workType !== ALL ||
    department !== ALL ||
    quotedBy !== ALL ||
    client !== ALL ||
    site !== ALL ||
    dateFrom !== '' ||
    dateTo !== ''

  function clearFilters() {
    setSystemCode(ALL)
    setWorkType(ALL)
    setDepartment(ALL)
    setQuotedBy(ALL)
    setClient(ALL)
    setSite(ALL)
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Narrow the bank by system, work type, department, who quoted, client, site and date.
              </CardDescription>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="grid gap-2">
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departmentOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Quoted by</Label>
              <Select value={quotedBy} onValueChange={setQuotedBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Anyone</SelectItem>
                  {quotedByOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger>
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All clients</SelectItem>
                  {clientOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Site</Label>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger>
                  <SelectValue placeholder="All sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sites</SelectItem>
                  {siteOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-date-from">Date from</Label>
              <Input
                id="bank-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-date-to">Date to</Label>
              <Input
                id="bank-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
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
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Work type</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Quoted by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
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
                        {v.client_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{v.site_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.quoted_by_name ?? '—'}
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

// Builds a sorted, de-duplicated list of { id, label } options from the rows,
// using the provided accessor to extract an [id, name] pair. Rows without an id
// are skipped so filter values always map to a concrete record.
function useDistinctOptions(
  values: QuoteBankValue[],
  accessor: (v: QuoteBankValue) => [string | null, string | null],
) {
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const v of values) {
      const [id, name] = accessor(v)
      if (!id) continue
      if (!map.has(id)) map.set(id, name ?? 'Unknown')
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
    // accessor is a stable inline function per filter; values drives recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])
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

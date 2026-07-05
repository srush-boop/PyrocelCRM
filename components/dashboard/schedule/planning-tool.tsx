'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { CalendarClock, Download, Loader2, Filter, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PrintButton } from '@/components/ui/print-button'
import { formatDateUK } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import type { ForecastRow } from '@/lib/forecast'

interface PlanningToolProps {
  rows: ForecastRow[]
  from: string
  to: string
}

// Sentinel value for "no filter" in the Select controls.
const ALL = 'all'

const PRESETS: { label: string; months: number }[] = [
  { label: 'Next 3 months', months: 3 },
  { label: 'Next 6 months', months: 6 },
  { label: 'Next 12 months', months: 12 },
]

function addMonthsStr(base: string, months: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1 + months, d ?? 1)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function todayStr(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
    t.getDate(),
  ).padStart(2, '0')}`
}

export function PlanningTool({ rows, from, to }: PlanningToolProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const setRange = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', nextFrom)
    params.set('to', nextTo)
    startTransition(() => {
      router.push(`/dashboard/schedule/planning?${params.toString()}`)
    })
  }

  // Client-side filters applied on top of the loaded forecast rows.
  const [system, setSystem] = useState(ALL)
  const [serviceType, setServiceType] = useState(ALL)
  const [route, setRoute] = useState(ALL)
  const [client, setClient] = useState(ALL)
  const [status, setStatus] = useState(ALL)

  // Build sorted, de-duplicated option lists from the data itself.
  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b),
      )
    return {
      systems: uniq(rows.map((r) => r.systemTypeName)),
      serviceTypes: uniq(rows.map((r) => r.serviceTypeName)),
      routes: uniq(rows.map((r) => r.routeName)),
      clients: uniq(rows.map((r) => r.clientName)),
    }
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (system !== ALL && r.systemTypeName !== system) return false
      if (serviceType !== ALL && r.serviceTypeName !== serviceType) return false
      if (route !== ALL && (r.routeName ?? '') !== route) return false
      if (client !== ALL && (r.clientName ?? '') !== client) return false
      if (status !== ALL && r.status !== status) return false
      return true
    })
  }, [rows, system, serviceType, route, client, status])

  const activeFilterCount = [system, serviceType, route, client, status].filter(
    (v) => v !== ALL,
  ).length

  const clearFilters = () => {
    setSystem(ALL)
    setServiceType(ALL)
    setRoute(ALL)
    setClient(ALL)
    setStatus(ALL)
  }

  const stats = useMemo(() => {
    const created = filtered.filter((r) => r.status === 'created').length
    const sites = new Set(filtered.map((r) => r.siteId)).size
    return { total: filtered.length, created, forecast: filtered.length - created, sites }
  }, [filtered])

  const handleDownload = () => {
    downloadCsv(
      `call-plan_${from}_to_${to}`,
      ['Date', 'Site', 'Client', 'System', 'Service', 'Visit', 'Route', 'Frequency', 'Engineer', 'Status'],
      filtered.map((r) => [
        r.date,
        r.siteName,
        r.clientName ?? '',
        r.systemTypeName ?? '',
        r.serviceTypeName,
        r.visitName ?? '',
        r.routeName ?? '',
        r.frequencyLabel,
        r.engineerName ?? '',
        r.status === 'created' ? 'Created' : 'Forecast',
      ]),
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-from">From</Label>
              <Input
                id="plan-from"
                type="date"
                value={from}
                onChange={(e) => setRange(e.target.value, to)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-to">To</Label>
              <Input
                id="plan-to"
                type="date"
                value={to}
                onChange={(e) => setRange(from, e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const start = todayStr()
                return (
                  <Button
                    key={p.months}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRange(start, addMonthsStr(start, p.months))}
                  >
                    {p.label}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
            <PrintButton
              targetId="planning-grid"
              title={`Call Plan — ${formatDateUK(from)} to ${formatDateUK(to)}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary">{activeFilterCount} active</Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="System"
              value={system}
              onChange={setSystem}
              options={options.systems}
            />
            <FilterSelect
              label="Service type"
              value={serviceType}
              onChange={setServiceType}
              options={options.serviceTypes}
            />
            <FilterSelect
              label="Route"
              value={route}
              onChange={setRoute}
              options={options.routes}
            />
            <FilterSelect
              label="Client"
              value={client}
              onChange={setClient}
              options={options.clients}
            />
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="forecast">Forecast</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total calls" value={stats.total} />
        <StatCard label="Already created" value={stats.created} />
        <StatCard label="Forecast (not yet created)" value={stats.forecast} />
        <StatCard label="Sites" value={stats.sites} />
      </div>

      {/* Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Planned Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No calls fall within this date range.'
                : 'No calls match the selected filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table id="planning-grid">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Visit</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Engineer</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => (
                    <TableRow key={`${r.siteServiceId}-${r.visitTypeId ?? 'none'}-${r.date}-${i}`}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatDateUK(r.date)}
                      </TableCell>
                      <TableCell>{r.siteName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.clientName ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.systemTypeName ?? '—'}
                      </TableCell>
                      <TableCell>{r.serviceTypeName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.visitName ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.routeName ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.frequencyLabel}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.engineerName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'created' ? 'secondary' : 'outline'}>
                          {r.status === 'created' ? 'Created' : 'Forecast'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

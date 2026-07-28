'use client'

import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  buildKpiReport,
  buildMonthlyKpi,
  type ComplianceSummary,
  type ComplianceTier,
  type GroupSummary,
  type KpiTask,
  type ToleranceLookup,
} from '@/lib/kpi'
import { ShieldCheck, Target, AlertTriangle, CircleCheck, ListFilter, X } from 'lucide-react'
import { DeadlineFailedReview } from './deadline-failed-review'

interface KpiDashboardProps {
  tasks: KpiTask[]
  tolerances: ToleranceLookup
  clients?: { id: string; name: string }[]
  showClientFilter?: boolean
  // Deadline-failed review support.
  deadlineReasons?: string[]
  excludedReasons?: string[]
  canReview?: boolean
}

const chartConfig: ChartConfig = {
  regulatory: { label: 'Regulatory', color: 'var(--chart-1)' },
  client: { label: 'Client', color: 'var(--chart-2)' },
}

function rateLabel(rate: number | null) {
  return rate === null ? '—' : `${rate}%`
}

export function KpiDashboard({
  tasks,
  tolerances,
  clients = [],
  showClientFilter = false,
  deadlineReasons = [],
  excludedReasons = [],
  canReview = false,
}: KpiDashboardProps) {
  const [clientId, setClientId] = useState<string>('all')
  const [tier, setTier] = useState<ComplianceTier>('regulatory')
  const [groupBy, setGroupBy] = useState<'service' | 'site'>('service')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  // Empty set = no service-type restriction (show all).
  const [serviceTypeIds, setServiceTypeIds] = useState<Set<string>>(new Set())
  // Empty set = no system-type restriction (show all).
  const [systemTypeIds, setSystemTypeIds] = useState<Set<string>>(new Set())

  // Distinct service types present in the data, for the multi-select filter.
  const serviceTypeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) {
      if (t.serviceTypeId) map.set(t.serviceTypeId, t.serviceTypeName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  // Distinct system types present in the data, for the multi-select filter.
  const systemTypeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) {
      if (t.systemTypeId && t.systemTypeName) map.set(t.systemTypeId, t.systemTypeName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const toggleServiceType = (id: string) => {
    setServiceTypeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSystemType = (id: string) => {
    setSystemTypeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredTasks = useMemo(() => {
    // dueDate drives the date-range filter; parse once per task.
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null
    // Include the whole "to" day by pushing to end-of-day.
    const toTime = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null

    return tasks.filter((t) => {
      if (clientId !== 'all' && t.clientId !== clientId) return false
      if (serviceTypeIds.size > 0 && !serviceTypeIds.has(t.serviceTypeId)) return false
      if (systemTypeIds.size > 0 && !(t.systemTypeId && systemTypeIds.has(t.systemTypeId)))
        return false
      if (fromTime !== null || toTime !== null) {
        if (!t.dueDate) return false
        const due = new Date(t.dueDate).getTime()
        if (Number.isNaN(due)) return false
        if (fromTime !== null && due < fromTime) return false
        if (toTime !== null && due > toTime) return false
      }
      return true
    })
  }, [tasks, clientId, serviceTypeIds, systemTypeIds, dateFrom, dateTo])

  const hasActiveFilters =
    dateFrom !== '' ||
    dateTo !== '' ||
    serviceTypeIds.size > 0 ||
    systemTypeIds.size > 0 ||
    clientId !== 'all'

  const clearFilters = () => {
    setClientId('all')
    setDateFrom('')
    setDateTo('')
    setServiceTypeIds(new Set())
    setSystemTypeIds(new Set())
  }

  const report = useMemo(
    () => buildKpiReport(filteredTasks, tolerances),
    [filteredTasks, tolerances],
  )

  // Month-by-month trend (chronological) for the current filters.
  const monthly = useMemo(
    () => buildMonthlyKpi(filteredTasks, tolerances),
    [filteredTasks, tolerances],
  )

  const groups = groupBy === 'service' ? report.byServiceType : report.bySite

  const chartData = useMemo(
    () =>
      groups.map((g) => ({
        label: g.label,
        regulatory: g.regulatory.rate ?? 0,
        client: g.client.rate ?? 0,
      })),
    [groups],
  )

  const tierSummary = (g: { regulatory: ComplianceSummary; client: ComplianceSummary }) =>
    tier === 'regulatory' ? g.regulatory : g.client

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        {showClientFilter && clients.length > 0 && (
          <div className="grid w-full max-w-[14rem] gap-1.5">
            <Label className="text-xs text-muted-foreground">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Service type multi-select */}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Service types</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[14rem] justify-start font-normal">
                <ListFilter className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {serviceTypeIds.size === 0
                    ? 'All service types'
                    : `${serviceTypeIds.size} selected`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[16rem] p-2">
              {serviceTypeOptions.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No service types.</p>
              ) : (
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {serviceTypeOptions.map((st) => (
                    <label
                      key={st.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={serviceTypeIds.has(st.id)}
                        onCheckedChange={() => toggleServiceType(st.id)}
                      />
                      <span className="truncate">{st.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* System type multi-select */}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Systems</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[14rem] justify-start font-normal">
                <ListFilter className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {systemTypeIds.size === 0 ? 'All systems' : `${systemTypeIds.size} selected`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[16rem] p-2">
              {systemTypeOptions.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No systems.</p>
              ) : (
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {systemTypeOptions.map((sys) => (
                    <label
                      key={sys.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={systemTypeIds.has(sys.id)}
                        onCheckedChange={() => toggleSystemType(sys.id)}
                      />
                      <span className="truncate">{sys.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Date range (by due date) */}
        <div className="grid gap-1.5">
          <Label htmlFor="kpi-date-from" className="text-xs text-muted-foreground">
            Due from
          </Label>
          <Input
            id="kpi-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[10rem]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kpi-date-to" className="text-xs text-muted-foreground">
            Due to
          </Label>
          <Input
            id="kpi-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[10rem]"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Regulatory compliance"
          icon={<ShieldCheck className="h-4 w-4 text-[var(--chart-1)]" />}
          summary={report.overall.regulatory}
          accent="var(--chart-1)"
        />
        <SummaryCard
          title="Client compliance"
          icon={<Target className="h-4 w-4 text-[var(--chart-2)]" />}
          summary={report.overall.client}
          accent="var(--chart-2)"
        />
        <StatCard
          title="Services assessed"
          icon={<CircleCheck className="h-4 w-4 text-muted-foreground" />}
          value={report.overall.regulatory.assessed.toString()}
          hint={`${report.overall.regulatory.total} total · ${report.overall.regulatory.pending} pending`}
        />
        <StatCard
          title="Overdue (regulatory)"
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          value={report.overall.regulatory.overdue.toString()}
          hint="Past tolerance and not completed"
        />
      </div>

      {/* Tier + grouping controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tier} onValueChange={(v) => setTier(v as ComplianceTier)}>
          <TabsList>
            <TabsTrigger value="regulatory">Regulatory KPI</TabsTrigger>
            <TabsTrigger value="client">Client KPI</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as 'service' | 'site')}>
          <TabsList>
            <TabsTrigger value="service">By service</TabsTrigger>
            <TabsTrigger value="site">By site</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Compliance chart */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance by {groupBy === 'service' ? 'service type' : 'site'}</CardTitle>
          <CardDescription>
            On-time completion rate (%) against regulatory and client tolerances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No data to display yet.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                  angle={chartData.length > 4 ? -20 : 0}
                  textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                  height={chartData.length > 4 ? 60 : 30}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="regulatory" fill="var(--color-regulatory)" radius={4} />
                <Bar dataKey="client" fill="var(--color-client)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tier === 'regulatory' ? 'Regulatory' : 'Client'} breakdown by{' '}
            {groupBy === 'service' ? 'service type' : 'site'}
          </CardTitle>
          <CardDescription>
            Counts per status. The rate excludes pending services whose window is still open.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{groupBy === 'service' ? 'Service type' : 'Site'}</TableHead>
                  <TableHead className="text-right">On time</TableHead>
                  <TableHead className="text-right">Early</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g: GroupSummary) => {
                    const s = tierSummary(g)
                    return (
                      <TableRow key={g.key}>
                        <TableCell className="font-medium">{g.label}</TableCell>
                        <TableCell className="text-right">{s.compliant}</TableCell>
                        <TableCell className="text-right">{s.early}</TableCell>
                        <TableCell className="text-right">{s.late}</TableCell>
                        <TableCell className="text-right">{s.overdue}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.pending}
                        </TableCell>
                        <TableCell className="text-right">
                          <RateBadge rate={s.rate} />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly trend table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly compliance</CardTitle>
          <CardDescription>
            {tier === 'regulatory' ? 'Regulatory' : 'Client'} on-time rate per month, based on the
            call&apos;s due date. Excludes pending calls whose window is still open. The PPM and
            emergency columns show the same rate for recurring maintenance and reactive emergency
            calls respectively.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">On time</TableHead>
                  <TableHead className="text-right">Early</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">PPM rate</TableHead>
                  <TableHead className="text-right">Emergency rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  monthly.map((m) => {
                    const s = tier === 'regulatory' ? m.regulatory : m.client
                    const ppm = tier === 'regulatory' ? m.ppm.regulatory : m.ppm.client
                    const emg = tier === 'regulatory' ? m.emergency.regulatory : m.emergency.client
                    return (
                      <TableRow key={m.monthKey}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right">{s.compliant}</TableCell>
                        <TableCell className="text-right">{s.early}</TableCell>
                        <TableCell className="text-right">{s.late}</TableCell>
                        <TableCell className="text-right">{s.overdue}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.pending}
                        </TableCell>
                        <TableCell className="text-right">
                          <RateBadge rate={s.rate} />
                        </TableCell>
                        <TableCell className="text-right">
                          {ppm.assessed > 0 ? (
                            <RateBadge rate={ppm.rate} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {emg.assessed > 0 ? (
                            <RateBadge rate={emg.rate} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Deadline-failed review (managers) */}
      {canReview && (
        <DeadlineFailedReview
          tasks={filteredTasks}
          tolerances={tolerances}
          tier={tier}
          reasons={deadlineReasons}
          excludedReasons={excludedReasons}
          canEdit={canReview}
        />
      )}
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  summary,
  accent,
}: {
  title: string
  icon: React.ReactNode
  summary: ComplianceSummary
  accent: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" style={{ color: accent }}>
          {rateLabel(summary.rate)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {summary.compliant} on time of {summary.assessed} assessed
        </p>
      </CardContent>
    </Card>
  )
}

function StatCard({
  title,
  icon,
  value,
  hint,
}: {
  title: string
  icon: React.ReactNode
  value: string
  hint: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-muted-foreground">—</span>
  const variant = rate >= 95 ? 'default' : rate >= 80 ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{rate}%</Badge>
}

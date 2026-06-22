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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  buildKpiReport,
  type ComplianceSummary,
  type ComplianceTier,
  type GroupSummary,
  type KpiTask,
  type ToleranceLookup,
} from '@/lib/kpi'
import { ShieldCheck, Target, AlertTriangle, CircleCheck } from 'lucide-react'

interface KpiDashboardProps {
  tasks: KpiTask[]
  tolerances: ToleranceLookup
  clients?: { id: string; name: string }[]
  showClientFilter?: boolean
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
}: KpiDashboardProps) {
  const [clientId, setClientId] = useState<string>('all')
  const [tier, setTier] = useState<ComplianceTier>('regulatory')
  const [groupBy, setGroupBy] = useState<'service' | 'site'>('service')

  const filteredTasks = useMemo(() => {
    if (clientId === 'all') return tasks
    return tasks.filter((t) => t.clientId === clientId)
  }, [tasks, clientId])

  const report = useMemo(
    () => buildKpiReport(filteredTasks, tolerances),
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
      {showClientFilter && clients.length > 0 && (
        <div className="grid w-full max-w-xs gap-1.5">
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
              <BarChart accessibilityLayer data={chartData} margin={{ left: -16, right: 8 }}>
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
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={40} />
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

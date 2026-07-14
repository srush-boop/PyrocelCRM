'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Users,
  Wrench,
  Building2,
  Briefcase,
  Layers,
  Clock,
  Coins,
  TrendingUp,
  Percent,
  PhoneCall,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPence } from '@/lib/billing/invoices'
import { formatMarginPct } from '@/lib/billing/labour-profit'
import type {
  LabourDashboardResult,
  LabourBreakdownRow,
} from '@/lib/billing/labour-dashboard-data'

const ALL = 'all'

interface ViewFilters {
  engineerId: string | null
  serviceTypeId: string | null
  departmentId: string | null
  roleId: string | null
  branchId: string | null
  clientId: string | null
  siteId: string | null
  from: string
  to: string
}

function hrs(n: number): string {
  return `${n.toFixed(1)}h`
}

export function LabourCostsView({
  data,
  filters,
}: {
  data: LabourDashboardResult
  filters: ViewFilters
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === ALL) params.delete(key)
    else params.set(key, value)
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  const { totals, options } = data
  const hasData = totals.calls > 0

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="from"
              type="date"
              value={filters.from}
              max={filters.to}
              className="w-[150px]"
              onChange={(e) => setParam('from', e.target.value || null)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="to"
              type="date"
              value={filters.to}
              min={filters.from}
              className="w-[150px]"
              onChange={(e) => setParam('to', e.target.value || null)}
            />
          </div>

          <FilterSelect
            label="Engineer"
            icon={<Users className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.engineerId}
            options={options.engineers}
            onChange={(v) => setParam('engineer', v)}
            width="w-[180px]"
          />
          <FilterSelect
            label="Service"
            icon={<Wrench className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.serviceTypeId}
            options={options.serviceTypes}
            onChange={(v) => setParam('service', v)}
            width="w-[180px]"
          />
          <FilterSelect
            label="Department"
            icon={<Layers className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.departmentId}
            options={options.departments}
            onChange={(v) => setParam('department', v)}
            width="w-[170px]"
          />
          <FilterSelect
            label="Branch"
            icon={<Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.branchId}
            options={options.branches}
            onChange={(v) => setParam('branch', v)}
            width="w-[160px]"
          />
          <FilterSelect
            label="Role"
            icon={<Briefcase className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.roleId}
            options={options.roles}
            onChange={(v) => setParam('role', v)}
            width="w-[160px]"
          />
          <FilterSelect
            label="Client"
            icon={<Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.clientId}
            options={options.clients}
            onChange={(v) => setParam('client', v)}
            width="w-[180px]"
          />
          <FilterSelect
            label="Site"
            icon={<Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
            value={filters.siteId}
            options={options.sites}
            onChange={(v) => setParam('site', v)}
            width="w-[180px]"
          />

          <Button
            variant="ghost"
            className="h-9 text-muted-foreground"
            onClick={() => router.push(pathname)}
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          icon={<PhoneCall className="h-5 w-5" />}
          label="Calls"
          value={String(totals.calls)}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="On-site hours"
          value={hrs(totals.hours)}
        />
        <SummaryCard
          icon={<Coins className="h-5 w-5" />}
          label="Labour cost"
          value={formatPence(totals.costPence)}
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Revenue"
          value={formatPence(totals.revenuePence)}
          hint={
            totals.revenueKnownCalls < totals.calls
              ? `${totals.calls - totals.revenueKnownCalls} call(s) w/o known revenue`
              : undefined
          }
        />
        <SummaryCard
          icon={<Coins className="h-5 w-5" />}
          label="Profit"
          value={formatPence(totals.profitPence)}
          emphasis
          positive={totals.profitPence >= 0}
        />
        <SummaryCard
          icon={<Percent className="h-5 w-5" />}
          label="Margin"
          value={formatMarginPct(totals.marginPct)}
        />
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No completed calls match these filters.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Breakdowns */}
          <Tabs defaultValue="engineer" className="space-y-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="engineer">Engineer</TabsTrigger>
              <TabsTrigger value="service">Service type</TabsTrigger>
              <TabsTrigger value="department">Department</TabsTrigger>
              <TabsTrigger value="branch">Branch</TabsTrigger>
              <TabsTrigger value="role">Role</TabsTrigger>
              <TabsTrigger value="productive">Productive time</TabsTrigger>
            </TabsList>

            <TabsContent value="engineer">
              <BreakdownTable firstCol="Engineer" rows={data.byEngineer} />
            </TabsContent>
            <TabsContent value="service">
              <BreakdownTable firstCol="Service type" rows={data.byServiceType} />
            </TabsContent>
            <TabsContent value="department">
              <BreakdownTable firstCol="Department" rows={data.byDepartment} />
            </TabsContent>
            <TabsContent value="branch">
              <BreakdownTable firstCol="Branch" rows={data.byBranch} />
            </TabsContent>
            <TabsContent value="role">
              <BreakdownTable firstCol="Role" rows={data.byRole} />
            </TabsContent>
            <TabsContent value="productive">
              <ProductiveTable data={data} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  icon,
  value,
  options,
  onChange,
  width,
}: {
  label: string
  icon: React.ReactNode
  value: string | null
  options: { id: string; name: string }[]
  onChange: (value: string | null) => void
  width: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
        <SelectTrigger className={width}>
          {icon}
          <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function BreakdownTable({ firstCol, rows }: { firstCol: string; rows: LabourBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No data for this breakdown.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{firstCol}</TableHead>
              <TableHead className="w-20 text-right">Calls</TableHead>
              <TableHead className="w-24 text-right">Hours</TableHead>
              <TableHead className="w-32 text-right">Cost</TableHead>
              <TableHead className="w-32 text-right">Revenue</TableHead>
              <TableHead className="w-32 text-right">Profit</TableHead>
              <TableHead className="w-24 text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(r.hours)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatPence(r.costPence)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.revenueKnownCalls > 0 ? formatPence(r.revenuePence) : '—'}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    r.revenueKnownCalls === 0
                      ? 'text-muted-foreground'
                      : r.profitPence >= 0
                        ? 'text-emerald-600'
                        : 'text-destructive'
                  }`}
                >
                  {r.revenueKnownCalls > 0 ? formatPence(r.profitPence) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMarginPct(r.marginPct)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ProductiveTable({ data }: { data: LabourDashboardResult }) {
  const rows = data.productiveTime
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No productive-time data for these filters.
        </CardContent>
      </Card>
    )
  }
  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const avgPerDay = totalHours / rows.length
  return (
    <Card>
      <CardContent className="space-y-4 p-0">
        <div className="flex flex-wrap gap-6 border-b p-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Working days</div>
            <div className="font-semibold">{rows.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total on-site hours</div>
            <div className="font-semibold">{hrs(totalHours)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Avg. hours / working day</div>
            <div className="font-semibold">{hrs(avgPerDay)}</div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="w-24 text-right">Calls</TableHead>
              <TableHead className="w-32 text-right">On-site hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.date}>
                <TableCell className="font-medium">
                  {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(r.hours)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  emphasis,
  positive,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  emphasis?: boolean
  positive?: boolean
}) {
  return (
    <Card className={emphasis ? 'border-primary/30 bg-primary/5' : undefined}>
      <CardContent className="flex items-start gap-3 py-5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            emphasis
              ? positive
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="truncate text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

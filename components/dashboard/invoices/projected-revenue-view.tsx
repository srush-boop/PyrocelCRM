'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Building2, Layers, Wrench, TrendingUp, Coins, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { formatPence } from '@/lib/billing/invoices'
import type { ProjectedRevenue } from '@/lib/billing/projected-revenue'
import type { ProjectionFilterOptions } from '@/lib/actions/projected-revenue'

const ALL = 'all'

function pct(margin: number, revenue: number): string {
  if (!revenue) return '—'
  return `${((margin / revenue) * 100).toFixed(1)}%`
}

export function ProjectedRevenueView({
  data,
  options,
  systemTypeId,
  serviceTypeId,
}: {
  data: ProjectedRevenue
  options: ProjectionFilterOptions
  systemTypeId: string | null
  serviceTypeId: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = (key: string, value: string | null, clear?: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === ALL) params.delete(key)
    else params.set(key, value)
    for (const c of clear ?? []) params.delete(c)
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  // Service-type options are narrowed to the chosen system type (if any).
  const serviceOptions = systemTypeId
    ? options.serviceTypes.filter((s) => s.systemTypeId === systemTypeId)
    : options.serviceTypes

  const hasData = data.branches.length > 0

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="system-filter" className="text-xs text-muted-foreground">
            System type
          </Label>
          <Select
            value={systemTypeId ?? ALL}
            // Changing system type clears any service-type filter that no longer applies.
            onValueChange={(v) => setParam('system', v, ['service'])}
          >
            <SelectTrigger id="system-filter" className="w-[200px]">
              <Layers className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All system types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All system types</SelectItem>
              {options.systemTypes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="service-filter" className="text-xs text-muted-foreground">
            Service type
          </Label>
          <Select value={serviceTypeId ?? ALL} onValueChange={(v) => setParam('service', v)}>
            <SelectTrigger id="service-filter" className="w-[220px]">
              <Wrench className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All service types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All service types</SelectItem>
              {serviceOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Projected revenue"
          value={formatPence(data.totalRevenuePence)}
          hint="Next 12 months (ex-VAT)"
          emphasis
        />
        <SummaryCard
          icon={<Coins className="h-5 w-5" />}
          label="Subcontract cost"
          value={formatPence(data.totalCostPence)}
          hint="Annualised buy cost"
        />
        <SummaryCard
          icon={<Percent className="h-5 w-5" />}
          label="Gross margin"
          value={formatPence(data.totalMarginPence)}
          hint={`${pct(data.totalMarginPence, data.totalRevenuePence)} of revenue`}
        />
        <SummaryCard
          icon={<Building2 className="h-5 w-5" />}
          label="Live charges"
          value={String(data.chargeCount)}
          hint={`${data.branches.length} branch${data.branches.length === 1 ? '' : 'es'}`}
        />
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No live recurring charges match these filters.
          </CardContent>
        </Card>
      )}

      {/* Per-branch breakdown */}
      {data.branches.map((branch) => (
        <Card key={branch.branchId}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              {branch.branchName}
            </CardTitle>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Revenue</div>
                <div className="font-semibold">{formatPence(branch.revenuePence)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Cost</div>
                <div className="font-medium text-muted-foreground">
                  {formatPence(branch.costPence)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Margin</div>
                <div className="font-semibold">
                  {formatPence(branch.marginPence)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({pct(branch.marginPence, branch.revenuePence)})
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service type</TableHead>
                  <TableHead className="w-40">System type</TableHead>
                  <TableHead className="w-24 text-right">Charges</TableHead>
                  <TableHead className="w-32 text-right">Revenue</TableHead>
                  <TableHead className="w-32 text-right">Cost</TableHead>
                  <TableHead className="w-36 text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branch.serviceTypes.map((svc) => (
                  <TableRow key={svc.serviceTypeId}>
                    <TableCell className="font-medium">{svc.serviceTypeName}</TableCell>
                    <TableCell>
                      {svc.systemTypeName ? (
                        <Badge variant="secondary">{svc.systemTypeName}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{svc.chargeCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPence(svc.revenuePence)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPence(svc.costPence)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPence(svc.marginPence)}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({pct(svc.marginPence, svc.revenuePence)})
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <Card className={emphasis ? 'border-primary/30 bg-primary/5' : undefined}>
      <CardContent className="flex items-start gap-3 py-5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            emphasis ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

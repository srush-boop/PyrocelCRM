'use client'

import { useMemo, useState } from 'react'
import type { StockMovement, StockMovementType } from '@/lib/types/database'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { ArrowRightLeft, Wrench, PackagePlus, SlidersHorizontal, Download, History } from 'lucide-react'
import { formatGBP, formatDateUK } from '@/lib/utils'

interface StockReportProps {
  movements: StockMovement[]
}

const typeMeta: Record<
  StockMovementType,
  { label: string; icon: typeof ArrowRightLeft; variant: 'default' | 'secondary' | 'outline' }
> = {
  transfer: { label: 'Transfer', icon: ArrowRightLeft, variant: 'default' },
  usage: { label: 'Used on job', icon: Wrench, variant: 'secondary' },
  receipt: { label: 'Received', icon: PackagePlus, variant: 'outline' },
  adjustment: { label: 'Adjustment', icon: SlidersHorizontal, variant: 'outline' },
}

function movementValue(m: StockMovement): number {
  return (m.part?.unit_cost ?? 0) * m.quantity
}

export function StockReport({ movements }: StockReportProps) {
  const [type, setType] = useState<string>('all')
  const [partId, setPartId] = useState<string>('all')
  const [locationId, setLocationId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Distinct parts & locations present in the data, for the filter dropdowns.
  const parts = useMemo(() => {
    const map = new Map<string, string>()
    movements.forEach((m) => {
      if (m.part) map.set(m.part.id, m.part.name)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [movements])

  const locations = useMemo(() => {
    const map = new Map<string, string>()
    movements.forEach((m) => {
      if (m.from_location) map.set(m.from_location.id, m.from_location.name)
      if (m.to_location) map.set(m.to_location.id, m.to_location.name)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [movements])

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (type !== 'all' && m.movement_type !== type) return false
      if (partId !== 'all' && m.part_id !== partId) return false
      if (
        locationId !== 'all' &&
        m.from_location_id !== locationId &&
        m.to_location_id !== locationId
      )
        return false
      if (dateFrom && m.created_at < dateFrom) return false
      if (dateTo && m.created_at > `${dateTo}T23:59:59`) return false
      return true
    })
  }, [movements, type, partId, locationId, dateFrom, dateTo])

  // Summary totals for the filtered set.
  const summary = useMemo(() => {
    const totalQty = filtered.reduce((s, m) => s + m.quantity, 0)
    const totalValue = filtered.reduce((s, m) => s + movementValue(m), 0)
    const usageValue = filtered
      .filter((m) => m.movement_type === 'usage')
      .reduce((s, m) => s + movementValue(m), 0)
    return {
      count: filtered.length,
      totalQty,
      totalValue,
      usageValue,
    }
  }, [filtered])

  // Per-part rollup (quantity + value).
  const byPart = useMemo(() => {
    const map = new Map<string, { name: string; sku: string | null; qty: number; value: number }>()
    filtered.forEach((m) => {
      const key = m.part_id
      const entry =
        map.get(key) ?? {
          name: m.part?.name ?? 'Unknown',
          sku: m.part?.sku ?? null,
          qty: 0,
          value: 0,
        }
      entry.qty += m.quantity
      entry.value += movementValue(m)
      map.set(key, entry)
    })
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [filtered])

  const exportCsv = () => {
    const header = [
      'Date',
      'Type',
      'Part',
      'SKU',
      'Quantity',
      'From',
      'To',
      'Job reference',
      'Site',
      'By',
      'Value (GBP)',
    ]
    const rows = filtered.map((m) => [
      new Date(m.created_at).toISOString(),
      typeMeta[m.movement_type].label,
      m.part?.name ?? '',
      m.part?.sku ?? '',
      String(m.quantity),
      m.from_location?.name ?? '',
      m.to_location?.name ?? '',
      m.job_reference ?? '',
      m.task?.site_service?.site?.name ?? '',
      m.created_by_profile?.full_name ?? m.created_by_profile?.email ?? '',
      movementValue(m).toFixed(2),
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-transfers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Movements</CardDescription>
            <CardTitle className="text-2xl">{summary.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total units moved</CardDescription>
            <CardTitle className="text-2xl">{summary.totalQty}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total value moved</CardDescription>
            <CardTitle className="text-2xl">{formatGBP(summary.totalValue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Value used on jobs</CardDescription>
            <CardTitle className="text-2xl">{formatGBP(summary.usageValue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="transfer">Transfers</SelectItem>
                <SelectItem value="usage">Used on job</SelectItem>
                <SelectItem value="receipt">Received</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Part</Label>
            <Select value={partId} onValueChange={setPartId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All parts</SelectItem>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="from">
              From
            </Label>
            <Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="to">
              To
            </Label>
            <Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={exportCsv} variant="outline" className="w-full gap-2" disabled={!filtered.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-part summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parts transferred — summary</CardTitle>
          <CardDescription>Totals grouped by part for the current filters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Total qty</TableHead>
                  <TableHead className="text-right">Total value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No movements match the filters
                    </TableCell>
                  </TableRow>
                ) : (
                  byPart.map((p) => (
                    <TableRow key={p.name + (p.sku ?? '')}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {p.sku ?? '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatGBP(p.value)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed movement log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Movement log
          </CardTitle>
          <CardDescription>{filtered.length} movement(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden md:table-cell">From → To</TableHead>
                  <TableHead className="hidden lg:table-cell">Job ref</TableHead>
                  <TableHead className="hidden lg:table-cell">By</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No movements match the filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => {
                    const meta = typeMeta[m.movement_type]
                    const Icon = meta.icon
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateUK(m.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="gap-1">
                            <Icon className="h-3 w-3" />
                            <span className="hidden sm:inline">{meta.label}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {m.part?.name ?? 'Unknown'}
                          {m.part?.sku ? (
                            <span className="ml-1 text-xs text-muted-foreground">{m.part.sku}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.quantity}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {(m.from_location?.name ?? '—') + ' → ' + (m.to_location?.name ?? (m.movement_type === 'usage' ? 'Job' : '—'))}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {m.job_reference ? (
                            <span>{m.job_reference}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {m.task?.site_service?.site?.name ? (
                            <span className="block text-xs text-muted-foreground">
                              {m.task.site_service.site.name}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {m.created_by_profile?.full_name ?? m.created_by_profile?.email ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatGBP(movementValue(m))}
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

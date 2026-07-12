'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Loader2,
  Clock,
  Car,
  Timer,
  Route as RouteIcon,
  ArrowUpDown,
  CalendarRange,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDuration } from '@/lib/task-duration'
import { getRouteActuals } from '@/app/(dashboard)/dashboard/routes/[id]/actions'
import type { RouteActualsData } from '@/app/(dashboard)/dashboard/routes/[id]/types'
import type { CanvasStop } from './route-map-canvas'

const RouteMapCanvas = dynamic(
  () => import('./route-map-canvas').then((m) => m.RouteMapCanvas),
  { ssr: false, loading: () => <MapSkeleton /> },
)

function MapSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/40 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading map…
    </div>
  )
}

const AVERAGE_VALUE = '__average__'

function clockFromIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function RouteCompletionAnalytics({
  routeId,
  initial,
  routeColor,
}: {
  routeId: string
  initial: RouteActualsData
  routeColor: string | null
}) {
  const [data, setData] = useState<RouteActualsData>(initial)
  const [isLoading, startLoad] = useTransition()

  const color = routeColor || '#2563eb'
  const hasData = data.weeks.length > 0
  const isAverage = data.mode === 'average'

  const selectValue = isAverage ? AVERAGE_VALUE : data.selectedWeek ?? ''

  const load = (value: string) => {
    startLoad(async () => {
      const opts =
        value === AVERAGE_VALUE
          ? { mode: 'average' as const }
          : { mode: 'week' as const, weekStart: value }
      const { data: fresh, error } = await getRouteActuals(routeId, opts)
      if (error || !fresh) {
        toast.error(error || 'Could not load completion data')
        return
      }
      setData(fresh)
    })
  }

  const home = data.home
  const canvasStops = useMemo<CanvasStop[]>(
    () =>
      data.visits
        .filter((v) => v.latitude != null && v.longitude != null)
        .map((v) => ({
          siteId: v.siteId,
          name: v.siteName,
          latitude: v.latitude as number,
          longitude: v.longitude as number,
        })),
    [data.visits],
  )

  const s = data.summary
  const onSiteDelta = s.onSiteMinutes - s.plannedOnSiteMinutes

  if (!hasData) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <CalendarRange className="h-8 w-8 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No completed visits yet</h3>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          Once the CDO completes calls on this route, their actual arrival, on-site and travel
          times will appear here so you can compare planned vs actual and refine the order.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">Period</label>
          <Select value={selectValue} onValueChange={load} disabled={isLoading}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a week" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AVERAGE_VALUE}>
                Average of all weeks ({data.weeks.length})
              </SelectItem>
              {data.weeks.map((w) => (
                <SelectItem key={w.weekStart} value={w.weekStart}>
                  {w.label} · {w.taskCount} {w.taskCount === 1 ? 'visit' : 'visits'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isAverage ? (
            <Badge variant="secondary" className="gap-1">
              <CalendarRange className="h-3 w-3" />
              Averaged across {data.averagedWeeks} weeks
            </Badge>
          ) : (
            <Badge variant="secondary">
              {s.visitCount} {s.visitCount === 1 ? 'visit' : 'visits'}
            </Badge>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={<Clock className="h-4 w-4" />}
          label={isAverage ? 'Avg time on the road' : 'Working span'}
          value={formatDuration(s.dayLengthMinutes)}
          hint={
            !isAverage && s.firstArrival && s.lastDeparture
              ? `${clockFromIso(s.firstArrival)}–${clockFromIso(s.lastDeparture)}`
              : undefined
          }
        />
        <StatTile
          icon={<Timer className="h-4 w-4" />}
          label="On-site total"
          value={formatDuration(s.onSiteMinutes)}
          hint={
            onSiteDelta === 0
              ? 'on plan'
              : `${onSiteDelta > 0 ? '+' : ''}${formatDuration(Math.abs(onSiteDelta))} vs planned`
          }
          hintTone={onSiteDelta > 0 ? 'warn' : onSiteDelta < 0 ? 'good' : 'muted'}
        />
        <StatTile
          icon={<Car className="h-4 w-4" />}
          label="Drive + idle"
          value={formatDuration(s.gapMinutes)}
          hint="between same-day stops"
        />
        <StatTile
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Order changes"
          value={String(s.outOfOrderCount)}
          hint={s.outOfOrderCount === 0 ? 'followed plan' : 'vs planned order'}
          hintTone={s.outOfOrderCount === 0 ? 'good' : 'warn'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,42%)]">
        {/* Table */}
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <RouteIcon className="h-4 w-4" style={{ color }} />
              {isAverage ? 'Average visit sequence' : 'Actual visit sequence'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAverage
                ? 'Sites ordered by mean check-in time; on-site is averaged across weeks.'
                : 'Ordered by actual check-in time. Deltas compare actual vs learned estimate.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-center">Plan #</TableHead>
                  <TableHead>{isAverage ? 'Avg check-in' : 'Arrive–Leave'}</TableHead>
                  <TableHead className="text-right">On-site</TableHead>
                  <TableHead className="text-right">vs plan</TableHead>
                  <TableHead className="text-right">Next gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.visits.map((v) => {
                  const delta = v.onSiteMinutes - v.plannedMinutes
                  const moved =
                    v.plannedPosition != null && v.plannedPosition !== v.actualPosition
                  return (
                    <TableRow key={`${v.siteId}-${v.actualPosition}`}>
                      <TableCell>
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {v.actualPosition}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{v.siteName}</div>
                        {v.engineerName && (
                          <div className="text-xs text-muted-foreground">{v.engineerName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {v.plannedPosition != null ? (
                          <span
                            className={
                              moved ? 'font-medium text-amber-600' : 'text-muted-foreground'
                            }
                          >
                            {v.plannedPosition}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {isAverage
                          ? clockFromIso(v.arrival)
                          : `${clockFromIso(v.arrival)}–${clockFromIso(v.departure)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(v.onSiteMinutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {delta === 0 ? (
                          <span className="text-muted-foreground">on plan</span>
                        ) : (
                          <span className={delta > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                            {delta > 0 ? '+' : '−'}
                            {formatDuration(Math.abs(delta))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {v.gapToNextMinutes == null ? '–' : formatDuration(v.gapToNextMinutes)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Map */}
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <MapPin className="h-4 w-4" style={{ color }} />
              Actual driven route
            </h3>
            <p className="text-xs text-muted-foreground">
              {data.polylineApproximate
                ? 'Approximate path (straight-line fallback).'
                : 'Path follows the actual visit order.'}
            </p>
          </div>
          <div className="relative h-[420px] w-full lg:h-[520px]">
            {canvasStops.length > 0 ? (
              <RouteMapCanvas
                home={home}
                stops={canvasStops}
                polyline={data.polyline}
                approximate={data.polylineApproximate}
                color={color}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                No geolocated visits to map for this period.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  hint,
  hintTone = 'muted',
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  hintTone?: 'muted' | 'good' | 'warn'
}) {
  const toneClass =
    hintTone === 'good'
      ? 'text-emerald-600'
      : hintTone === 'warn'
        ? 'text-amber-600'
        : 'text-muted-foreground'
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className={`mt-0.5 text-xs ${toneClass}`}>{hint}</div>}
    </Card>
  )
}

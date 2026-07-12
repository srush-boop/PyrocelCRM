'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  Loader2,
  MapPin,
  Clock,
  Car,
  Timer,
  Save,
  Sparkles,
  TriangleAlert,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { RouteDayTimeline } from './route-day-timeline'
import { RouteOptimizeDialog, type ProposedRoute } from './route-optimize-dialog'
import {
  buildDayPlan,
  legsFromMatrix,
  formatClock,
  type DayPlan,
  type DayPlanStopInput,
  type WorkingDay,
} from '@/lib/routes/day-plan'
import { optimizeFromMatrix } from '@/lib/routes/optimize'
import { formatDuration } from '@/lib/task-duration'
import {
  getRouteMapData,
  saveRouteOrder,
  getRoutePolyline,
  optimizeRouteOrder,
} from '@/app/(dashboard)/dashboard/routes/[id]/actions'
import type { RouteMapData } from '@/app/(dashboard)/dashboard/routes/[id]/types'
import type { CanvasStop } from './route-map-canvas'

const RouteMapCanvas = dynamic(
  () => import('./route-map-canvas').then((m) => m.RouteMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-muted/40 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading map…
      </div>
    ),
  },
)

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
]

const FIRST_ARRIVAL = '08:30'

function todayWeekday(): string {
  const d = new Date().getDay() // 0 = Sun
  return String(d === 0 ? 7 : d)
}

export function RouteMapPlanner({ initialData }: { initialData: RouteMapData }) {
  const [data, setData] = useState<RouteMapData>(initialData)
  const [order, setOrder] = useState<string[]>(() => initialData.stops.map((s) => s.siteId))
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>(
    initialData.engineer?.id ?? initialData.assignedEngineerId ?? '',
  )
  const [weekday, setWeekday] = useState<string>(todayWeekday())
  const [dirty, setDirty] = useState(false)
  const [polyline, setPolyline] = useState<{ coordinates: [number, number][]; approximate: boolean }>({
    coordinates: [],
    approximate: true,
  })
  const [isLoading, startLoad] = useTransition()
  const [isSaving, startSave] = useTransition()
  const [isOptimizing, startOptimize] = useTransition()
  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [proposed, setProposed] = useState<ProposedRoute | null>(null)
  // Per-site manual "expected time on site" overrides (minutes), keyed by siteId.
  // Client-side planning overrides — they replace the learned estimate in every
  // day-plan calculation so all ETAs/totals recompute live as the user types.
  const [onSiteOverrides, setOnSiteOverrides] = useState<Record<string, number>>({})
  const dragIndex = useRef<number | null>(null)

  const stopById = useMemo(() => {
    const m = new Map(data.stops.map((s) => [s.siteId, s]))
    return m
  }, [data.stops])

  // Effective on-site minutes for a stop: manual override if set, else learned.
  const effectiveOnSite = useCallback(
    (siteId: string, base: number) => {
      const o = onSiteOverrides[siteId]
      return o != null && Number.isFinite(o) ? o : base
    },
    [onSiteOverrides],
  )

  const setOnSiteOverride = useCallback((siteId: string, raw: string) => {
    setOnSiteOverrides((prev) => {
      const next = { ...prev }
      const trimmed = raw.trim()
      if (trimmed === '') {
        delete next[siteId]
        return next
      }
      const n = Math.round(Number(trimmed))
      if (!Number.isFinite(n) || n < 0) return prev
      next[siteId] = Math.min(n, 1440)
      return next
    })
  }, [])

  const clearOnSiteOverride = useCallback((siteId: string) => {
    setOnSiteOverrides((prev) => {
      if (!(siteId in prev)) return prev
      const next = { ...prev }
      delete next[siteId]
      return next
    })
  }, [])

  // Ordered stops (site-level), resolved from the current order of ids.
  const orderedStops = useMemo(
    () => order.map((id) => stopById.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [order, stopById],
  )

  const locatedStops = useMemo(() => orderedStops.filter((s) => s.hasLocation), [orderedStops])
  const unlocatedStops = useMemo(() => orderedStops.filter((s) => !s.hasLocation), [orderedStops])

  const home = data.engineer && data.engineer.homeLatitude != null && data.engineer.homeLongitude != null
    ? { latitude: data.engineer.homeLatitude, longitude: data.engineer.homeLongitude }
    : null

  // Working hours for the chosen weekday.
  const workingDay: WorkingDay | null = useMemo(() => {
    const entry = data.engineer?.workDayHours?.[weekday]
    if (!entry) return null
    return { start: entry.start, end: entry.end, breakMinutes: entry.break_minutes ?? 0 }
  }, [data.engineer, weekday])

  // Legs for the current order, recomputed instantly from the matrix.
  const legs = useMemo(() => {
    if (!data.matrix || locatedStops.length === 0) return null
    const orderedStopIndices = locatedStops.map((s) => data.locatedStopIds.indexOf(s.siteId))
    return legsFromMatrix(
      data.matrix.durations,
      data.matrix.distances,
      orderedStopIndices,
      data.matrix.approximate,
    )
  }, [data.matrix, data.locatedStopIds, locatedStops])

  const plan = useMemo(() => {
    if (!legs || !home || locatedStops.length === 0) return null
    const stops: DayPlanStopInput[] = locatedStops.map((s) => ({
      id: s.siteId,
      name: s.name,
      postcode: s.postcode,
      onSiteMinutes: effectiveOnSite(s.siteId, s.onSiteMinutes),
      services: s.services.map((svc) => ({
        id: svc.id,
        label: svc.label,
        minutes: svc.minutes,
        learned: svc.learned,
        sampleSize: svc.sampleSize,
      })),
    }))
    return buildDayPlan(stops, legs, { firstArrival: FIRST_ARRIVAL, workingDay })
  }, [legs, home, locatedStops, workingDay, effectiveOnSite])

  // Build a day plan for an arbitrary located-stop order (used for the proposed
  // optimised route). Scores against the SAME matrix as the live plan so the
  // "time saved" comparison is consistent with the on-screen ETAs.
  const buildPlanFor = useCallback(
    (locatedIds: string[]): DayPlan | null => {
      if (!data.matrix || !home || locatedIds.length === 0) return null
      const orderedStopIndices = locatedIds
        .map((id) => data.locatedStopIds.indexOf(id))
        .filter((i) => i >= 0)
      const lg = legsFromMatrix(
        data.matrix.durations,
        data.matrix.distances,
        orderedStopIndices,
        data.matrix.approximate,
      )
      const stops: DayPlanStopInput[] = locatedIds
        .map((id) => stopById.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => ({
          id: s.siteId,
          name: s.name,
          postcode: s.postcode,
          onSiteMinutes: effectiveOnSite(s.siteId, s.onSiteMinutes),
          services: s.services.map((svc) => ({
            id: svc.id,
            label: svc.label,
            minutes: svc.minutes,
            learned: svc.learned,
            sampleSize: svc.sampleSize,
          })),
        }))
      return buildDayPlan(stops, lg, { firstArrival: FIRST_ARRIVAL, workingDay })
    },
    [data.matrix, data.locatedStopIds, home, workingDay, stopById, effectiveOnSite],
  )

  const proposedPlan = useMemo(
    () => (proposed ? buildPlanFor(proposed.canvasStops.map((s) => s.siteId)) : null),
    [proposed, buildPlanFor],
  )

  const canOptimize = Boolean(home) && locatedStops.length >= 2 && Boolean(data.matrix)

  const handleOptimize = () => {
    if (!home || !data.matrix || locatedStops.length < 2) {
      toast.error('Need a CDO home postcode and at least two located stops to optimise.')
      return
    }
    startOptimize(async () => {
      const matrix = data.matrix!
      const stopsCoords = data.locatedStopIds.map((id) => {
        const s = stopById.get(id)!
        return { latitude: s.latitude as number, longitude: s.longitude as number }
      })
      const res = await optimizeRouteOrder(home, stopsCoords)
      // OSRM order (or local heuristic fallback) → located-stop ids in new order.
      const orderIdx = res.approximate ? optimizeFromMatrix(matrix.durations) : res.order
      const proposedIds = orderIdx
        .map((i) => data.locatedStopIds[i])
        .filter((id): id is string => Boolean(id))
      const canvas: CanvasStop[] = proposedIds.map((id) => {
        const s = stopById.get(id)!
        return {
          siteId: s.siteId,
          name: s.name,
          latitude: s.latitude as number,
          longitude: s.longitude as number,
        }
      })
      const points = [
        { latitude: home.latitude, longitude: home.longitude },
        ...canvas.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
        { latitude: home.latitude, longitude: home.longitude },
      ]
      const poly = await getRoutePolyline(points)
      setProposed({
        canvasStops: canvas,
        polyline: poly.coordinates,
        polylineApproximate: poly.approximate,
        solverApproximate: res.approximate,
      })
      setOptimizeOpen(true)
    })
  }

  const handleAdopt = () => {
    if (!proposed) return
    const proposedIds = proposed.canvasStops.map((s) => s.siteId)
    const locatedSet = new Set(proposedIds)
    // Keep any unlocated stops (excluded from routing) at the end, current order.
    const unlocatedIds = order.filter((id) => !locatedSet.has(id))
    setOrder([...proposedIds, ...unlocatedIds])
    setDirty(true)
    setOptimizeOpen(false)
    toast.success('Adopted optimised order — review and Save')
  }

  const canvasStops = useMemo<CanvasStop[]>(
    () =>
      locatedStops.map((s) => ({
        siteId: s.siteId,
        name: s.name,
        latitude: s.latitude as number,
        longitude: s.longitude as number,
      })),
    [locatedStops],
  )

  // Debounced best-effort polyline refresh for the current order.
  useEffect(() => {
    if (!home || canvasStops.length === 0) {
      setPolyline({ coordinates: [], approximate: true })
      return
    }
    const points = [
      { latitude: home.latitude, longitude: home.longitude },
      ...canvasStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
      { latitude: home.latitude, longitude: home.longitude },
    ]
    let cancelled = false
    const t = setTimeout(() => {
      getRoutePolyline(points).then((res) => {
        if (!cancelled) setPolyline(res)
      })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [home, canvasStops])

  const move = useCallback((from: number, to: number) => {
    setOrder((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setDirty(true)
  }, [])

  const handleEngineerChange = (id: string) => {
    setSelectedEngineerId(id)
    startLoad(async () => {
      const { data: fresh, error } = await getRouteMapData(data.routeId, id)
      if (error || !fresh) {
        toast.error(error || 'Could not load CDO data')
        return
      }
      // Preserve the user's current (possibly unsaved) order.
      setData(fresh)
    })
  }

  const handleSave = () => {
    startSave(async () => {
      const { error } = await saveRouteOrder(data.routeId, order)
      if (error) {
        toast.error(error)
        return
      }
      setDirty(false)
      toast.success('Route order saved')
    })
  }

  const endDelta = plan?.endDeltaMin ?? null

  return (
    <div className="space-y-4">
      {/* Controls + header stats */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cdo-select" className="text-xs">
                CDO
              </Label>
              <Select value={selectedEngineerId} onValueChange={handleEngineerChange}>
                <SelectTrigger id="cdo-select" className="w-52">
                  <SelectValue placeholder="Select a CDO" />
                </SelectTrigger>
                <SelectContent>
                  {data.engineers.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weekday-select" className="text-xs">
                Day modelled
              </Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger id="weekday-select" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isLoading && (
              <span className="flex items-center gap-1 pb-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleOptimize}
              disabled={!canOptimize || isOptimizing}
              className="gap-2"
            >
              {isOptimizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI Optimize
            </Button>
            <Button onClick={handleSave} disabled={!dirty || isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save order
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={<Clock className="h-4 w-4" />} label="Day" value={`${formatClock(plan.leaveHomeMin)} – ${formatClock(plan.dayEndMin)}`} />
          <StatTile icon={<Car className="h-4 w-4" />} label="Driving" value={`${formatDuration(plan.totalDriveMinutes)} · ${plan.totalMiles} mi`} />
          <StatTile icon={<Timer className="h-4 w-4" />} label="On site" value={formatDuration(plan.totalOnSiteMinutes)} />
          <StatTile
            icon={<Clock className="h-4 w-4" />}
            label="Vs contracted"
            value={
              endDelta == null
                ? '—'
                : endDelta === 0
                  ? 'On time'
                  : `${formatDuration(Math.abs(endDelta))} ${endDelta > 0 ? 'over' : 'under'}`
            }
            tone={endDelta != null && endDelta > 0 ? 'warn' : 'default'}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Left: reorderable stop list + timeline */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" /> Visit order
                <Badge variant="secondary" className="ml-auto font-normal">
                  {orderedStops.length} site{orderedStops.length === 1 ? '' : 's'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orderedStops.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sites on this route yet. Add services to the route from the Routes list.
                </p>
              )}
              <ul className="space-y-1.5">
                {orderedStops.map((stop, index) => {
                  const positionLabel = stop.hasLocation
                    ? locatedStops.findIndex((s) => s.siteId === stop.siteId) + 1
                    : null
                  const overrideVal = onSiteOverrides[stop.siteId]
                  const isOverridden = overrideVal != null
                  const effMinutes = isOverridden ? overrideVal : stop.onSiteMinutes
                  return (
                    <li
                      key={stop.siteId}
                      draggable
                      onDragStart={() => {
                        dragIndex.current = index
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current != null && dragIndex.current !== index) {
                          move(dragIndex.current, index)
                        }
                        dragIndex.current = null
                      }}
                      className="flex items-center gap-2 rounded-md border bg-card px-2 py-2"
                    >
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {positionLabel ?? '–'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{stop.name}</span>
                          {!stop.hasLocation && (
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-amber-600">
                              <TriangleAlert className="h-3 w-3" /> no location
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {stop.services.length} service{stop.services.length === 1 ? '' : 's'} ·{' '}
                          {formatDuration(effMinutes)} on site
                          {isOverridden ? (
                            <span className="text-primary"> · custom</span>
                          ) : (
                            <span> · est.</span>
                          )}
                          {stop.postcode ? ` · ${stop.postcode}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <label className="sr-only" htmlFor={`onsite-${stop.siteId}`}>
                          Expected time on site for {stop.name} in minutes
                        </label>
                        <div className="relative">
                          <Input
                            id={`onsite-${stop.siteId}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={5}
                            value={overrideVal ?? ''}
                            placeholder={String(stop.onSiteMinutes)}
                            onChange={(e) => setOnSiteOverride(stop.siteId, e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-9 w-[4.75rem] pr-8 text-sm tabular-nums"
                            aria-label={`Expected minutes on site at ${stop.name}`}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            min
                          </span>
                        </div>
                        {isOverridden && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-8 text-muted-foreground"
                            onClick={() => clearOnSiteOverride(stop.siteId)}
                            aria-label={`Reset time on site for ${stop.name} to estimate`}
                            title="Reset to estimate"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          onClick={() => move(index, index + 1)}
                          disabled={index === orderedStops.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {unlocatedStops.length > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  {unlocatedStops.length} site{unlocatedStops.length === 1 ? '' : 's'} without a
                  geocodable postcode are excluded from the route line and ETAs.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Day plan
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  arrive first site {FIRST_ARRIVAL}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RouteDayTimeline plan={plan} />
            </CardContent>
          </Card>
        </div>

        {/* Right: map */}
        <Card className="overflow-hidden">
          <div className="h-[560px] w-full">
            <RouteMapCanvas
              home={home}
              stops={canvasStops}
              polyline={polyline.coordinates}
              approximate={polyline.approximate}
              color={data.routeColor || '#2563eb'}
            />
          </div>
        </Card>
      </div>

      <RouteOptimizeDialog
        open={optimizeOpen}
        onOpenChange={setOptimizeOpen}
        home={home}
        color={data.routeColor || '#2563eb'}
        proposed={proposed}
        proposedPlan={proposedPlan}
        currentPlan={plan}
        onAdopt={handleAdopt}
      />
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'default' | 'warn'
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <span
          className={
            tone === 'warn'
              ? 'flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700'
              : 'flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground'
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

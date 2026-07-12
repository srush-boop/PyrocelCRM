'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Sparkles, Car, Clock, Route as RouteIcon, TrendingDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RouteDayTimeline } from './route-day-timeline'
import { formatDuration } from '@/lib/task-duration'
import { formatClock, type DayPlan } from '@/lib/routes/day-plan'
import type { CanvasStop } from './route-map-canvas'

const RouteMapCanvas = dynamic(() => import('./route-map-canvas').then((m) => m.RouteMapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-muted/40 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading map…
    </div>
  ),
})

export interface ProposedRoute {
  canvasStops: CanvasStop[]
  polyline: [number, number][]
  polylineApproximate: boolean
  /** True when OSRM was unavailable and the local heuristic was used. */
  solverApproximate: boolean
}

export function RouteOptimizeDialog({
  open,
  onOpenChange,
  home,
  color,
  proposed,
  proposedPlan,
  currentPlan,
  onAdopt,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  home: { latitude: number; longitude: number } | null
  color: string
  proposed: ProposedRoute | null
  proposedPlan: DayPlan | null
  currentPlan: DayPlan | null
  onAdopt: () => void
}) {
  // Only mount the Leaflet map once the dialog has finished its open animation,
  // so Leaflet measures a fully-sized, settled (non-transformed) container.
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => {
    if (!open) {
      setMapReady(false)
      return
    }
    const t = window.setTimeout(() => setMapReady(true), 220)
    return () => clearTimeout(t)
  }, [open])

  const driveSaved =
    currentPlan && proposedPlan ? currentPlan.totalDriveMinutes - proposedPlan.totalDriveMinutes : 0
  const milesSaved =
    currentPlan && proposedPlan
      ? Math.round((currentPlan.totalMiles - proposedPlan.totalMiles) * 10) / 10
      : 0
  const improved = driveSaved > 0 || milesSaved > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Optimised route
          </DialogTitle>
          <DialogDescription>
            Shortest driving order through all located stops, anchored at the CDO&apos;s home.
            {proposed?.solverApproximate
              ? ' Estimated locally (live routing was unavailable).'
              : ' Computed by typical drive time — live traffic is not considered.'}
          </DialogDescription>
        </DialogHeader>

        {/* Savings summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SaveTile
            icon={<Car className="h-4 w-4" />}
            label="Driving"
            value={proposedPlan ? `${formatDuration(proposedPlan.totalDriveMinutes)} · ${proposedPlan.totalMiles} mi` : '—'}
          />
          <SaveTile
            icon={<Clock className="h-4 w-4" />}
            label="Day ends"
            value={proposedPlan ? formatClock(proposedPlan.dayEndMin) : '—'}
          />
          <SaveTile
            icon={<TrendingDown className="h-4 w-4" />}
            label="Saving"
            tone={improved ? 'good' : 'default'}
            value={
              improved
                ? `${driveSaved > 0 ? formatDuration(driveSaved) : ''}${driveSaved > 0 && milesSaved > 0 ? ' · ' : ''}${milesSaved > 0 ? `${milesSaved} mi` : ''}`
                : 'Already optimal'
            }
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Proposed map — definite height so Leaflet never sizes against an
              indefinite (percentage-of-auto) parent and balloons off-screen. */}
          <div className="relative h-[360px] overflow-hidden rounded-md border lg:h-[520px]">
            {mapReady ? (
              <RouteMapCanvas
                home={home}
                stops={proposed?.canvasStops ?? []}
                polyline={proposed?.polyline ?? []}
                approximate={proposed?.polylineApproximate ?? true}
                color={color}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/40 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading map…
              </div>
            )}
          </div>

          {/* Proposed day plan */}
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="mb-2 flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Proposed day plan</span>
              <Badge variant="secondary" className="ml-auto font-normal">
                {proposed?.canvasStops.length ?? 0} stops
              </Badge>
            </div>
            <RouteDayTimeline plan={proposedPlan} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAdopt} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Adopt proposed order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveTile({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'default' | 'good'
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <span
        className={
          tone === 'good'
            ? 'flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700'
            : 'flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground'
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

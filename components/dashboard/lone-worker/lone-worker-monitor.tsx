'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { toast } from 'sonner'
import {
  ShieldCheck,
  ShieldAlert,
  Siren,
  MapPin,
  Clock,
  Loader2,
  PhoneCall,
  Users,
} from 'lucide-react'
import type { AlertPoint } from '@/components/dashboard/lone-worker/lone-worker-monitor-canvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getMonitorData,
  officeMadeContact,
} from '@/app/(dashboard)/dashboard/lone-worker/actions'
import {
  formatShiftTime,
  type LoneWorkerMonitorData,
  type LoneWorkerMonitorRow,
} from '@/lib/lone-worker/types'

// Leaflet touches `window`, so the canvas must only render on the client.
const LoneWorkerMonitorCanvas = dynamic(
  () =>
    import('./lone-worker-monitor-canvas').then((m) => m.LoneWorkerMonitorCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-muted/40 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading map…
      </div>
    ),
  },
)

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return '—'
  const diff = Math.max(0, now - new Date(iso).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

function countdown(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now
  const past = diff < 0
  const s = Math.floor(Math.abs(diff) / 1000)
  const m = Math.floor(s / 60)
  const label = `${m}:${String(s % 60).padStart(2, '0')}`
  return past ? `-${label}` : label
}

export function LoneWorkerMonitor({ initialData }: { initialData: LoneWorkerMonitorData }) {
  const { data, mutate } = useSWR<LoneWorkerMonitorData>(
    'lone-worker-monitor',
    () => getMonitorData(),
    { refreshInterval: 10000, fallbackData: initialData, revalidateOnFocus: true },
  )

  const [now, setNow] = useState(() => Date.now())
  const [acking, setAcking] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const offset = useMemo(() => (data ? data.serverNow - Date.now() : 0), [data])
  const effNow = now + offset

  const rows = data?.rows ?? []
  const warningCount = data?.warningCount ?? 0
  const emergencyCount = data?.emergencyCount ?? 0
  const hasAlerts = warningCount > 0 || emergencyCount > 0

  // Active alerts (amber/red) that have a captured location, for the map.
  const alertPoints = useMemo<AlertPoint[]>(
    () =>
      rows
        .filter((r) => r.activeLevel != null && r.lat != null && r.lng != null)
        .map((r) => ({
          sessionId: r.sessionId,
          userName: r.userName,
          level: r.activeLevel as 'amber' | 'red',
          lat: r.lat as number,
          lng: r.lng as number,
          since: r.activeSince,
          locationUpdatedAt: r.locationUpdatedAt,
        })),
    [rows],
  )
  // Alerts still awaiting a GPS fix (so we can note them beneath the map).
  const alertsAwaitingLocation = rows.filter(
    (r) => r.activeLevel != null && (r.lat == null || r.lng == null),
  ).length

  const onMadeContact = useCallback(
    async (eventId: string) => {
      setAcking(eventId)
      const res = await officeMadeContact(eventId)
      setAcking(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Marked as made contact — worker reset to safe')
      await mutate()
    },
    [mutate],
  )

  return (
    <div className="space-y-6">
      {/* Status tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Users}
          label="On shift"
          value={rows.length}
          tone="neutral"
        />
        <StatTile
          icon={ShieldAlert}
          label="Warnings"
          value={warningCount}
          tone={warningCount > 0 ? 'amber' : 'neutral'}
        />
        <StatTile
          icon={Siren}
          label="Emergencies"
          value={emergencyCount}
          tone={emergencyCount > 0 ? 'red' : 'neutral'}
          pulse={emergencyCount > 0}
        />
      </div>

      {/* Alert locations map — only shown while there is an active warning or
          emergency, so the healthy board stays clean. */}
      {hasAlerts && (
        <Card
          className={cn(
            'overflow-hidden',
            emergencyCount > 0
              ? 'border-2 border-destructive/60'
              : 'border-2 border-amber-500/60',
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Alert locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertPoints.length > 0 ? (
              <div className="h-[360px] w-full overflow-hidden rounded-lg border">
                <LoneWorkerMonitorCanvas points={alertPoints} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
                <MapPin className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Waiting for a location fix from the affected worker&apos;s device.
                </p>
              </div>
            )}
            {alertPoints.length > 0 && alertsAwaitingLocation > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {alertsAwaitingLocation} more alert
                {alertsAwaitingLocation === 1 ? '' : 's'} awaiting a location fix.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Board */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Active lone workers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldCheck className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No lone workers are currently on shift.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <MonitorRow
                  key={row.sessionId}
                  row={row}
                  now={effNow}
                  acking={acking === row.activeEventId}
                  onMadeContact={onMadeContact}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: typeof Users
  label: string
  value: number
  tone: 'neutral' | 'amber' | 'red'
  pulse?: boolean
}) {
  const toneClasses =
    tone === 'red'
      ? 'border-destructive/50 bg-destructive/10 text-destructive'
      : tone === 'amber'
        ? 'border-amber-500/50 bg-amber-500/10 text-amber-600'
        : 'bg-muted text-muted-foreground'
  return (
    <Card className={cn(tone !== 'neutral' && 'border-2', pulse && 'animate-pulse')}>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <div className="text-3xl font-bold tabular-nums">{value}</div>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function MonitorRow({
  row,
  now,
  acking,
  onMadeContact,
}: {
  row: LoneWorkerMonitorRow
  now: number
  acking: boolean
  onMadeContact: (eventId: string) => void
}) {
  const level = row.activeLevel
  const border =
    level === 'red'
      ? 'border-destructive/60 bg-destructive/5'
      : level === 'amber'
        ? 'border-amber-500/60 bg-amber-500/5'
        : 'border-border'

  const mapHref =
    row.lat != null && row.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`
      : null

  return (
    <li className={cn('rounded-lg border p-4', border, level === 'red' && 'animate-pulse')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              level === 'red'
                ? 'bg-destructive text-destructive-foreground'
                : level === 'amber'
                  ? 'bg-amber-500 text-white'
                  : 'bg-primary/10 text-primary',
            )}
          >
            {level === 'red' ? (
              <Siren className="h-5 w-5" />
            ) : level === 'amber' ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>
          <div>
            <p className="font-semibold">{row.userName}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
                Shift {formatShiftTime(row.shiftStart)}–{formatShiftTime(row.shiftEnd)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {level === 'red' ? (
            <Badge variant="destructive" className="gap-1">
              <Siren className="h-3 w-3" />
              Emergency
            </Badge>
          ) : level === 'amber' ? (
            <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500/90">
              <ShieldAlert className="h-3 w-3" />
              Warning
            </Badge>
          ) : row.promptState === 'prompting' ? (
            <Badge variant="secondary">Awaiting check-in</Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              OK
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Last check-in:{' '}
          <span className="font-medium text-foreground">{timeAgo(row.lastCheckinAt, now)}</span>
        </span>
        {level ? (
          <span>
            {level === 'red' ? 'Emergency' : 'Warning'} raised:{' '}
            <span className="font-medium text-foreground">{timeAgo(row.activeSince, now)}</span>
          </span>
        ) : (
          <span>
            Next check-in:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {countdown(row.nextPromptAt, now)}
            </span>
          </span>
        )}
        {row.locationUpdatedAt && (
          <span>
            Location: <span className="text-foreground">{timeAgo(row.locationUpdatedAt, now)}</span>
          </span>
        )}
      </div>

      {level && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mapHref && (
            <Button asChild size="sm" variant="outline" className="gap-1">
              <a href={mapHref} target="_blank" rel="noopener noreferrer">
                <MapPin className="h-4 w-4" />
                View location
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant={level === 'red' ? 'destructive' : 'default'}
            className="gap-1"
            disabled={acking || !row.activeEventId}
            onClick={() => row.activeEventId && onMadeContact(row.activeEventId)}
          >
            {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            Made contact
          </Button>
        </div>
      )}
    </li>
  )
}

'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { ShieldCheck, ShieldAlert, Siren, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getMonitorData } from '@/app/(dashboard)/dashboard/lone-worker/actions'
import type { LoneWorkerMonitorData } from '@/lib/lone-worker/types'

/**
 * Compact live lone-worker tiles for the manager dashboard. Polls the monitor
 * data and always renders (0 when healthy). The whole strip links to the full
 * monitoring board. Emergencies pulse red so they cannot be missed.
 */
export function LoneWorkerDashboardTiles() {
  const { data } = useSWR<LoneWorkerMonitorData>(
    'lone-worker-monitor',
    () => getMonitorData(),
    { refreshInterval: 15000 },
  )

  const onShift = data?.rows.length ?? 0
  const warnings = data?.warningCount ?? 0
  const emergencies = data?.emergencyCount ?? 0
  const alerting = warnings > 0 || emergencies > 0

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-colors hover:border-primary/50 hover:bg-accent/40',
        emergencies > 0 && 'border-2 border-destructive/60',
        emergencies === 0 && warnings > 0 && 'border-2 border-amber-500/60',
      )}
    >
      <Link
        href="/dashboard/lone-worker"
        aria-label="Open lone worker monitoring"
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <CardContent className="pointer-events-none relative z-[1] flex items-center gap-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Lone Worker</p>
            <p className="text-xs text-muted-foreground">Safety monitoring</p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-2">
          <Metric label="On shift" value={onShift} />
          <Metric
            label="Warnings"
            value={warnings}
            icon={ShieldAlert}
            tone={warnings > 0 ? 'amber' : undefined}
          />
          <Metric
            label="Emergencies"
            value={emergencies}
            icon={Siren}
            tone={emergencies > 0 ? 'red' : undefined}
            pulse={emergencies > 0}
          />
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </CardContent>
    </Card>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  pulse,
}: {
  label: string
  value: number
  icon?: typeof Siren
  tone?: 'amber' | 'red'
  pulse?: boolean
}) {
  const color =
    tone === 'red' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600' : ''
  return (
    <div className={cn('space-y-0.5', pulse && 'animate-pulse')}>
      <div className={cn('flex items-center gap-1 text-2xl font-bold tabular-nums', color)}>
        {Icon && <Icon className="h-5 w-5" />}
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

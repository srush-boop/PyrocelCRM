'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { ShieldCheck, ShieldAlert, Siren, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
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

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border transition-colors hover:border-primary/50 hover:bg-accent/40',
        // Flash the whole tile border: red for an active emergency (takes
        // priority), amber for a warning. Static hover border otherwise.
        emergencies > 0 && 'lw-border-flash-red',
        emergencies === 0 && warnings > 0 && 'lw-border-flash-amber',
      )}
    >
      <Link
        href="/dashboard/lone-worker"
        aria-label="Open lone worker monitoring"
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-[1] flex items-center gap-3 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Lone Worker</p>
          <p className="text-xs text-muted-foreground">Safety monitoring</p>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <Metric label="On shift" value={onShift} />
          <Metric
            label="Warn"
            value={warnings}
            icon={ShieldAlert}
            tone={warnings > 0 ? 'amber' : undefined}
          />
          <Metric
            label="Emerg"
            value={emergencies}
            icon={Siren}
            tone={emergencies > 0 ? 'red' : undefined}
            pulse={emergencies > 0}
          />
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
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
    <div className={cn('text-center leading-none', pulse && 'animate-pulse')}>
      <div className={cn('flex items-center justify-center gap-1 text-lg font-bold tabular-nums', color)}>
        {Icon && <Icon className="size-4" />}
        {value}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { ShieldAlert, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMonitorData } from '@/app/(dashboard)/dashboard/lone-worker/actions'
import type { LoneWorkerMonitorData } from '@/lib/lone-worker/types'

/**
 * Compact lone-worker warning + emergency counters, designed to sit inline
 * beside an action button (e.g. the Calls Map "Log Call" button). Polls the
 * shared monitor cache (same SWR key as the board/tiles) and links through to
 * the full monitoring screen. Stays neutral at 0, turns amber on a warning and
 * red + pulsing on an emergency so it can't be missed from the dispatch view.
 */
export function LoneWorkerHeaderCounters() {
  const { data } = useSWR<LoneWorkerMonitorData>(
    'lone-worker-monitor',
    () => getMonitorData(),
    { refreshInterval: 15000 },
  )

  const warnings = data?.warningCount ?? 0
  const emergencies = data?.emergencyCount ?? 0

  return (
    <Link
      href="/dashboard/lone-worker"
      aria-label={`Lone worker: ${warnings} warning${warnings === 1 ? '' : 's'}, ${emergencies} emergenc${emergencies === 1 ? 'y' : 'ies'}. Open monitoring.`}
      className="inline-flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Counter
        icon={ShieldAlert}
        label="Warnings"
        value={warnings}
        tone={warnings > 0 ? 'amber' : 'neutral'}
      />
      <Counter
        icon={Siren}
        label="Emergencies"
        value={emergencies}
        tone={emergencies > 0 ? 'red' : 'neutral'}
        pulse={emergencies > 0}
      />
    </Link>
  )
}

function Counter({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: typeof Siren
  label: string
  value: number
  tone: 'neutral' | 'amber' | 'red'
  pulse?: boolean
}) {
  const toneClasses =
    tone === 'red'
      ? 'border-destructive/60 bg-destructive/10 text-destructive'
      : tone === 'amber'
        ? 'border-amber-500/60 bg-amber-500/10 text-amber-600'
        : 'border-border bg-muted/40 text-muted-foreground'
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors',
        toneClasses,
        pulse && 'animate-pulse',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="hidden text-xs font-medium sm:inline">{label}</span>
    </span>
  )
}

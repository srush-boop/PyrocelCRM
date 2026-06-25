'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatDateUK } from '@/lib/utils'
import {
  getLogbookEntryMeta,
  getLogbookSystemMeta,
  systemForEntryType,
  systemForServiceName,
  LOGBOOK_SYSTEMS,
  type LogbookSystemId,
} from '@/lib/logbook'
import type { LogbookEntry } from '@/lib/types/database'
import {
  ExternalLink,
  BellRing,
  Lightbulb,
  FireExtinguisher,
  Wind,
  Users,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

const SYSTEM_ICONS: Record<LogbookSystemId, LucideIcon> = {
  fire_alarm: BellRing,
  emergency_lighting: Lightbulb,
  extinguishers: FireExtinguisher,
  dampers: Wind,
  fire_drill: Users,
  general: ClipboardList,
}

export interface ReportTimelineItem {
  id: string
  date: string
  serviceName: string
  engineerName: string | null
  status: 'pass' | 'partial' | 'fail' | null
  /** Optional deep link to the full report (staff view only). */
  href?: string
}

export interface LogbookTimelineProps {
  reports: ReportTimelineItem[]
  entries: LogbookEntry[]
}

type MergedItem =
  | { kind: 'report'; date: string; sortKey: number; system: LogbookSystemId; data: ReportTimelineItem }
  | { kind: 'entry'; date: string; sortKey: number; system: LogbookSystemId; data: LogbookEntry }

function statusBadge(status: ReportTimelineItem['status']) {
  if (status === 'pass') return <Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
  if (status === 'partial') return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
  if (status === 'fail') return <Badge variant="destructive">Fail</Badge>
  return null
}

export function LogbookTimeline({ reports, entries }: LogbookTimelineProps) {
  const [activeSystem, setActiveSystem] = useState<LogbookSystemId | 'all'>('all')

  const merged: MergedItem[] = useMemo(
    () =>
      [
        ...reports.map((r) => ({
          kind: 'report' as const,
          date: r.date,
          sortKey: new Date(r.date).getTime(),
          system: systemForServiceName(r.serviceName),
          data: r,
        })),
        ...entries.map((e) => ({
          kind: 'entry' as const,
          date: e.entry_date,
          sortKey: new Date(e.entry_date).getTime(),
          system: systemForEntryType(e.entry_type),
          data: e,
        })),
      ].sort((a, b) => b.sortKey - a.sortKey),
    [reports, entries],
  )

  // Only offer filters for systems that actually have records, with counts.
  const systemCounts = useMemo(() => {
    const counts = new Map<LogbookSystemId, number>()
    for (const item of merged) counts.set(item.system, (counts.get(item.system) ?? 0) + 1)
    return counts
  }, [merged])

  const availableSystems = useMemo(
    () => LOGBOOK_SYSTEMS.filter((s) => systemCounts.has(s.id)),
    [systemCounts],
  )

  if (merged.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No log book entries or service reports yet.
      </div>
    )
  }

  const visible =
    activeSystem === 'all' ? merged : merged.filter((item) => item.system === activeSystem)

  return (
    <div className="space-y-4">
      {availableSystems.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter records by system">
          <Button
            type="button"
            size="sm"
            variant={activeSystem === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveSystem('all')}
            className="h-8 gap-1.5"
          >
            All
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">
              {merged.length}
            </Badge>
          </Button>
          {availableSystems.map((system) => {
            const Icon = SYSTEM_ICONS[system.id]
            const active = activeSystem === system.id
            return (
              <Button
                key={system.id}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => setActiveSystem(system.id)}
                className="h-8 gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {system.label}
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">
                  {systemCounts.get(system.id)}
                </Badge>
              </Button>
            )
          })}
        </div>
      )}

      <ol className="relative space-y-3 border-l border-border pl-6">
        {visible.map((item) => {
          const SystemIcon = SYSTEM_ICONS[item.system]
          const systemLabel = getLogbookSystemMeta(item.system).label
          return (
          <li key={`${item.kind}-${item.data.id}`} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
                item.kind === 'report' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
              )}
              aria-hidden="true"
            >
              <SystemIcon className="h-3.5 w-3.5" />
            </span>

          {item.kind === 'report' ? (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <SystemIcon className="h-3 w-3" aria-hidden="true" />
                      {systemLabel}
                    </Badge>
                    <span className="font-medium">{item.data.serviceName}</span>
                    {statusBadge(item.data.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDateUK(item.data.date)}
                    {item.data.engineerName ? ` · ${item.data.engineerName}` : ''}
                  </p>
                </div>
                {item.data.href && (
                  <Link
                    href={item.data.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View report <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <SystemIcon className="h-3 w-3" aria-hidden="true" />
                    {systemLabel}
                  </Badge>
                  <Badge variant="secondary">{item.data.source === 'occupier' ? 'Occupier' : 'Staff'}</Badge>
                  <span className="font-medium">{getLogbookEntryMeta(item.data.entry_type).label}</span>
                </div>
                {item.data.title && <p className="text-sm font-medium">{item.data.title}</p>}
                {item.data.details && (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.data.details}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatDateUK(item.data.entry_date)}
                  {item.data.performed_by ? ` · ${item.data.performed_by}` : ''}
                </p>
              </CardContent>
            </Card>
          )}
          </li>
          )
        })}
      </ol>

      {visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No records for this system yet.
        </div>
      )}
    </div>
  )
}

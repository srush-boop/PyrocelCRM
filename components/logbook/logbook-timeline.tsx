'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatDateUK } from '@/lib/utils'
import {
  getLogbookEntryMeta,
  getLogbookSystemMeta,
  systemForEntryType,
  systemForReport,
  LOGBOOK_SYSTEMS,
  LOGBOOK_CATEGORY_LABELS,
  LOGBOOK_CATEGORY_ORDER,
  type LogbookSystemId,
  type LogbookCategory,
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
  DoorClosed,
  GraduationCap,
  Printer,
  Shield,
  X,
  type LucideIcon,
} from 'lucide-react'

const SYSTEM_ICONS: Record<LogbookSystemId, LucideIcon> = {
  fire_alarm: BellRing,
  emergency_lighting: Lightbulb,
  extinguishers: FireExtinguisher,
  dampers: Wind,
  fire_doors: DoorClosed,
  fire_drill: Users,
  training: GraduationCap,
  security: Shield,
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
  /**
   * Master-level classification of the parent system type. Drives which section
   * (Fire safety / Security / Other) the record appears under. Defaults to
   * 'fire' when absent so legacy data stays in the fire section.
   */
  logbookCategory?: LogbookCategory | null
  /** Parent system type name (e.g. "Intruder Alarm"), used as the Security label. */
  systemTypeName?: string | null
}

export interface LogbookTimelineProps {
  reports: ReportTimelineItem[]
  entries: LogbookEntry[]
  /**
   * When provided, a "Print this range" button is shown that links to this
   * path with the active from/to dates appended as query params.
   */
  printHrefBase?: string
}

type MergedItem =
  | {
      kind: 'report'
      date: string
      sortKey: number
      system: LogbookSystemId
      category: LogbookCategory
      label: string
      data: ReportTimelineItem
    }
  | {
      kind: 'entry'
      date: string
      sortKey: number
      system: LogbookSystemId
      category: LogbookCategory
      label: string
      data: LogbookEntry
    }

function statusBadge(status: ReportTimelineItem['status']) {
  if (status === 'pass') return <Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
  if (status === 'partial') return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
  if (status === 'fail') return <Badge variant="destructive">Fail</Badge>
  return null
}

export function LogbookTimeline({ reports, entries, printHrefBase }: LogbookTimelineProps) {
  const [activeSystem, setActiveSystem] = useState<LogbookSystemId | 'all'>('all')
  // Optional date range (inclusive). Empty string = unbounded on that end.
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const merged: MergedItem[] = useMemo(
    () =>
      [
        ...reports.map((r) => {
          // Classify from the master-level system category first; only guess the
          // fire sub-system from the service name WITHIN the fire section.
          const category: LogbookCategory = r.logbookCategory ?? 'fire'
          const system = systemForReport({ category, serviceName: r.serviceName })
          const label =
            system === 'security'
              ? r.systemTypeName || getLogbookSystemMeta(system).label
              : getLogbookSystemMeta(system).label
          return {
            kind: 'report' as const,
            date: r.date,
            sortKey: new Date(r.date).getTime(),
            system,
            category,
            label,
            data: r,
          }
        }),
        ...entries.map((e) => {
          // Occupier/staff routine entries are all fire-safety duties.
          const system = systemForEntryType(e.entry_type)
          return {
            kind: 'entry' as const,
            date: e.entry_date,
            sortKey: new Date(e.entry_date).getTime(),
            system,
            category: 'fire' as LogbookCategory,
            label: getLogbookSystemMeta(system).label,
            data: e,
          }
        }),
      ].sort((a, b) => b.sortKey - a.sortKey),
    [reports, entries],
  )

  // Apply the optional date range first; system counts and the list reflect it.
  const dateFiltered = useMemo(() => {
    if (!fromDate && !toDate) return merged
    // Compare on calendar date (YYYY-MM-DD) to avoid timezone drift.
    const fromKey = fromDate || null
    const toKey = toDate || null
    return merged.filter((item) => {
      const day = item.date.slice(0, 10)
      if (fromKey && day < fromKey) return false
      if (toKey && day > toKey) return false
      return true
    })
  }, [merged, fromDate, toDate])

  // Only offer filters for systems that actually have records, with counts.
  const systemCounts = useMemo(() => {
    const counts = new Map<LogbookSystemId, number>()
    for (const item of dateFiltered) counts.set(item.system, (counts.get(item.system) ?? 0) + 1)
    return counts
  }, [dateFiltered])

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
    activeSystem === 'all'
      ? dateFiltered
      : dateFiltered.filter((item) => item.system === activeSystem)

  const hasDateFilter = Boolean(fromDate || toDate)

  // Build the print link for the active range (portal staff/client print view).
  const printHref = useMemo(() => {
    if (!printHrefBase) return null
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    const qs = params.toString()
    return qs ? `${printHrefBase}?${qs}` : printHrefBase
  }, [printHrefBase, fromDate, toDate])

  // Split the visible records into their master-level sections (Fire safety /
  // Security / Other), keeping the date-descending order within each. Headings
  // only appear once more than one section is present.
  const visibleByCategory = LOGBOOK_CATEGORY_ORDER.map((category) => ({
    category,
    items: visible.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0)
  const showSectionHeadings = visibleByCategory.length > 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="logbook-from" className="text-xs">
            From
          </Label>
          <Input
            id="logbook-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 w-auto"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logbook-to" className="text-xs">
            To
          </Label>
          <Input
            id="logbook-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-auto"
          />
        </div>
        {hasDateFilter && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
            className="h-9 gap-1.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear dates
          </Button>
        )}
        {printHref && (
          <Button asChild size="sm" variant="outline" className="ml-auto h-9 gap-2">
            <Link href={printHref}>
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              {hasDateFilter ? 'Print this range' : 'Print log book'}
            </Link>
          </Button>
        )}
      </div>

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
              {dateFiltered.length}
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

      {visibleByCategory.map((group) => (
        <section key={group.category} className="space-y-3">
          {showSectionHeadings && (
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {LOGBOOK_CATEGORY_LABELS[group.category]}
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {group.items.length}
              </Badge>
            </h3>
          )}
          <ol className="relative space-y-3 border-l border-border pl-6">
            {group.items.map((item) => {
              const SystemIcon = SYSTEM_ICONS[item.system]
              const systemLabel = item.label
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
                {item.data.entry_type === 'weekly_alarm_test' &&
                  (item.data.call_point_ref || item.data.call_point_location) && (
                    <p className="text-sm">
                      <span className="font-medium">Call point tested: </span>
                      <span className="text-muted-foreground">
                        {[item.data.call_point_ref, item.data.call_point_location]
                          .filter(Boolean)
                          .join(' — ')}
                      </span>
                    </p>
                  )}
                {item.data.result && (
                  <p className="text-sm">
                    <span className="font-medium">Result: </span>
                    <span className="text-muted-foreground">{item.data.result}</span>
                  </p>
                )}
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
        </section>
      ))}

      {visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {hasDateFilter
            ? 'No records match the selected dates.'
            : 'No records for this system yet.'}
        </div>
      )}
    </div>
  )
}

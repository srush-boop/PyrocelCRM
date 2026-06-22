'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateUK } from '@/lib/utils'
import { getLogbookEntryMeta } from '@/lib/logbook'
import type { LogbookEntry } from '@/lib/types/database'
import { FileText, ClipboardCheck, ExternalLink } from 'lucide-react'

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
  | { kind: 'report'; date: string; sortKey: number; data: ReportTimelineItem }
  | { kind: 'entry'; date: string; sortKey: number; data: LogbookEntry }

function statusBadge(status: ReportTimelineItem['status']) {
  if (status === 'pass') return <Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge>
  if (status === 'partial') return <Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge>
  if (status === 'fail') return <Badge variant="destructive">Fail</Badge>
  return null
}

export function LogbookTimeline({ reports, entries }: LogbookTimelineProps) {
  const merged: MergedItem[] = [
    ...reports.map((r) => ({
      kind: 'report' as const,
      date: r.date,
      sortKey: new Date(r.date).getTime(),
      data: r,
    })),
    ...entries.map((e) => ({
      kind: 'entry' as const,
      date: e.entry_date,
      sortKey: new Date(e.entry_date).getTime(),
      data: e,
    })),
  ].sort((a, b) => b.sortKey - a.sortKey)

  if (merged.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No log book entries or service reports yet.
      </div>
    )
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-6">
      {merged.map((item) => (
        <li key={`${item.kind}-${item.data.id}`} className="relative">
          <span
            className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${
              item.kind === 'report' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
            }`}
            aria-hidden="true"
          >
            {item.kind === 'report' ? <FileText className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
          </span>

          {item.kind === 'report' ? (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Professional service</Badge>
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
      ))}
    </ol>
  )
}

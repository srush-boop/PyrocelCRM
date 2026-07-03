'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateUK } from '@/lib/utils'
import {
  getLogbookEntryMeta,
  getLogbookSystemMeta,
  systemForEntryType,
  systemForServiceName,
} from '@/lib/logbook'
import type { LogbookEntry } from '@/lib/types/database'
import type { ReportTimelineItem } from '@/components/logbook/logbook-timeline'

interface CompanyHeader {
  name: string | null
}

export interface LogbookPrintDocumentProps {
  site: { name: string; address: string }
  reports: ReportTimelineItem[]
  entries: LogbookEntry[]
  company: CompanyHeader | null
  backHref: string
  /** Optional inclusive date range (YYYY-MM-DD). Null = unbounded on that end. */
  fromDate?: string | null
  toDate?: string | null
}

type Row = {
  id: string
  sortKey: number
  date: string
  systemLabel: string
  record: string
  callPoint: string
  result: string
  by: string
}

function statusLabel(status: ReportTimelineItem['status']): string {
  if (status === 'pass') return 'Pass'
  if (status === 'partial') return 'Partial'
  if (status === 'fail') return 'Fail'
  return '—'
}

export function LogbookPrintDocument({
  site,
  reports,
  entries,
  company,
  backHref,
  fromDate,
  toDate,
}: LogbookPrintDocumentProps) {
  const hasRange = Boolean(fromDate || toDate)

  const rows = useMemo<Row[]>(() => {
    const reportRows: Row[] = reports.map((r) => ({
      id: `report-${r.id}`,
      sortKey: new Date(r.date).getTime(),
      date: r.date,
      systemLabel: getLogbookSystemMeta(systemForServiceName(r.serviceName)).label,
      record: r.serviceName,
      callPoint: '—',
      result: statusLabel(r.status),
      by: r.engineerName || '—',
    }))

    const entryRows: Row[] = entries.map((e) => {
      const isAlarmTest = e.entry_type === 'weekly_alarm_test'
      const callPoint =
        isAlarmTest && (e.call_point_ref || e.call_point_location)
          ? [e.call_point_ref, e.call_point_location].filter(Boolean).join(' — ')
          : '—'
      const recordLabel = getLogbookEntryMeta(e.entry_type).label
      return {
        id: `entry-${e.id}`,
        sortKey: new Date(e.entry_date).getTime(),
        date: e.entry_date,
        systemLabel: getLogbookSystemMeta(systemForEntryType(e.entry_type)).label,
        record: e.title ? `${recordLabel} — ${e.title}` : recordLabel,
        callPoint,
        result: e.result || (e.details ? e.details : '—'),
        by: e.performed_by || '—',
      }
    })

    const all = [...reportRows, ...entryRows]
    const filtered =
      fromDate || toDate
        ? all.filter((r) => {
            const day = r.date.slice(0, 10)
            if (fromDate && day < fromDate) return false
            if (toDate && day > toDate) return false
            return true
          })
        : all
    return filtered.sort((a, b) => b.sortKey - a.sortKey)
  }, [reports, entries, fromDate, toDate])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to log book
        </Link>
        <Button type="button" onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/pyrocel-logo.png"
            alt="Pyrocel Fire and Security logo"
            className="mb-3 h-14 w-auto object-contain"
          />
          {company?.name && (
            <p className="text-sm font-semibold text-muted-foreground">{company.name}</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-balance">Fire Safety Log Book</h1>
          <p className="mt-1 font-medium">{site.name}</p>
          <p className="text-sm text-muted-foreground">{site.address}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Generated {formatDateUK(new Date().toISOString())}
          </p>
          {hasRange && (
            <p className="text-xs font-medium text-muted-foreground">
              Showing records
              {fromDate ? ` from ${formatDateUK(fromDate)}` : ''}
              {toDate ? ` to ${formatDateUK(toDate)}` : ''}
            </p>
          )}
        </header>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {hasRange
              ? 'No log book entries or service reports in the selected date range.'
              : 'No log book entries or service reports yet.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">System</th>
                <th className="py-2 pr-3 font-semibold">Record</th>
                <th className="py-2 pr-3 font-semibold">Call point tested</th>
                <th className="py-2 pr-3 font-semibold">Result</th>
                <th className="py-2 font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDateUK(row.date)}</td>
                  <td className="py-2 pr-3">{row.systemLabel}</td>
                  <td className="py-2 pr-3">{row.record}</td>
                  <td className="py-2 pr-3">{row.callPoint}</td>
                  <td className="py-2 pr-3">{row.result}</td>
                  <td className="py-2">{row.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          Maintained in line with BS 5839-1 and BS 5266-1 fire safety record-keeping guidance.
        </footer>
      </article>
    </div>
  )
}

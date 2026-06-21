'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import type { TaskWithDetails, TaskResult, ReportTemplate } from '@/lib/types/database'

interface ServiceReportProps {
  task: TaskWithDetails
  result: TaskResult | null
  template: ReportTemplate | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pass: { label: 'Pass', color: '#16a34a' },
  fail: { label: 'Fail', color: '#dc2626' },
  partial: { label: 'Partial', color: '#d97706' },
  pending: { label: 'Pending', color: '#6b7280' },
}

export function ServiceReport({ task, result, template }: ServiceReportProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const engineer = task.assigned_engineer
  // Header colour is driven by the service type's own colour, falling back to the template/default
  const headerColor =
    serviceType?.color || template?.header_color || '#0f172a'
  const companyName = template?.company_name || 'Pyrocel Ltd'
  const sections = template?.sections || {}

  const checklist = result?.checklist_results || []

  const stats = useMemo(() => {
    let pass = 0
    let fail = 0
    let other = 0
    for (const item of checklist) {
      if (item.type === 'pass_fail') {
        if (item.passed) pass++
        else fail++
      } else {
        other++
      }
    }
    const assessed = pass + fail
    const passRate = assessed > 0 ? Math.round((pass / assessed) * 100) : 0
    return { pass, fail, other, total: checklist.length, passRate }
  }, [checklist])

  const pieData = useMemo(
    () =>
      [
        { name: 'Pass', key: 'pass', value: stats.pass, color: '#16a34a' },
        { name: 'Fail', key: 'fail', value: stats.fail, color: '#dc2626' },
        { name: 'Other', key: 'other', value: stats.other, color: '#6b7280' },
      ].filter((d) => d.value > 0),
    [stats],
  )

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  const completedDate = task.completed_at || task.scheduled_date
  const status = result?.overall_status || 'pending'
  const statusMeta = STATUS_META[status] || STATUS_META.pending

  return (
    <div className="mx-auto max-w-4xl">
      {/* Action bar */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={site ? `/dashboard/sites/${site.id}` : '/dashboard/reports'}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="report-page rounded-lg border bg-card p-8 print:border-0 print:p-0">
        {/* Header */}
        <header
          className="-mx-8 -mt-8 mb-8 flex items-center justify-between px-8 py-6 text-white print:mx-0 print:mt-0 print:rounded-none"
          style={{ backgroundColor: headerColor }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/pyrocel-logo.png"
                alt="Pyrocel logo"
                crossOrigin="anonymous"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{companyName}</p>
              {sections.company_address && (
                <p className="text-xs text-white/80">{sections.company_address}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">Service Report</p>
            <p className="text-xs text-white/80">{serviceType?.name}</p>
            {result?.reference_number && (
              <p className="mt-1 font-mono text-sm font-bold">{result.reference_number}</p>
            )}
          </div>
        </header>

        {/* Meta */}
        <section className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Meta label="Inspection Reference" value={result?.reference_number} />
          <Meta label="Report Date" value={formatDateUK(completedDate)} />
          <Meta label="Site" value={site?.name} />
          <Meta label="Address" value={site?.address} />
          <Meta label="Engineer" value={engineer?.full_name || engineer?.email} />
          <Meta label="Service" value={serviceType?.name} />
          {sections.standards && <Meta label="Standards" value={sections.standards} />}
        </section>

        {/* Overall status banner */}
        <div
          className="avoid-break mb-8 flex items-center justify-between rounded-lg border-l-4 px-4 py-3"
          style={{
            borderLeftColor: statusMeta.color,
            backgroundColor: `${statusMeta.color}12`,
          }}
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Overall Result
          </span>
          <span
            className="rounded-full px-3 py-1 text-sm font-bold text-white"
            style={{ backgroundColor: statusMeta.color }}
          >
            {statusMeta.label}
          </span>
        </div>

        {/* Summary stats + chart */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 self-start">
            <Stat label="Checks" value={stats.total} />
            <Stat
              label="Passed"
              value={stats.pass}
              color="#16a34a"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <Stat
              label="Failed"
              value={stats.fail}
              color="#dc2626"
              icon={<XCircle className="h-4 w-4" />}
            />
            <Stat
              label="Pass Rate"
              value={`${stats.passRate}%`}
              color={headerColor}
            />
          </div>

          <div className="avoid-break rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold">Results Breakdown</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    isAnimationActive={false}
                    label={(entry) => `${entry.value}`}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No checklist data</p>
            )}
          </div>
        </div>

        {/* Detailed checklist — table may span multiple pages, so the section
            itself must not be break-inside: avoid (that would clip rows). */}
        <section className="mb-8">
          <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
            Checklist Results
          </h2>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-left text-xs">
              <thead style={{ backgroundColor: `${headerColor}15` }}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item, index) => (
                  <tr key={item.item_id || index} className="border-t align-top">
                    <td className="px-3 py-2">{item.label}</td>
                    <td className="px-3 py-2">
                      {item.type === 'pass_fail' ? (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: item.passed ? '#16a34a' : '#dc2626' }}
                        >
                          {item.passed ? 'Pass' : 'Fail'}
                        </span>
                      ) : (
                        <span className="font-medium">{String(item.value)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.notes || '-'}</td>
                  </tr>
                ))}
                {checklist.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      No checklist results recorded for this task.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Engineer notes */}
        {result?.engineer_notes && (
          <section className="mb-8">
            <h2 className="mb-2 text-base font-bold" style={{ color: headerColor }}>
              Engineer Notes
            </h2>
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
              {result.engineer_notes}
            </p>
          </section>
        )}

        {/* Photos */}
        {result?.photos && result.photos.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Photographic Evidence
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {result.photos.map((photo, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  src={photo || '/placeholder.svg'}
                  alt={`Report photo ${index + 1}`}
                  crossOrigin="anonymous"
                  className="h-28 w-full rounded border object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {/* Signature & footer */}
        {template?.include_signature !== false && (
          <section className="avoid-break mb-6 grid grid-cols-2 gap-8 pt-4 text-sm">
            <div>
              <div className="mb-1 h-12 border-b border-dashed" />
              <p className="font-medium">{sections.signatory_name || engineer?.full_name || ''}</p>
              <p className="text-xs text-muted-foreground">{sections.signatory_title || 'Engineer'}</p>
            </div>
            <div>
              <div className="mb-1 h-12 border-b border-dashed" />
              <p className="text-xs text-muted-foreground">Date: {formatDateUK(completedDate)}</p>
            </div>
          </section>
        )}

        {template?.footer_text && (
          <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
            {template.footer_text}
          </footer>
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '-'}</p>
    </div>
  )
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string | number
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="avoid-break rounded-lg border p-3 text-center">
      <div className="flex items-center justify-center gap-1" style={{ color: color || 'inherit' }}>
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

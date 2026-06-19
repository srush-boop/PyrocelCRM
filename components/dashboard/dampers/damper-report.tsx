'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer, Flame, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { RESULT_COLORS, RESULT_LABELS } from '@/lib/dampers'
import { CHECK_ITEMS } from './damper-inspection-card'
import type { TaskWithDetails, DamperInspection, Damper, ReportTemplate, DamperResult } from '@/lib/types/database'

interface DamperReportProps {
  task: TaskWithDetails
  inspections: (DamperInspection & { damper: Damper | null })[]
  template: ReportTemplate | null
}

export function DamperReport({ task, inspections, template }: DamperReportProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const engineer = task.assigned_engineer
  const headerColor = template?.header_color || '#dc2626'
  const companyName = template?.company_name || 'PyrocelCRM Ltd'
  const sections = template?.sections || {}

  const stats = useMemo(() => {
    const counts: Record<DamperResult, number> = { pass: 0, fail: 0, remedial: 0, na: 0 }
    for (const insp of inspections) counts[insp.overall_result]++
    const tested = inspections.length
    const assessed = counts.pass + counts.fail + counts.remedial
    const passRate = assessed > 0 ? Math.round((counts.pass / assessed) * 100) : 0
    return { ...counts, tested, passRate }
  }, [inspections])

  const pieData = useMemo(
    () =>
      (['pass', 'remedial', 'fail', 'na'] as DamperResult[])
        .map((r) => ({ name: RESULT_LABELS[r], key: r, value: stats[r] }))
        .filter((d) => d.value > 0),
    [stats],
  )

  const byFloor = useMemo(() => {
    const map = new Map<string, { floor: string; pass: number; remedial: number; fail: number; na: number }>()
    for (const insp of inspections) {
      const floor = insp.damper?.floor || 'Unspecified'
      const row = map.get(floor) || { floor, pass: 0, remedial: 0, fail: 0, na: 0 }
      row[insp.overall_result]++
      map.set(floor, row)
    }
    return Array.from(map.values())
  }, [inspections])

  const remedials = inspections.filter(
    (i) => i.overall_result === 'fail' || i.overall_result === 'remedial',
  )

  const withPhotos = inspections.filter((i) => (i.photos?.length ?? 0) > 0)
  const photoCount = withPhotos.reduce((sum, i) => sum + (i.photos?.length ?? 0), 0)

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  const completedDate = task.completed_at || task.scheduled_date

  return (
    <div className="mx-auto max-w-4xl">
      {/* Action bar */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={site ? `/dashboard/sites/${site.id}` : '/dashboard/dampers'}>
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
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/20">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{companyName}</p>
              {sections.company_address && (
                <p className="text-xs text-white/80">{sections.company_address}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">Inspection Report</p>
            <p className="text-xs text-white/80">Fire &amp; Smoke Dampers</p>
          </div>
        </header>

        {/* Meta */}
        <section className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Meta label="Site" value={site?.name} />
          <Meta label="Report Date" value={formatDateUK(completedDate)} />
          <Meta label="Address" value={site?.address} />
          <Meta label="Inspected By" value={engineer?.full_name || engineer?.email} />
          <Meta label="Service" value={serviceType?.name} />
          {sections.standards && <Meta label="Standards" value={sections.standards} />}
        </section>

        {/* Executive summary */}
        <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
          Executive Summary
        </h2>
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Tested" value={stats.tested} />
          <Stat label="Pass" value={stats.pass} color="#16a34a" icon={<CheckCircle2 className="h-4 w-4" />} />
          <Stat label="Remedial" value={stats.remedial} color="#d97706" icon={<AlertTriangle className="h-4 w-4" />} />
          <Stat label="Fail" value={stats.fail} color="#dc2626" icon={<XCircle className="h-4 w-4" />} />
          <Stat label="N/A" value={stats.na} color="#6b7280" icon={<MinusCircle className="h-4 w-4" />} />
          <Stat label="Pass Rate" value={`${stats.passRate}%`} color={headerColor} />
        </div>

        {/* Charts */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="avoid-break rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold">Results Breakdown</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    isAnimationActive={false}
                    label={(entry) => `${entry.value}`}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={RESULT_COLORS[d.key as DamperResult]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No data</p>
            )}
          </div>

          <div className="avoid-break rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold">Results by Floor</h3>
            {byFloor.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byFloor}>
                  <XAxis dataKey="floor" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="pass" stackId="a" fill={RESULT_COLORS.pass} isAnimationActive={false} name="Pass" />
                  <Bar dataKey="remedial" stackId="a" fill={RESULT_COLORS.remedial} isAnimationActive={false} name="Remedial" />
                  <Bar dataKey="fail" stackId="a" fill={RESULT_COLORS.fail} isAnimationActive={false} name="Fail" />
                  <Bar dataKey="na" stackId="a" fill={RESULT_COLORS.na} isAnimationActive={false} name="N/A" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>

        {/* Remedial actions */}
        {remedials.length > 0 && (
          <section className="avoid-break mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Remedial Actions Required ({remedials.length})
            </h2>
            <div className="space-y-2">
              {remedials.map((insp) => (
                <div
                  key={insp.id}
                  className="rounded-md border-l-4 bg-muted/40 p-3 text-sm"
                  style={{ borderLeftColor: RESULT_COLORS[insp.overall_result] }}
                >
                  <p className="font-medium">
                    <span className="font-mono">{insp.damper?.urn}</span>
                    {insp.damper?.location ? ` — ${insp.damper.location}` : ''}
                  </p>
                  <p className="text-muted-foreground">
                    {insp.remedial_action || 'Remedial work required (no detail provided).'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Detailed results */}
        <section className="avoid-break mb-8">
          <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
            Detailed Results
          </h2>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-left text-xs">
              <thead style={{ backgroundColor: `${headerColor}15` }}>
                <tr>
                  <th className="px-3 py-2 font-semibold">URN</th>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Floor</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-center font-semibold">Access</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => (
                  <tr key={insp.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{insp.damper?.urn || '-'}</td>
                    <td className="px-3 py-2">{insp.damper?.location || '-'}</td>
                    <td className="px-3 py-2">{insp.damper?.floor || '-'}</td>
                    <td className="px-3 py-2 capitalize">
                      {insp.damper?.damper_type?.replace('_', '/') || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">{insp.accessible ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: RESULT_COLORS[insp.overall_result] }}
                      >
                        {RESULT_LABELS[insp.overall_result]}
                      </span>
                    </td>
                  </tr>
                ))}
                {inspections.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No inspections recorded for this task.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Photographic evidence */}
        {withPhotos.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Photographic Evidence ({photoCount})
            </h2>
            <div className="space-y-5">
              {withPhotos.map((insp) => (
                <div key={insp.id} className="avoid-break">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{insp.damper?.urn || '-'}</span>
                    {insp.damper?.location && (
                      <span className="text-muted-foreground">{insp.damper.location}</span>
                    )}
                    {insp.damper?.floor && (
                      <span className="text-muted-foreground">· {insp.damper.floor}</span>
                    )}
                    <span
                      className="ml-auto inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: RESULT_COLORS[insp.overall_result] }}
                    >
                      {RESULT_LABELS[insp.overall_result]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {insp.photos.map((url, idx) => (
                      <div
                        key={url}
                        className="avoid-break overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url || '/placeholder.svg'}
                          alt={`${insp.damper?.urn || 'Damper'} photo ${idx + 1}`}
                          crossOrigin="anonymous"
                          className="aspect-[4/3] h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
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

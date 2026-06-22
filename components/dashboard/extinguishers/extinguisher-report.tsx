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
import { ArrowLeft, Printer, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  RESULT_COLORS,
  RESULT_LABELS,
  PHOTO_CATEGORIES,
  emptyPhotoCategories,
  EXTINGUISHER_TYPE_LABELS,
} from '@/lib/extinguishers'
import { CHECK_ITEMS } from './extinguisher-inspection-card'
import type {
  TaskWithDetails,
  ExtinguisherInspection,
  Extinguisher,
  ReportTemplate,
  ExtinguisherResult,
} from '@/lib/types/database'

interface ExtinguisherReportProps {
  task: TaskWithDetails
  inspections: (ExtinguisherInspection & { extinguisher: Extinguisher | null })[]
  template: ReportTemplate | null
  referenceNumber?: string | null
}

export function ExtinguisherReport({ task, inspections, template, referenceNumber }: ExtinguisherReportProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const engineer = task.assigned_engineer
  const headerColor = template?.header_color || '#c8102e'
  const companyName = template?.company_name || 'Pyrocel Fire & Security'
  const sections = template?.sections || {}

  const stats = useMemo(() => {
    const counts: Record<ExtinguisherResult, number> = { pass: 0, fail: 0, remedial: 0, na: 0 }
    for (const insp of inspections) counts[insp.overall_result]++
    const tested = inspections.length
    const assessed = counts.pass + counts.fail + counts.remedial
    const passRate = assessed > 0 ? Math.round((counts.pass / assessed) * 100) : 0
    return { ...counts, tested, passRate }
  }, [inspections])

  const pieData = useMemo(
    () =>
      (['pass', 'remedial', 'fail', 'na'] as ExtinguisherResult[])
        .map((r) => ({ name: RESULT_LABELS[r], key: r, value: stats[r] }))
        .filter((d) => d.value > 0),
    [stats],
  )

  const byFloor = useMemo(() => {
    const map = new Map<string, { floor: string; pass: number; remedial: number; fail: number; na: number }>()
    for (const insp of inspections) {
      const floor = insp.extinguisher?.floor || 'Unspecified'
      const row = map.get(floor) || { floor, pass: 0, remedial: 0, fail: 0, na: 0 }
      row[insp.overall_result]++
      map.set(floor, row)
    }
    return Array.from(map.values())
  }, [inspections])

  const remedials = inspections.filter(
    (i) => i.overall_result === 'fail' || i.overall_result === 'remedial',
  )

  const photoGroups = useMemo(() => {
    return inspections
      .map((insp) => {
        const cats = emptyPhotoCategories()
        const stored = insp.photo_categories
        if (stored) {
          for (const key of Object.keys(cats) as (keyof typeof cats)[]) {
            if (Array.isArray(stored[key])) cats[key] = stored[key]
          }
        }
        const categorized = Object.values(cats).flat()
        const legacy = (insp.photos || []).filter((url) => !categorized.includes(url))
        if (legacy.length > 0) cats.additional = [...cats.additional, ...legacy]
        const count = Object.values(cats).reduce((n, arr) => n + arr.length, 0)
        return { insp, cats, count }
      })
      .filter((g) => g.count > 0)
  }, [inspections])

  const photoCount = photoGroups.reduce((sum, g) => sum + g.count, 0)

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
          <Link href={site ? `/dashboard/sites/${site.id}` : '/dashboard/extinguishers'}>
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
            <p className="text-xs text-white/80">Fire Extinguishers</p>
            {referenceNumber && (
              <p className="mt-1 font-mono text-sm font-bold">{referenceNumber}</p>
            )}
          </div>
        </header>

        {/* Meta */}
        <section className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Meta label="Service Reference" value={referenceNumber} />
          <Meta label="Report Date" value={formatDateUK(completedDate)} />
          <Meta label="Site" value={site?.name} />
          <Meta label="Address" value={site?.address} />
          <Meta label="Serviced By" value={engineer?.full_name || engineer?.email} />
          <Meta label="Service" value={serviceType?.name} />
          {sections.standards && <Meta label="Standards" value={sections.standards} />}
        </section>

        {/* Executive summary */}
        <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
          Executive Summary
        </h2>
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Serviced" value={stats.tested} />
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
                      <Cell key={d.key} fill={RESULT_COLORS[d.key as ExtinguisherResult]} />
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
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Remedial Actions Required ({remedials.length})
            </h2>
            <div className="space-y-2">
              {remedials.map((insp) => (
                <div
                  key={insp.id}
                  className="avoid-break rounded-md border-l-4 bg-muted/40 p-3 text-sm"
                  style={{ borderLeftColor: RESULT_COLORS[insp.overall_result] }}
                >
                  <p className="font-medium">
                    <span className="font-mono">{insp.extinguisher?.urn}</span>
                    {insp.extinguisher?.location ? ` — ${insp.extinguisher.location}` : ''}
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
        <section className="mb-8">
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
                    <td className="px-3 py-2 font-mono">{insp.extinguisher?.urn || '-'}</td>
                    <td className="px-3 py-2">{insp.extinguisher?.location || '-'}</td>
                    <td className="px-3 py-2">{insp.extinguisher?.floor || '-'}</td>
                    <td className="px-3 py-2">
                      {insp.extinguisher
                        ? EXTINGUISHER_TYPE_LABELS[insp.extinguisher.extinguisher_type]
                        : '-'}
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
                      No services recorded for this task.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-extinguisher service checklist */}
        {inspections.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Service Checklist
            </h2>
            <div className="space-y-4">
              {inspections.map((insp) => (
                <div key={insp.id} className="avoid-break rounded-md border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{insp.extinguisher?.urn || '-'}</span>
                    {insp.extinguisher?.location && (
                      <span className="text-muted-foreground">{insp.extinguisher.location}</span>
                    )}
                    {insp.extinguisher?.floor && (
                      <span className="text-muted-foreground">· {insp.extinguisher.floor}</span>
                    )}
                    <span
                      className="ml-auto inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: RESULT_COLORS[insp.overall_result] }}
                    >
                      {RESULT_LABELS[insp.overall_result]}
                    </span>
                  </div>

                  {insp.accessible ? (
                    <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {CHECK_ITEMS.map((item) => (
                        <CheckRow
                          key={item.key}
                          label={item.label}
                          value={insp[item.key as keyof ExtinguisherInspection] as boolean | null}
                        />
                      ))}
                      {insp.condition && (
                        <div className="flex items-center justify-between gap-3 border-t py-1 text-xs sm:col-span-2">
                          <span className="text-muted-foreground">Overall condition</span>
                          <span className="font-medium capitalize">{insp.condition}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not accessible for service.
                      {insp.access_notes ? ` ${insp.access_notes}` : ''}
                    </p>
                  )}

                  {(insp.overall_result === 'fail' || insp.overall_result === 'remedial') &&
                    insp.remedial_action && (
                      <p className="mt-2 border-t pt-2 text-xs">
                        <span className="font-semibold">Remedial: </span>
                        {insp.remedial_action}
                      </p>
                    )}
                  {insp.comments && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Notes: </span>
                      {insp.comments}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Photographic evidence */}
        {photoGroups.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold" style={{ color: headerColor }}>
              Photographic Evidence ({photoCount})
            </h2>
            <div className="space-y-6">
              {photoGroups.map(({ insp, cats }) => (
                <div key={insp.id} className="avoid-break rounded-md border p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{insp.extinguisher?.urn || '-'}</span>
                    {insp.extinguisher?.location && (
                      <span className="text-muted-foreground">{insp.extinguisher.location}</span>
                    )}
                    {insp.extinguisher?.floor && (
                      <span className="text-muted-foreground">· {insp.extinguisher.floor}</span>
                    )}
                    <span
                      className="ml-auto inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: RESULT_COLORS[insp.overall_result] }}
                    >
                      {RESULT_LABELS[insp.overall_result]}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {PHOTO_CATEGORIES.map((cat) => {
                      const urls = cats[cat.key]
                      if (!urls || urls.length === 0) return null
                      return (
                        <div key={cat.key} className="avoid-break">
                          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                            {cat.label}
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {urls.map((url, idx) => (
                              <div
                                key={url}
                                className="avoid-break overflow-hidden rounded-md border bg-muted"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url || '/placeholder.svg'}
                                  alt={`${insp.extinguisher?.urn || 'Extinguisher'} — ${cat.label} ${idx + 1}`}
                                  crossOrigin="anonymous"
                                  className="aspect-[4/3] h-full w-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
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

function CheckRow({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {value === true ? (
        <span className="flex items-center gap-1 font-medium text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Pass
        </span>
      ) : value === false ? (
        <span className="flex items-center gap-1 font-medium text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          Fail
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground">
          <MinusCircle className="h-3.5 w-3.5" />
          N/A
        </span>
      )}
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

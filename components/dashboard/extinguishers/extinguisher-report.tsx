'use client'

import { useMemo } from 'react'
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
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react'
import { getServiceIcon } from '@/lib/service-icons'
import { PYROCEL_RED } from '@/lib/service-colors'
import {
  ReportActionBar,
  ReportHeader,
  ReportMeta,
  ReportMetaGrid,
  ReportStatusRibbon,
  StatCard,
  SectionHeading,
  ReportPanel,
  SignatureBlock,
  ReportFooter,
  REPORT_COLORS,
} from '@/components/dashboard/reports/report-shell'
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
  CompanyInfo,
} from '@/lib/types/database'

interface ExtinguisherReportProps {
  task: TaskWithDetails
  inspections: (ExtinguisherInspection & { extinguisher: Extinguisher | null })[]
  template: ReportTemplate | null
  referenceNumber?: string | null
  companyInfo?: CompanyInfo | null
}

export function ExtinguisherReport({ task, inspections, template, referenceNumber, companyInfo }: ExtinguisherReportProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const engineer = task.assigned_engineer
  // Prefer the live engineer, else the name snapshotted at completion (survives
  // the engineer's account being deleted).
  const engineerName = engineer?.full_name || engineer?.email || task.completed_engineer_name || ''
  const headerColor = serviceType?.color || template?.header_color || PYROCEL_RED
  const companyName = companyInfo?.name || template?.company_name || 'Pyrocel Ltd'
  const sections = template?.sections || {}
  const companyAddress = companyInfo?.address || sections.company_address || null
  const companyPhone = companyInfo?.phone || sections.company_phone || null
  const companyEmail = companyInfo?.email || sections.company_email || null
  const companyWebsite = companyInfo?.website || null
  const logoUrl = companyInfo?.logo_url || template?.company_logo_url || null
  const standards = sections.standards || null
  const ServiceIcon = getServiceIcon(serviceType?.name)

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

  const completedDate = task.completed_at || task.scheduled_date

  const overall =
    stats.fail > 0
      ? { label: 'Action Required', color: REPORT_COLORS.fail }
      : stats.remedial > 0
        ? { label: 'Remedial', color: REPORT_COLORS.remedial }
        : { label: 'Compliant', color: REPORT_COLORS.pass }

  return (
    <div className="mx-auto max-w-4xl">
      <ReportActionBar backHref={site ? `/dashboard/sites/${site.id}` : '/dashboard/extinguishers'} />

      <div className="report-page rounded-lg border bg-card p-8 print:border-0 print:p-0">
        <ReportHeader
          headerColor={headerColor}
          companyName={companyName}
          logoUrl={logoUrl}
          address={companyAddress}
          phone={companyPhone}
          email={companyEmail}
          website={companyWebsite}
          docType="Service Report"
          docSubtitle={serviceType?.name || 'Fire Extinguishers'}
          referenceNumber={referenceNumber}
          reportDate={completedDate}
          ServiceIcon={ServiceIcon}
        />

        <ReportMetaGrid>
          <ReportMeta label="Service Reference" value={referenceNumber} />
          <ReportMeta label="Site" value={site?.name} />
          <ReportMeta label="Serviced By" value={engineerName} />
          <ReportMeta label="Address" value={site?.address} />
          <ReportMeta label="Service" value={serviceType?.name} />
          <ReportMeta label="Units Serviced" value={String(stats.tested)} />
        </ReportMetaGrid>

        <ReportStatusRibbon
          statusLabel={overall.label}
          color={overall.color}
          note={`${stats.tested} extinguishers serviced · ${stats.passRate}% pass rate`}
        />

        {/* Executive summary */}
        <SectionHeading index={1} color={headerColor}>
          Executive Summary
        </SectionHeading>
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatCard label="Serviced" value={stats.tested} color={REPORT_COLORS.neutral} />
          <StatCard label="Pass" value={stats.pass} color={REPORT_COLORS.pass} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Remedial" value={stats.remedial} color={REPORT_COLORS.remedial} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Fail" value={stats.fail} color={REPORT_COLORS.fail} icon={<XCircle className="h-4 w-4" />} />
          <StatCard label="N/A" value={stats.na} color={REPORT_COLORS.na} icon={<MinusCircle className="h-4 w-4" />} />
          <StatCard label="Pass Rate" value={`${stats.passRate}%`} color={headerColor} />
        </div>

        {/* Charts */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <ReportPanel title="Results Breakdown">
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
          </ReportPanel>

          <ReportPanel title="Results by Floor">
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
          </ReportPanel>
        </div>

        {/* Remedial actions */}
        {remedials.length > 0 && (
          <section className="mb-8">
            <SectionHeading index={2} color={headerColor}>
              Remedial Actions Required ({remedials.length})
            </SectionHeading>
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
          <SectionHeading index={3} color={headerColor}>
            Detailed Results
          </SectionHeading>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-left text-xs">
              <thead style={{ backgroundColor: `${headerColor}15` }}>
                <tr>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">URN</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Location</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Floor</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-center font-semibold uppercase tracking-wide">Access</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Result</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => (
                  <tr key={insp.id} className="border-t odd:bg-muted/30">
                    <td className="px-3 py-2 font-mono">{insp.extinguisher?.urn || '—'}</td>
                    <td className="px-3 py-2">{insp.extinguisher?.location || '—'}</td>
                    <td className="px-3 py-2">{insp.extinguisher?.floor || '—'}</td>
                    <td className="px-3 py-2">
                      {insp.extinguisher
                        ? EXTINGUISHER_TYPE_LABELS[insp.extinguisher.extinguisher_type]
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">{insp.accessible ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
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
            <SectionHeading index={4} color={headerColor}>
              Service Checklist
            </SectionHeading>
            <div className="space-y-4">
              {inspections.map((insp) => (
                <div key={insp.id} className="avoid-break rounded-md border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{insp.extinguisher?.urn || '—'}</span>
                    {insp.extinguisher?.location && (
                      <span className="text-muted-foreground">{insp.extinguisher.location}</span>
                    )}
                    {insp.extinguisher?.floor && (
                      <span className="text-muted-foreground">· {insp.extinguisher.floor}</span>
                    )}
                    <span
                      className="ml-auto inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
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
            <SectionHeading index={5} color={headerColor}>
              Photographic Evidence ({photoCount})
            </SectionHeading>
            <div className="space-y-6">
              {photoGroups.map(({ insp, cats }) => (
                <div key={insp.id} className="avoid-break rounded-md border p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{insp.extinguisher?.urn || '—'}</span>
                    {insp.extinguisher?.location && (
                      <span className="text-muted-foreground">{insp.extinguisher.location}</span>
                    )}
                    {insp.extinguisher?.floor && (
                      <span className="text-muted-foreground">· {insp.extinguisher.floor}</span>
                    )}
                    <span
                      className="ml-auto inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
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
                                className="avoid-break relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url || '/placeholder.svg'}
                                  alt={`${insp.extinguisher?.urn || 'Extinguisher'} — ${cat.label} ${idx + 1}`}
                                  crossOrigin="anonymous"
                                  className="absolute inset-0 h-full w-full object-cover"
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

        {/* Signature */}
        {template?.include_signature !== false && (
          <SignatureBlock
            signatureUrl={engineer?.signature_url}
            signatoryName={sections.signatory_name || engineerName}
            signatoryTitle={
              engineer?.role_ref?.name ||
              engineer?.job_title ||
              sections.signatory_title ||
              'Engineer'
            }
            date={completedDate}
          />
        )}

        <ReportFooter
          headerColor={headerColor}
          companyInfo={companyInfo}
          template={template}
          standards={standards}
        />
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

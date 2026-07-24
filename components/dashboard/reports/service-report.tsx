'use client'

import { Fragment, useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, ListChecks } from 'lucide-react'
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
  getStatusMeta,
} from './report-shell'
import type {
  TaskWithDetails,
  TaskResult,
  ChecklistResult,
  ReportTemplate,
  CompanyInfo,
} from '@/lib/types/database'

interface ServiceReportProps {
  task: TaskWithDetails
  result: TaskResult | null
  template: ReportTemplate | null
  companyInfo?: CompanyInfo | null
}

/**
 * Some services (e.g. emergency lighting) record their outcome as numeric
 * summary counts — "Passed: 1", "Failed: 0", "Fittings tested: 1" — rather than
 * individual pass/fail checklist rows. The previous report only ever counted
 * `pass_fail` items, so those reports always showed 0 passed / 0 failed / 0%.
 *
 * This helper detects both shapes and returns a normalised summary so the KPIs
 * and chart reflect the real result regardless of how it was captured.
 */
interface ChecklistStats {
  mode: 'counts' | 'passfail'
  registerTotal: number
  tested: number
  pass: number
  fail: number
  remedial: number
  advisory: number
  na: number
  other: number
  passRate: number
}

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase()
}

function computeStats(input: ChecklistResult[]): ChecklistStats {
  // Conditional follow-up rows are supplementary detail shown under their parent;
  // they must not skew the pass/fail tallies or count summaries.
  const checklist = input.filter((item) => !item.parent_item_id)
  // Index numeric items by both item_id and normalised label so we can resolve
  // count summaries no matter how the executor keyed them.
  const numById: Record<string, number> = {}
  const numByLabel: Record<string, number> = {}
  for (const item of checklist) {
    if (item.type === 'number') {
      const n = typeof item.value === 'number' ? item.value : Number(item.value) || 0
      numById[item.item_id] = n
      numByLabel[normalizeLabel(item.label)] = n
    }
  }
  const getNum = (id: string, ...labels: string[]): number | undefined => {
    if (id in numById) return numById[id]
    for (const l of labels) if (l in numByLabel) return numByLabel[l]
    return undefined
  }

  const passedN = getNum('passed', 'passed', 'pass')
  const failedN = getNum('failed', 'failed', 'fail')
  const remedialN = getNum('remedial', 'remedial')
  const isCountMode =
    passedN !== undefined || failedN !== undefined || remedialN !== undefined

  if (isCountMode) {
    const pass = passedN ?? 0
    const fail = failedN ?? 0
    const remedial = remedialN ?? 0
    const na = getNum('na', 'n/a', 'not applicable') ?? 0
    const tested =
      getNum('tested', 'fittings tested', 'units tested', 'tested') ??
      pass + fail + remedial + na
    const registerTotal =
      getNum('total', 'fittings on register', 'on register', 'total', 'register') ?? tested
    const assessed = pass + fail + remedial
    const passRate = assessed > 0 ? Math.round((pass / assessed) * 100) : 0
    return {
      mode: 'counts',
      registerTotal,
      tested,
      pass,
      fail,
      remedial,
      advisory: 0,
      na,
      other: 0,
      passRate,
    }
  }

  // Pass/fail mode: tally individual checklist rows.
  let pass = 0
  let fail = 0
  let advisory = 0
  let na = 0
  let other = 0
  for (const item of checklist) {
    if (item.na) {
      // N/A items (any type) carry no outcome and are tallied separately.
      na++
    } else if (item.type === 'pass_fail') {
      if (item.advisory) advisory++
      else if (item.passed) pass++
      else fail++
    } else {
      other++
    }
  }
  const assessed = pass + fail
  const passRate = assessed > 0 ? Math.round((pass / assessed) * 100) : 0
  return {
    mode: 'passfail',
    registerTotal: checklist.length,
    tested: assessed,
    pass,
    fail,
    remedial: 0,
    advisory,
    na,
    other,
    passRate,
  }
}

export function ServiceReport({ task, result, template, companyInfo }: ServiceReportProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const engineer = task.assigned_engineer
  // Attribution: prefer the live assigned engineer, else the name snapshotted
  // when the call was completed (survives the engineer's account being deleted).
  const engineerName = engineer?.full_name || engineer?.email || task.completed_engineer_name || ''
  // Header colour is driven by the service type's own colour, falling back to
  // the template/brand default.
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

  const checklist = result?.checklist_results || []
  // Top-level rows only — conditional follow-ups are rendered beneath their parent.
  const parentChecklist = useMemo(
    () => checklist.filter((r) => !r.parent_item_id),
    [checklist],
  )
  const stats = useMemo(() => computeStats(checklist), [checklist])

  const pieData = useMemo(() => {
    const entries =
      stats.mode === 'counts'
        ? [
            { name: 'Pass', key: 'pass', value: stats.pass, color: REPORT_COLORS.pass },
            { name: 'Remedial', key: 'remedial', value: stats.remedial, color: REPORT_COLORS.remedial },
            { name: 'Fail', key: 'fail', value: stats.fail, color: REPORT_COLORS.fail },
            { name: 'N/A', key: 'na', value: stats.na, color: REPORT_COLORS.na },
          ]
        : [
            { name: 'Pass', key: 'pass', value: stats.pass, color: REPORT_COLORS.pass },
            { name: 'Advisory', key: 'advisory', value: stats.advisory, color: REPORT_COLORS.advisory },
            { name: 'Fail', key: 'fail', value: stats.fail, color: REPORT_COLORS.fail },
            { name: 'Other', key: 'other', value: stats.other, color: REPORT_COLORS.other },
          ]
    return entries.filter((d) => d.value > 0)
  }, [stats])

  const completedDate = task.completed_at || task.scheduled_date
  const status = result?.overall_status || 'pending'
  const statusMeta = getStatusMeta(status)

  const docSubtitle = [serviceType?.name, task.visit_type?.name].filter(Boolean).join(' — ')

  return (
    <div className="mx-auto max-w-4xl">
      <ReportActionBar backHref={site ? `/dashboard/sites/${site.id}` : '/dashboard/reports'} />

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
          docSubtitle={docSubtitle || serviceType?.name}
          referenceNumber={result?.reference_number}
          reportDate={completedDate}
          ServiceIcon={ServiceIcon}
        />

        <ReportMetaGrid>
          <ReportMeta label="Inspection Reference" value={result?.reference_number} />
          <ReportMeta label="Site" value={site?.name} />
          <ReportMeta label="Engineer" value={engineerName} />
          <ReportMeta label="Address" value={site?.address} />
          <ReportMeta label="Service" value={serviceType?.name} />
          {task.visit_type?.name && <ReportMeta label="Visit" value={task.visit_type.name} />}
        </ReportMetaGrid>

        <ReportStatusRibbon statusLabel={statusMeta.label} color={statusMeta.color} />

        {/* Summary KPIs + chart */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 self-start">
            {stats.mode === 'counts' ? (
              <>
                <StatCard label="On Register" value={stats.registerTotal} color={headerColor} icon={<ListChecks className="h-4 w-4" />} />
                <StatCard label="Tested" value={stats.tested} color={REPORT_COLORS.neutral} />
                <StatCard label="Passed" value={stats.pass} color={REPORT_COLORS.pass} icon={<CheckCircle2 className="h-4 w-4" />} />
                <StatCard label="Remedial" value={stats.remedial} color={REPORT_COLORS.remedial} icon={<AlertTriangle className="h-4 w-4" />} />
                <StatCard label="Failed" value={stats.fail} color={REPORT_COLORS.fail} icon={<XCircle className="h-4 w-4" />} />
                <StatCard label="Pass Rate" value={`${stats.passRate}%`} color={headerColor} />
              </>
            ) : (
              <>
                <StatCard label="Checks" value={stats.registerTotal} color={headerColor} icon={<ListChecks className="h-4 w-4" />} />
                <StatCard label="Passed" value={stats.pass} color={REPORT_COLORS.pass} icon={<CheckCircle2 className="h-4 w-4" />} />
                <StatCard label="Failed" value={stats.fail} color={REPORT_COLORS.fail} icon={<XCircle className="h-4 w-4" />} />
                {stats.advisory > 0 ? (
                  <StatCard label="Advisory" value={stats.advisory} color={REPORT_COLORS.advisory} icon={<AlertTriangle className="h-4 w-4" />} />
                ) : (
                  <StatCard label="Other" value={stats.other} color={REPORT_COLORS.na} icon={<MinusCircle className="h-4 w-4" />} />
                )}
                <StatCard label="Pass Rate" value={`${stats.passRate}%`} color={headerColor} />
              </>
            )}
          </div>

          <ReportPanel title="Results Breakdown">
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
          </ReportPanel>
        </div>

        {/* Detailed checklist */}
        <section className="mb-8">
          <SectionHeading index={1} color={headerColor}>
            Checklist Results
          </SectionHeading>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-left text-xs">
              <thead style={{ backgroundColor: `${headerColor}15` }}>
                <tr>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Item</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Result</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody>
                {parentChecklist.map((item, index) => {
                  const prev = index > 0 ? parentChecklist[index - 1] : null
                  const showPanelHeader =
                    !!item.panel_name && item.panel_id !== (prev?.panel_id ?? null)
                  // Follow-up rows spawned by this item's active conditions, plus
                  // any per-item photos, rendered as indented sub-rows.
                  const followUps = checklist.filter(
                    (r) => r.parent_item_id === item.item_id,
                  )
                  const photos = item.photos || []
                  return (
                    <Fragment key={item.item_id || index}>
                      {showPanelHeader && (
                        <tr style={{ backgroundColor: `${headerColor}0d` }}>
                          <td colSpan={3} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide">
                            {item.panel_name}
                            {item.panel_level ? ` — ${item.panel_level}` : ''}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t align-top odd:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{item.label}</td>
                        <td className="px-3 py-2">
                          {item.na ? (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
                              style={{ backgroundColor: REPORT_COLORS.na }}
                            >
                              N/A
                            </span>
                          ) : item.type === 'pass_fail' ? (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
                              style={{
                                backgroundColor: item.advisory
                                  ? REPORT_COLORS.advisory
                                  : item.passed
                                    ? REPORT_COLORS.pass
                                    : REPORT_COLORS.fail,
                              }}
                            >
                              {item.advisory ? 'Advisory' : item.passed ? 'Pass' : 'Fail'}
                            </span>
                          ) : (
                            <span className="font-semibold tabular-nums">{String(item.value)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.notes || '—'}</td>
                      </tr>
                      {followUps.map((child) => (
                        <tr
                          key={child.item_id}
                          className="border-t border-dashed align-top bg-amber-50/50"
                        >
                          <td className="px-3 py-2 pl-6 text-muted-foreground">
                            <span className="mr-1 text-amber-600">↳</span>
                            {child.label}
                          </td>
                          <td className="px-3 py-2">
                            {child.type === 'pass_fail' ? (
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
                                style={{
                                  backgroundColor: child.passed
                                    ? REPORT_COLORS.pass
                                    : REPORT_COLORS.fail,
                                }}
                              >
                                {child.passed ? 'Pass' : 'Fail'}
                              </span>
                            ) : child.type === 'checkbox' ? (
                              <span className="font-semibold">{child.value ? 'Yes' : 'No'}</span>
                            ) : (
                              <span className="font-semibold tabular-nums">
                                {String(child.value ?? '—')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{child.notes || '—'}</td>
                        </tr>
                      ))}
                      {photos.length > 0 && (
                        <tr className="border-t border-dashed align-top">
                          <td colSpan={3} className="px-3 py-2 pl-6">
                            <div className="flex flex-wrap gap-2">
                              {photos.map((p) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={p.id}
                                  src={p.url || '/placeholder.svg'}
                                  alt={p.name}
                                  className="h-20 w-20 rounded border object-cover"
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
            <SectionHeading index={2} color={headerColor}>
              Engineer Notes
            </SectionHeading>
            <p className="avoid-break whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
              {result.engineer_notes}
            </p>
          </section>
        )}

        {/* Photos */}
        {result?.photos && result.photos.length > 0 && (
          <section className="mb-8">
            <SectionHeading index={3} color={headerColor}>
              Photographic Evidence
            </SectionHeading>
            <div className="grid grid-cols-3 gap-3">
              {result.photos.map((photo, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  src={photo || '/placeholder.svg'}
                  alt={`Report photo ${index + 1}`}
                  crossOrigin="anonymous"
                  className="avoid-break h-28 w-full rounded border object-cover"
                />
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

        {/* Client sign-off — only present on non-recurring calls where the
            on-site representative signed to confirm the work. */}
        {result?.client_signature && (
          <SignatureBlock
            signatureUrl={result.client_signature}
            signatoryName={result.client_signature_name || 'Client'}
            signatoryTitle="Client / on-site representative"
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

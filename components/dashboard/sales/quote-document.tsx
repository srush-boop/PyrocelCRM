'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft,
  Printer,
  Flame,
  Cctv,
  KeyRound,
  ShieldAlert,
  Lightbulb,
  Fan,
  RadioTower,
  Clock,
  Wrench,
  PlugZap,
  Check,
  Plus,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  formatPence,
  quoteTypeLabel,
  workTypeLabel,
  designedByLabel,
  computeQuoteTotals,
  QUOTE_STATUS_META,
} from '@/lib/sales'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSystem,
  QuoteRequirement,
} from '@/lib/types/database'
import { REQUIREMENT_STATUS_META } from '@/lib/sales-requirements'
import {
  getOmittedElementKeys,
  isHiddenConditionalKey,
} from '@/lib/sales/omitted-sections'
import {
  buildEquipmentSpecSections,
  type SpecCatalogueItem,
} from '@/lib/sales/equipment-spec'
import { MaintenanceAgreementDocument } from '@/components/dashboard/sales/maintenance-agreement-document'
import { resolveMaintenanceAgreement, type MaintenanceAgreementCopy } from '@/lib/maintenance'

interface QuoteDocumentProps {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  company: CompanyInfo | null
  // Client-request compliance matrix. Only rendered when the quote opts in via
  // show_requirements_matrix and at least one requirement is present.
  requirements?: QuoteRequirement[]
  // Catalogue rows backing the quote's products, used to append a full
  // equipment specification when the quote opts in via show_equipment_spec.
  catalogue?: SpecCatalogueItem[]
  backHref?: string
  // Interactive optional-extras selection (public shared quote only). When
  // `onToggleOption` is provided, the optional-extras rows become real
  // checkboxes and the totals recompute live from `optionSelection` instead of
  // the persisted `client_selected` flags.
  optionSelection?: Set<string>
  onToggleOption?: (line: QuoteLineItem) => void
}

// Map a service line to a representative icon by keyword so the document reads
// visually rather than as a wall of text. Falls back to a wrench (maintenance).
function serviceIcon(text: string): ComponentType<{ className?: string }> {
  const t = text.toLowerCase()
  if (t.includes('fire')) return Flame
  if (t.includes('cctv') || t.includes('camera') || t.includes('television')) return Cctv
  if (t.includes('access') || t.includes('door') || t.includes('entry')) return KeyRound
  if (t.includes('intruder') || t.includes('burglar') || t.includes('security')) return ShieldAlert
  if (t.includes('emergency') || t.includes('light') || t.includes('luminaire')) return Lightbulb
  if (t.includes('damper') || t.includes('smoke') || t.includes('ventilation')) return Fan
  if (t.includes('monitor') || t.includes('signall') || t.includes('arc')) return RadioTower
  if (t.includes('out of hours') || t.includes('call-out') || t.includes('call out')) return Clock
  if (t.includes('induction') || t.includes('afils') || t.includes('electrical')) return PlugZap
  return Wrench
}

const HEADER_COLOR = '#0f172a'

// Two-digit section label (01, 02, ...) for the specification-style numbering.
function sectionLabel(n: number): string {
  return n.toString().padStart(2, '0')
}

// A numbered section heading used throughout the document to give it the look
// of a formal technical specification (numbered sections with a rule).
function SectionHeading({
  number,
  title,
  meta,
}: {
  number: number
  title: string
  meta?: string
}) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b-2 border-foreground/80 pb-2">
      <span className="font-mono text-sm font-semibold tabular-nums text-primary">
        {sectionLabel(number)}
      </span>
      <h2 className="flex-1 text-base font-bold uppercase tracking-wide text-balance">{title}</h2>
      {meta ? (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </div>
  )
}

// A small labelled sub-heading used inside sections (e.g. "Specification").
function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </p>
  )
}

// Humanise a conditional field key (e.g. "cable_type" -> "Cable type").
function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// A table element stores its rows as a JSON array string. Detect & parse it so
// it can be rendered as a table rather than raw JSON.
function parseTableRows(value: string | number | boolean): Record<string, string>[] | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every((r) => r && typeof r === 'object')) {
      return parsed as Record<string, string>[]
    }
  } catch {
    return null
  }
  return null
}

// Whether a conditional answer should appear on the quote at all. "N/A" answers
// and blank values are omitted entirely (JotForm-style "if N/A, don't add").
function isOmittedValue(value: string | number | boolean): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === '' || v === 'na' || v === 'n/a'
  }
  return false
}

function renderConditionalValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return String(value)
}

export function QuoteDocument({
  quote,
  systems,
  lines,
  company,
  requirements = [],
  catalogue = [],
  backHref,
  optionSelection,
  onToggleOption,
}: QuoteDocumentProps) {
  // Interactive mode: the client can tick/untick optional extras right in the
  // document and see totals move. Otherwise we render the persisted selection.
  const interactive = typeof onToggleOption === 'function'
  const isOptionSelected = (line: QuoteLineItem) =>
    interactive ? Boolean(optionSelection?.has(line.id)) : line.client_selected === true

  // Recompute headline totals live from the current selection when interactive
  // so the client immediately sees the effect of their choices.
  const liveTotals = computeQuoteTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unit_price_pence: l.unit_price_pence,
      is_optional: l.is_optional,
      client_selected: l.is_optional ? isOptionSelected(l) : null,
    })),
    { vatRate: quote.vat_rate ?? 0, discountPence: quote.discount_pence ?? 0 },
  )
  const shownSubtotal = interactive ? liveTotals.subtotalPence : quote.subtotal_pence
  const shownVat = interactive ? liveTotals.vatPence : quote.vat_pence
  const shownTotal = interactive ? liveTotals.totalPence : quote.total_pence

  const showRequirements = quote.show_requirements_matrix && requirements.length > 0
  const equipmentSpecSections = quote.show_equipment_spec
    ? buildEquipmentSpecSections(systems, lines, catalogue)
    : []
  const sortedRequirements = requirements.slice().sort((a, b) => a.position - b.position)
  const sortedSystems = systems.slice().sort((a, b) => a.position - b.position)

  // Section numbering: systems occupy 1..N, then the optional matrix / equipment
  // spec sections follow, so the whole document reads like a numbered spec.
  let nextSection = sortedSystems.length
  const requirementsSectionNo = showRequirements ? ++nextSection : 0
  const equipmentSectionNo = equipmentSpecSections.length > 0 ? ++nextSection : 0
  const companyName = company?.name || 'Pyrocel Ltd'
  const recipientName = quote.client?.name || quote.prospect_name || 'Prospective client'
  const recipientContact = quote.client?.contact_name || quote.prospect_contact
  const recipientEmail = quote.client?.contact_email || quote.prospect_email
  const recipientPhone = quote.client?.contact_phone || quote.prospect_phone
  const recipientAddress = quote.site?.address || quote.client?.address || quote.prospect_address

  // window.print() is silently blocked inside an iframe (the v0 preview, or an
  // in-app email/webview viewer). In that case, pop the page out to a top-level
  // browser tab where the visitor can print/save as PDF; otherwise print directly.
  function handlePrint() {
    const inIframe = typeof window !== 'undefined' && window.self !== window.top
    if (inIframe) {
      window.open(window.location.href, '_blank', 'noopener,noreferrer')
      return
    }
    window.print()
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Action bar (hidden in print) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        {backHref ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="report-page rounded-lg border bg-card p-8 text-card-foreground shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-10">
        {/* Masthead */}
        <header
          className="-mx-8 -mt-8 mb-0 flex items-start justify-between gap-4 px-8 py-6 text-white print:mx-0 print:mt-0 print:rounded-none sm:-mx-10 sm:px-10"
          style={{ backgroundColor: HEADER_COLOR }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={company?.logo_url || '/images/pyrocel-logo.png'}
                alt={`${companyName} logo`}
                crossOrigin="anonymous"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xl font-extrabold uppercase leading-tight tracking-wide">{companyName}</p>
              {company?.address && <p className="text-xs text-white/70">{company.address}</p>}
              <p className="text-xs text-white/70">
                {[company?.phone, company?.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/90">Quotation</p>
            <p className="font-mono text-lg font-bold leading-tight">
              {quote.reference ?? quote.quote_number ?? 'Draft'}
            </p>
            {quote.revision > 0 && <p className="text-xs text-white/70">Revision {quote.revision}</p>}
          </div>
        </header>

        {/* Document title band */}
        <section className="-mx-8 mb-8 border-b bg-muted/40 px-8 py-6 print:mx-0 sm:-mx-10 sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {quoteTypeLabel(quote.quote_type)} — Technical Specification &amp; Quotation
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-balance sm:text-3xl">
            {quote.title}
          </h1>
          {quote.summary && (
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {quote.summary}
            </p>
          )}
        </section>

        {/* Meta grid: prepared-for / project details */}
        <section className="mb-10 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <FieldLabel>Prepared for</FieldLabel>
            <p className="font-semibold">{recipientName}</p>
            {recipientContact && <p className="text-sm">{recipientContact}</p>}
            {recipientAddress && <p className="text-sm text-muted-foreground">{recipientAddress}</p>}
            <p className="text-sm text-muted-foreground">
              {[recipientEmail, recipientPhone].filter(Boolean).join(' · ')}
            </p>
            {quote.site?.name && (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Site:</span> {quote.site.name}
              </p>
            )}
          </div>
          <div className="bg-card p-4">
            <FieldLabel>Document details</FieldLabel>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Date issued</dt>
                <dd className="font-medium">{formatDateUK(quote.created_at)}</dd>
              </div>
              {quote.preparer?.full_name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Prepared by</dt>
                  <dd className="font-medium">{quote.preparer.full_name}</dd>
                </div>
              )}
              {quote.valid_until && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Valid until</dt>
                  <dd className="font-medium">{formatDateUK(quote.valid_until)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{QUOTE_STATUS_META[quote.status].label}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Issuing branch */}
        {quote.branch && (
          <section className="mb-10 rounded-md border bg-muted/30 p-4">
            <FieldLabel>Issued by</FieldLabel>
            <p className="font-semibold">{quote.branch.name}</p>
            {quote.branch.address && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{quote.branch.address}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {[quote.branch.phone, quote.branch.email].filter(Boolean).join(' · ')}
            </p>
          </section>
        )}

        {/* Systems + specification + line items. Sections are numbered like a
            formal technical specification. */}
        <div className="space-y-10">
          {sortedSystems
            .map((system, systemIndex) => {
              const systemLines = lines
                .filter((l) => l.system_id === system.id)
                .sort((a, b) => a.position - b.position)
              // Products and non-product services are shown as separate groups.
              // Client-selectable options are pulled into their own group and
              // only count toward the total once the client has selected them.
              const coreLines = systemLines.filter((l) => !l.is_optional)
              const productLines = coreLines.filter((l) => !l.is_service)
              const serviceLines = coreLines.filter((l) => l.is_service)
              const optionalLines = systemLines.filter((l) => l.is_optional)
              const systemTotal = systemLines.reduce(
                (sum, l) => sum + (l.is_optional && !isOptionSelected(l) ? 0 : l.line_total_pence),
                0,
              )
              // Keys belonging to sections the user marked "not required", plus
              // the reserved bookkeeping keys, are excluded from the quote.
              const omittedKeys = new Set(getOmittedElementKeys(system.conditional_values))
              const conditional = Object.entries(system.conditional_values ?? {}).filter(
                ([key, value]) =>
                  !isHiddenConditionalKey(key, omittedKeys) && !isOmittedValue(value),
              )
              return (
                <section key={system.id} className="break-inside-avoid">
                  <SectionHeading
                    number={systemIndex + 1}
                    title={
                      system.system_code
                        ? `${system.system_name}  ·  ${system.system_code}`
                        : system.system_name
                    }
                    meta={workTypeLabel(system.work_type)}
                  />

                  {system.specification && (
                    <div className="mb-4">
                      <FieldLabel>Specification</FieldLabel>
                      <p className="whitespace-pre-line text-sm leading-relaxed">{system.specification}</p>
                    </div>
                  )}

                  {/* Design & survey */}
                  {quote.show_design_overview &&
                    (system.design_overview ||
                      system.design_category_id ||
                      system.drawing_reference ||
                      system.designed_by ||
                      system.survey_carried_out) && (
                    <div className="mb-4 rounded-md border-l-2 border-primary/40 bg-muted/40 p-3 text-sm">
                      <FieldLabel>Design &amp; survey</FieldLabel>
                      {system.design_overview && (
                        <p className="mb-2 whitespace-pre-line leading-relaxed">{system.design_overview}</p>
                      )}
                      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {system.designed_by && (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground">Designed by:</dt>
                            <dd className="font-medium">
                              {designedByLabel(system.designed_by, system.designed_by_name)}
                            </dd>
                          </div>
                        )}
                        {system.drawing_reference && (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground">Drawing ref:</dt>
                            <dd className="font-medium">{system.drawing_reference}</dd>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Survey:</dt>
                          <dd className="font-medium">
                            {system.survey_carried_out
                              ? `Yes${system.survey_by ? ` �� ${system.survey_by}` : ''}${
                                  system.survey_date ? ` (${formatDateUK(system.survey_date)})` : ''
                                }`
                              : 'Not carried out'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {/* Conditional / configured values. Scalars render as a
                      definition list; table answers render as their own table. */}
                  {(() => {
                    const scalars = conditional.filter(([, v]) => !parseTableRows(v))
                    const tables = conditional.filter(([, v]) => parseTableRows(v))
                    return (
                      <>
                        {scalars.length > 0 && (
                          <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                            {scalars.map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <dt className="text-muted-foreground">{humanizeKey(key)}:</dt>
                                <dd className="font-medium">{renderConditionalValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {tables.map(([key, value]) => {
                          const rows = parseTableRows(value) ?? []
                          if (rows.length === 0) return null
                          const columns = Object.keys(rows[0])
                          return (
                            <div key={key} className="mb-3">
                              <FieldLabel>{humanizeKey(key)}</FieldLabel>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                                      {columns.map((c, ci) => (
                                        <th
                                          key={c}
                                          className={`py-1 font-medium ${ci > 0 ? 'pl-3' : ''}`}
                                        >
                                          {humanizeKey(c)}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, i) => (
                                      <tr key={i} className="border-b border-dashed last:border-0">
                                        {columns.map((c, ci) => (
                                          <td
                                            key={c}
                                            className={`py-1 align-top ${ci > 0 ? 'pl-3' : 'pr-3'}`}
                                          >
                                            {row[c]}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}

                  {systemLines.length > 0 && (
                    <>
                      {quote.show_line_items &&
                        (
                          [
                            { heading: null, rows: productLines },
                            { heading: 'Services', rows: serviceLines },
                          ] as const
                        ).map((group) =>
                          group.rows.length === 0 ? null : (
                            <div key={group.heading ?? 'products'} className="mt-4 first:mt-0">
                              {group.heading && (
                                <FieldLabel>{group.heading}</FieldLabel>
                              )}
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b-2 border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                      <th className="py-1.5 font-semibold">Description</th>
                                      <th className="py-1.5 pl-3 text-right font-semibold whitespace-nowrap">
                                        Qty
                                      </th>
                                      <th className="py-1.5 pl-3 text-right font-semibold whitespace-nowrap">
                                        Unit price
                                      </th>
                                      <th className="py-1.5 pl-3 text-right font-semibold whitespace-nowrap">
                                        Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.rows.map((line) => {
                                      const LineIcon = serviceIcon(`${line.description} ${line.detail ?? ''}`)
                                      return (
                                      <tr
                                        key={line.id}
                                        className="border-b border-dashed last:border-0"
                                      >
                                        <td className="py-2 pr-3 align-top">
                                          <div className="flex items-start gap-2">
                                            <LineIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                            <div className="min-w-0">
                                              <div className="font-medium">{line.description}</div>
                                              {line.detail && (
                                                <div className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                                  {line.detail}
                                                </div>
                                              )}
                                              {line.standard && (
                                                <div className="mt-0.5 text-xs text-muted-foreground">
                                                  <span className="font-medium">Standard:</span> {line.standard}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-2 pl-3 text-right align-top tabular-nums whitespace-nowrap">
                                          {line.quantity}
                                          {line.unit ? ` ${line.unit}` : ''}
                                        </td>
                                        <td className="py-2 pl-3 text-right align-top tabular-nums whitespace-nowrap">
                                          {formatPence(line.unit_price_pence, quote.currency)}
                                        </td>
                                        <td className="py-2 pl-3 text-right align-top font-medium tabular-nums whitespace-nowrap">
                                          {formatPence(line.line_total_pence, quote.currency)}
                                        </td>
                                      </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ),
                        )}

                      {/* Client-selectable options. In interactive mode these are
                          real checkboxes that update the totals live; otherwise
                          they show the client's saved selection. */}
                      {quote.show_line_items && optionalLines.length > 0 && (
                        <div className="mt-5 rounded-lg border border-dashed bg-muted/20 p-4 print:break-inside-avoid">
                          <div className="mb-3 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Plus className="h-3.5 w-3.5" />
                            </span>
                            <FieldLabel className="mb-0">Optional extras</FieldLabel>
                          </div>
                          <p className="mb-3 text-xs text-muted-foreground text-pretty">
                            {interactive
                              ? 'Tick any options you would like to include — the section and quote totals update instantly.'
                              : 'Options marked as selected are included in the section total above.'}
                          </p>
                          <div className="space-y-2">
                            {optionalLines.map((line) => {
                              const selected = isOptionSelected(line)
                              const Icon = serviceIcon(`${line.description} ${line.detail ?? ''}`)
                              const body = (
                                <>
                                  {interactive ? (
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={() => onToggleOption?.(line)}
                                      className="mt-0.5 shrink-0 print:hidden"
                                      aria-label={`Include ${line.description}`}
                                    />
                                  ) : (
                                    <span
                                      aria-hidden
                                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        selected
                                          ? 'border-primary bg-primary text-primary-foreground'
                                          : 'border-muted-foreground/40'
                                      }`}
                                    >
                                      {selected ? <Check className="h-3 w-3" /> : null}
                                    </span>
                                  )}
                                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-3">
                                      <span className="font-medium">{line.description}</span>
                                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                                        {formatPence(line.line_total_pence, quote.currency)}
                                        {line.unit ? (
                                          <span className="font-normal text-muted-foreground">
                                            {' '}
                                            / {line.unit}
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                    {line.detail && (
                                      <div className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                        {line.detail}
                                      </div>
                                    )}
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                      {line.standard && (
                                        <span>
                                          <span className="font-medium">Standard:</span> {line.standard}
                                        </span>
                                      )}
                                      {line.option_group && <span>Choose one from: {line.option_group}</span>}
                                    </div>
                                  </div>
                                </>
                              )
                              return interactive ? (
                                <label
                                  key={line.id}
                                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                                    selected
                                      ? 'border-primary/60 bg-primary/5'
                                      : 'border-border bg-card hover:bg-muted/40'
                                  }`}
                                >
                                  {body}
                                </label>
                              ) : (
                                <div
                                  key={line.id}
                                  className={`flex items-start gap-3 rounded-md border p-3 ${
                                    selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
                                  }`}
                                >
                                  {body}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-end gap-3 border-t pt-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Section total
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatPence(systemTotal, quote.currency)}
                        </span>
                      </div>
                    </>
                  )}
                </section>
              )
            })}
        </div>

        {/* Client requirements compliance matrix */}
        {showRequirements && (
          <section className="mt-10 break-inside-avoid">
            <SectionHeading number={requirementsSectionNo} title="Compliance with your requirements" />
            <p className="mb-3 text-xs text-muted-foreground">
              How this quotation addresses each requirement from your enquiry.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 font-semibold">Requirement</th>
                    <th className="py-1.5 pl-3 font-semibold">Our response</th>
                    <th className="py-1.5 pl-3 font-semibold whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRequirements.map((r) => (
                    <tr key={r.id} className="border-b border-dashed align-top last:border-0">
                      <td className="py-2 pr-3">
                        {r.category && (
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {r.category}
                          </div>
                        )}
                        <div>{r.requirement}</div>
                      </td>
                      <td className="py-2 pl-3 text-muted-foreground">
                        {r.our_response || '—'}
                      </td>
                      <td className="py-2 pl-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${REQUIREMENT_STATUS_META[r.status].badgeClass}`}
                        >
                          {REQUIREMENT_STATUS_META[r.status].short}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Equipment specification (opt-in) */}
        {equipmentSpecSections.length > 0 && (
          <section className="mt-10 break-inside-avoid">
            <SectionHeading number={equipmentSectionNo} title="Equipment specification" />
            <p className="mb-3 text-xs text-muted-foreground">
              Official part numbers and specifications for the equipment supplied.
            </p>
            <div className="space-y-6">
              {equipmentSpecSections.map(({ system, rows }) => (
                <section key={system.id} className="break-inside-avoid">
                  <h4 className="mb-2 border-b pb-1 text-sm font-semibold">
                    {system.system_name || quoteTypeLabel(quote.quote_type)}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="w-32 py-1.5 font-semibold">Part number</th>
                          <th className="py-1.5 font-semibold">Specification</th>
                          <th className="w-20 py-1.5 text-right font-semibold">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-dashed align-top last:border-0"
                          >
                            <td className="py-2 pr-4 align-top font-mono text-xs">
                              {row.partNumber}
                            </td>
                            <td className="py-2 pr-4 align-top">
                              <div className="font-medium">{row.standardDescription}</div>
                              {row.specDetail && (
                                <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                                  {row.specDetail}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-right align-top tabular-nums">
                              {row.quantity}
                              {row.unit ? ` ${row.unit}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

        {/* Totals */}
        <div className="mt-10 flex justify-end break-inside-avoid">
          <div className="w-full max-w-xs text-sm">
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatPence(shownSubtotal, quote.currency)}</span>
              </div>
              {quote.discount_pence > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount applied</span>
                  <span className="tabular-nums">-{formatPence(quote.discount_pence, quote.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({quote.vat_rate}%)</span>
                <span className="tabular-nums">{formatPence(shownVat, quote.currency)}</span>
              </div>
              <div className="-mx-4 -mb-4 mt-2 flex items-center justify-between rounded-b-md bg-foreground px-4 py-3 text-background">
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">Total due</span>
                <span className="text-lg font-bold tabular-nums">
                  {formatPence(shownTotal, quote.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="mt-10 break-inside-avoid border-t pt-4">
            <FieldLabel>Terms &amp; Conditions</FieldLabel>
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {quote.terms}
            </p>
          </div>
        )}

        {/* Maintenance service agreement (opt-in for maintenance quotes) */}
        {quote.show_maintenance_agreement && (
          <MaintenanceAgreementDocument
            copy={resolveMaintenanceAgreement(
              (company?.maintenance_agreement ?? null) as Partial<MaintenanceAgreementCopy> | null,
            )}
            companyName={companyName}
            siteName={quote.site?.name ?? null}
            recipientName={recipientName}
            preparerName={quote.preparer?.full_name ?? null}
            branch={quote.branch ?? null}
          />
        )}

        {/* Footer */}
        <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
          <p>
            {companyName}
            {company?.registration_number ? ` · Reg. ${company.registration_number}` : ''}
            {company?.vat_number ? ` · VAT ${company.vat_number}` : ''}
          </p>
          {company?.website && <p>{company.website}</p>}
        </footer>
      </div>
    </div>
  )
}

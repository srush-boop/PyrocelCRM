'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  formatPence,
  quoteTypeLabel,
  workTypeLabel,
  designedByLabel,
  QUOTE_STATUS_META,
} from '@/lib/sales'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSystem,
} from '@/lib/types/database'

interface QuoteDocumentProps {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  company: CompanyInfo | null
  backHref?: string
}

const HEADER_COLOR = '#0f172a'

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

export function QuoteDocument({ quote, systems, lines, company, backHref }: QuoteDocumentProps) {
  const companyName = company?.name || 'Pyrocel Ltd'
  const recipientName = quote.client?.name || quote.prospect_name || 'Prospective client'
  const recipientContact = quote.client?.contact_name || quote.prospect_contact
  const recipientEmail = quote.client?.contact_email || quote.prospect_email
  const recipientPhone = quote.client?.contact_phone || quote.prospect_phone
  const recipientAddress = quote.site?.address || quote.client?.address || quote.prospect_address

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
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="report-page rounded-lg border bg-card p-8 text-card-foreground shadow-sm print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <header
          className="-mx-8 -mt-8 mb-8 flex items-start justify-between gap-4 px-8 py-6 text-white print:mx-0 print:mt-0 print:rounded-none"
          style={{ backgroundColor: HEADER_COLOR }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
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
              {company?.address && <p className="text-xs text-white/80">{company.address}</p>}
              <p className="text-xs text-white/80">
                {[company?.phone, company?.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">Quotation</p>
            <p className="text-xs text-white/80">{quote.reference ?? quote.quote_number ?? 'Draft'}</p>
            {quote.revision > 0 && <p className="text-xs text-white/80">Revision {quote.revision}</p>}
            <p className="mt-1 text-xs text-white/80">{quoteTypeLabel(quote.quote_type)}</p>
          </div>
        </header>

        {/* Meta row */}
        <section className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prepared for
            </p>
            <p className="mt-1 font-semibold">{recipientName}</p>
            {recipientContact && <p className="text-sm">{recipientContact}</p>}
            {recipientAddress && <p className="text-sm text-muted-foreground">{recipientAddress}</p>}
            <p className="text-sm text-muted-foreground">
              {[recipientEmail, recipientPhone].filter(Boolean).join(' · ')}
            </p>
            {quote.site?.name && (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Site:</span> {quote.site.name}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between sm:justify-end sm:gap-4">
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium">{formatDateUK(quote.created_at)}</dd>
              </div>
              {quote.valid_until && (
                <div className="flex justify-between sm:justify-end sm:gap-4">
                  <dt className="text-muted-foreground">Valid until</dt>
                  <dd className="font-medium">{formatDateUK(quote.valid_until)}</dd>
                </div>
              )}
              <div className="flex justify-between sm:justify-end sm:gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{QUOTE_STATUS_META[quote.status].label}</dd>
              </div>
            </dl>
          </div>
        </section>

        <h1 className="mb-2 text-2xl font-bold text-balance">{quote.title}</h1>
        {quote.summary && (
          <p className="mb-8 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {quote.summary}
          </p>
        )}

        {/* Systems + specification + line items */}
        <div className="space-y-8">
          {systems
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((system) => {
              const systemLines = lines
                .filter((l) => l.system_id === system.id)
                .sort((a, b) => a.position - b.position)
              // Products and non-product services are shown as separate groups.
              const productLines = systemLines.filter((l) => !l.is_service)
              const serviceLines = systemLines.filter((l) => l.is_service)
              const systemTotal = systemLines.reduce((sum, l) => sum + l.line_total_pence, 0)
              const conditional = Object.entries(system.conditional_values ?? {}).filter(
                ([, value]) => !isOmittedValue(value),
              )
              return (
                <div key={system.id} className="break-inside-avoid">
                  <div className="mb-2 flex items-baseline justify-between gap-2 border-b pb-1">
                    <h2 className="font-semibold">
                      {system.system_name}
                      {system.system_code ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {system.system_code}
                        </span>
                      ) : null}
                    </h2>
                    <span className="text-xs text-muted-foreground">{workTypeLabel(system.work_type)}</span>
                  </div>

                  {system.specification && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Specification
                      </p>
                      <p className="whitespace-pre-line text-sm leading-relaxed">{system.specification}</p>
                    </div>
                  )}

                  {/* Design & survey */}
                  {(system.design_overview ||
                    system.design_category_id ||
                    system.drawing_reference ||
                    system.designed_by ||
                    system.survey_carried_out) && (
                    <div className="mb-3 rounded-md bg-muted/40 p-3 text-sm">
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
                              ? `Yes${system.survey_by ? ` — ${system.survey_by}` : ''}${
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
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {humanizeKey(key)}
                              </p>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    {columns.map((c) => (
                                      <th key={c} className="py-1 font-medium">
                                        {humanizeKey(c)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, i) => (
                                    <tr key={i} className="border-b border-dashed last:border-0">
                                      {columns.map((c) => (
                                        <td key={c} className="py-1 pr-4 align-top">
                                          {row[c]}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                            <div key={group.heading ?? 'products'} className="mt-3 first:mt-0">
                              {group.heading && (
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {group.heading}
                                </div>
                              )}
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <th className="py-1 font-medium">Description</th>
                                    <th className="py-1 text-right font-medium">Qty</th>
                                    <th className="py-1 text-right font-medium">Unit price</th>
                                    <th className="py-1 text-right font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((line) => (
                                    <tr
                                      key={line.id}
                                      className="border-b border-dashed last:border-0"
                                    >
                                      <td className="py-2 pr-4 align-top">
                                        <div className="font-medium">{line.description}</div>
                                        {line.detail && (
                                          <div className="text-xs text-muted-foreground">
                                            {line.detail}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2 text-right align-top tabular-nums">
                                        {line.quantity}
                                        {line.unit ? ` ${line.unit}` : ''}
                                      </td>
                                      <td className="py-2 text-right align-top tabular-nums">
                                        {formatPence(line.unit_price_pence, quote.currency)}
                                      </td>
                                      <td className="py-2 text-right align-top font-medium tabular-nums">
                                        {formatPence(line.line_total_pence, quote.currency)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ),
                        )}
                      <div className="mt-1 text-right text-sm text-muted-foreground">
                        Total:{' '}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatPence(systemTotal, quote.currency)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
        </div>

        {/* Totals */}
        <div className="mt-8 flex justify-end break-inside-avoid">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatPence(quote.subtotal_pence, quote.currency)}</span>
            </div>
            {quote.discount_pence > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount applied</span>
                <span className="tabular-nums">-{formatPence(quote.discount_pence, quote.currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({quote.vat_rate}%)</span>
              <span className="tabular-nums">{formatPence(quote.vat_pence, quote.currency)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatPence(quote.total_pence, quote.currency)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="mt-8 break-inside-avoid border-t pt-4">
            <h3 className="mb-1 text-sm font-semibold">Terms &amp; Conditions</h3>
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {quote.terms}
            </p>
          </div>
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

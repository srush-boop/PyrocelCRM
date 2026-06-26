'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { quoteTypeLabel } from '@/lib/sales'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteSystem,
} from '@/lib/types/database'

// A catalogue item carries the official standard description and full spec text.
interface SpecCatalogueItem {
  id: string
  product_code: string | null
  name: string
  description: string | null
}

interface EquipmentSpecDocumentProps {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  catalogue: SpecCatalogueItem[]
  company: CompanyInfo | null
  backHref?: string
}

const HEADER_COLOR = '#0f172a'

export function EquipmentSpecDocument({
  quote,
  systems,
  lines,
  catalogue,
  company,
  backHref,
}: EquipmentSpecDocumentProps) {
  const companyName = company?.name || 'Pyrocel Ltd'
  const recipientName = quote.client?.name || quote.prospect_name || 'Prospective client'
  const recipientAddress = quote.site?.address || quote.client?.address || quote.prospect_address

  // Index the catalogue for fast lookup by id and by product code.
  const byId = new Map(catalogue.map((c) => [c.id, c]))
  const byCode = new Map(
    catalogue.filter((c) => c.product_code).map((c) => [c.product_code as string, c]),
  )

  // Resolve the official catalogue record behind a quote line so we can surface
  // the standard description and full specification text from the catalogue.
  function resolveCatalogue(line: QuoteLineItem): SpecCatalogueItem | null {
    if (line.catalogue_item_id && byId.has(line.catalogue_item_id)) {
      return byId.get(line.catalogue_item_id) as SpecCatalogueItem
    }
    if (line.product_code && byCode.has(line.product_code)) {
      return byCode.get(line.product_code) as SpecCatalogueItem
    }
    return null
  }

  // Build spec rows per system: only equipment (non-service) lines with a product.
  const sections = systems
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((system) => {
      const rows = lines
        .filter((l) => l.system_id === system.id && !l.is_service)
        .filter((l) => l.product_code || l.catalogue_item_id)
        .sort((a, b) => a.position - b.position)
        .map((line) => {
          const cat = resolveCatalogue(line)
          return {
            id: line.id,
            partNumber: line.product_code || cat?.product_code || '—',
            standardDescription: cat?.name || line.description,
            specDetail: cat?.description ?? '',
            quantity: line.quantity,
            unit: line.unit,
          }
        })
      return { system, rows }
    })
    .filter((s) => s.rows.length > 0)

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
            <p className="text-sm font-semibold uppercase tracking-wide">Equipment Specification</p>
            <p className="text-xs text-white/80">{quote.reference ?? quote.quote_number ?? 'Draft'}</p>
            {quote.revision > 0 && <p className="text-xs text-white/80">Revision {quote.revision}</p>}
            <p className="mt-1 text-xs text-white/80">{quoteTypeLabel(quote.quote_type)}</p>
          </div>
        </header>

        {/* Meta */}
        <section className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prepared for</p>
            <p className="mt-1 font-semibold">{recipientName}</p>
            {recipientAddress && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{recipientAddress}</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</p>
            <p className="mt-1 font-semibold">{quote.title}</p>
            <p className="text-sm text-muted-foreground">Issued {formatDateUK(new Date().toISOString())}</p>
          </div>
        </section>

        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No equipment lines with a catalogue product were found on this quote.
          </p>
        ) : (
          <div className="space-y-8">
            {sections.map(({ system, rows }) => (
              <section key={system.id}>
                <h2 className="mb-3 border-b pb-1 text-base font-semibold">
                  {system.system_name || quoteTypeLabel(quote.quote_type)}
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-32 py-1 font-medium">Part number</th>
                      <th className="py-1 font-medium">Specification</th>
                      <th className="w-20 py-1 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-dashed align-top last:border-0">
                        <td className="py-2 pr-4 align-top font-mono text-xs">{row.partNumber}</td>
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
              </section>
            ))}
          </div>
        )}

        <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
          <p>
            This equipment specification is issued by {companyName} and lists the official part numbers and
            specifications for the equipment supplied under reference{' '}
            {quote.reference ?? quote.quote_number ?? ''}.
          </p>
        </footer>
      </div>
    </div>
  )
}

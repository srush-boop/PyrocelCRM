// Builds a Sage 50 "Audit Trail" transaction CSV from issued CRM invoices.
//
// First-pass integration: we don't talk to Sage directly, we emit a CSV that the
// Sage 50 import wizard (File > Import > Audit Trail transactions) can read. One
// CSV row per invoice LINE ITEM so each posts to its own nominal code, which is
// how Sage splits a sales invoice across nominals.
//
// Column set is the standard Sage 50 transaction import layout. A header row is
// included so the columns can be mapped in the wizard.

export interface SageExportInvoice {
  invoiceNumber: string
  documentType: 'invoice' | 'credit_note'
  sageAccountRef: string | null
  issueDate: string | null // ISO date
  taxRate: number // percentage, e.g. 20
  lines: {
    description: string
    amountPence: number // net (ex VAT)
    nominalCode: string | null
  }[]
}

const HEADER = [
  'Type',
  'Account Reference',
  'Nominal A/C Ref',
  'Department Code',
  'Date',
  'Reference',
  'Details',
  'Net Amount',
  'Tax Code',
  'Tax Amount',
] as const

/**
 * Normalise "smart"/Unicode punctuation to plain ASCII so Sage 50 (which reads
 * imports as Windows-1252/ASCII) doesn't render mojibake like "â€”" for an
 * em-dash. Covers the characters that show up in generated line descriptions.
 */
function sanitizeText(value: string): string {
  return (value ?? '')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-') // figure/en/em dash, horizontal bar -> hyphen
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single quotes -> '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // curly double quotes -> "
    .replace(/[\u2022\u00B7]/g, '-') // bullet / middle dot -> hyphen
    .replace(/\u2026/g, '...') // ellipsis
    .replace(/\u00A0/g, ' ') // non-breaking space -> space
    .replace(/[^\x20-\x7E]/g, '') // strip any remaining non-ASCII
    .trim()
}

/** Escape a single CSV field per RFC 4180 (quote if it contains , " or newline). */
function csvField(value: string | number): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Pence -> plain decimal pounds string, no symbol/thousands (e.g. 123456 -> "1234.56"). */
function poundsFromPence(pence: number): string {
  return (Math.round(pence) / 100).toFixed(2)
}

/** ISO date (or null) -> Sage's DD/MM/YYYY, falling back to today. */
function sageDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

/** Map an invoice tax rate to a Sage tax code (standard-rate T1, zero-rate T0). */
function taxCodeFor(rate: number): string {
  return rate > 0 ? 'T1' : 'T0'
}

/**
 * Build the Sage 50 audit-trail CSV text for a batch of invoices.
 * SI = Sales Invoice, SC = Sales Credit (credit note). Amounts are always
 * positive; Sage derives the sign from the transaction type.
 */
export function buildSageCsv(invoices: SageExportInvoice[]): string {
  const rows: string[] = [HEADER.map(csvField).join(',')]

  for (const inv of invoices) {
    const type = inv.documentType === 'credit_note' ? 'SC' : 'SI'
    const account = inv.sageAccountRef ?? ''
    const date = sageDate(inv.issueDate)
    const taxCode = taxCodeFor(inv.taxRate)

    for (const line of inv.lines) {
      const netPence = Math.abs(line.amountPence)
      const taxPence = Math.round((netPence * (inv.taxRate ?? 0)) / 100)
      rows.push(
        [
          type,
          account,
          line.nominalCode ?? '',
          '', // Department Code — unused in first pass
          date,
          inv.invoiceNumber,
          sanitizeText(line.description),
          poundsFromPence(netPence),
          taxCode,
          poundsFromPence(taxPence),
        ]
          .map(csvField)
          .join(','),
      )
    }
  }

  // CRLF line endings — Sage on Windows is happiest with these.
  return rows.join('\r\n')
}

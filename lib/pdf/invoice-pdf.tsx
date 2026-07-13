import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'
import { formatPence, financialYearLabel } from '@/lib/billing/invoices'
import { PYROCEL_RED } from '@/lib/service-colors'
import type {
  CompanyInfo,
  Invoice,
  InvoiceLineItem,
  InvoiceLineKind,
} from '@/lib/types/database'

const HEADER_COLOR = PYROCEL_RED
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const INK = '#0f172a'

// Client-friendly labels. Note: the internal "Works to date"/"Job line" wording
// stays generic on the customer copy.
const KIND_LABELS: Record<InvoiceLineKind, string> = {
  labour: 'Labour',
  part: 'Parts',
  other: 'Charge',
  job_claim: 'Works completed',
  equipment: 'Equipment',
  job_line: 'Works',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9,
    color: INK,
    fontFamily: 'Helvetica',
  },
  header: {
    backgroundColor: HEADER_COLOR,
    color: '#ffffff',
    marginHorizontal: -40,
    marginTop: -36,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyName: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerSub: { fontSize: 8, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  headerRight: { textAlign: 'right' },
  docLabel: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  docNumber: { fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  metaCol: { flex: 1 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 3,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },
  metaPair: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 1 },
  metaKey: { color: MUTED, marginRight: 12 },
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'dashed',
    paddingVertical: 5,
  },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: MUTED },
  cType: { width: 74, paddingRight: 6 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 46, textAlign: 'right' },
  cUnit: { width: 70, textAlign: 'right' },
  cAmount: { width: 74, textAlign: 'right' },
  totals: { marginTop: 18, alignItems: 'flex-end' },
  totalsBox: { width: 220 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalsFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: INK,
    paddingTop: 5,
    marginTop: 4,
  },
  totalsFinalText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  notes: { marginTop: 22, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  notesText: { fontSize: 8.5, color: INK, lineHeight: 1.5 },
  payBox: {
    marginTop: 18,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  watermark: {
    position: 'absolute',
    top: 300,
    left: 90,
    fontSize: 90,
    fontFamily: 'Helvetica-Bold',
    color: '#f1f5f9',
    transform: 'rotate(-30deg)',
  },
})

function InvoicePdfDocument({
  invoice,
  lines,
  company,
}: {
  invoice: Invoice
  lines: InvoiceLineItem[]
  company: CompanyInfo | null
}) {
  const isCreditNote = invoice.document_type === 'credit_note'
  const isDraft = invoice.status === 'draft'
  const docLabel = isCreditNote ? 'Credit Note' : 'Invoice'
  const companyName = company?.name || 'Pyrocel Ltd'
  const billToName = invoice.bill_to_name || invoice.billing_account?.name || 'Customer'

  return (
    <Document title={`${docLabel} ${invoice.invoice_number}`}>
      <Page size="A4" style={styles.page}>
        {isDraft ? <Text style={styles.watermark} fixed>DRAFT</Text> : null}

        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>{companyName}</Text>
            {company?.address ? <Text style={styles.headerSub}>{company.address}</Text> : null}
            <Text style={styles.headerSub}>
              {[company?.phone, company?.email].filter(Boolean).join('  -  ')}
            </Text>
            {company?.vat_number ? (
              <Text style={styles.headerSub}>VAT No. {company.vat_number}</Text>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docLabel}>{docLabel}</Text>
            <Text style={styles.docNumber}>{invoice.invoice_number}</Text>
            <Text style={styles.docNumber}>FY {financialYearLabel(invoice.financial_year)}</Text>
          </View>
        </View>

        {/* Meta: bill-to + dates */}
        <View style={styles.metaRow}>
          <View style={[styles.metaCol, { paddingRight: 24 }]}>
            <Text style={styles.sectionLabel}>{isCreditNote ? 'Credit to' : 'Bill to'}</Text>
            <Text style={styles.bold}>{billToName}</Text>
            {invoice.bill_to_address ? (
              <Text style={styles.muted}>{invoice.bill_to_address}</Text>
            ) : null}
            {invoice.bill_to_email ? (
              <Text style={styles.muted}>{invoice.bill_to_email}</Text>
            ) : null}
            {invoice.site_address ? (
              <Text style={{ marginTop: 6 }}>
                <Text style={styles.muted}>Site: </Text>
                {invoice.site_address}
              </Text>
            ) : null}
            {invoice.po_number ? (
              <Text style={{ marginTop: 2 }}>
                <Text style={styles.muted}>PO number: </Text>
                <Text style={styles.bold}>{invoice.po_number}</Text>
              </Text>
            ) : null}
          </View>
          <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
            <View style={styles.metaPair}>
              <Text style={styles.metaKey}>{isCreditNote ? 'Credit date' : 'Invoice date'}</Text>
              <Text style={styles.bold}>
                {invoice.issue_date ? formatDateUK(invoice.issue_date) : '—'}
              </Text>
            </View>
            {!isCreditNote ? (
              <>
                <View style={styles.metaPair}>
                  <Text style={styles.metaKey}>Payment due</Text>
                  <Text style={styles.bold}>
                    {invoice.due_date ? formatDateUK(invoice.due_date) : '—'}
                  </Text>
                </View>
                <View style={styles.metaPair}>
                  <Text style={styles.metaKey}>Terms</Text>
                  <Text style={styles.bold}>{invoice.payment_terms_days} days</Text>
                </View>
              </>
            ) : null}
            {invoice.status === 'paid' ? (
              <View style={styles.metaPair}>
                <Text style={styles.metaKey}>Paid</Text>
                <Text style={styles.bold}>
                  {invoice.paid_at ? formatDateUK(invoice.paid_at) : 'Yes'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Line items — NO nominal codes on the customer copy */}
        <View style={styles.tHead}>
          <Text style={[styles.th, styles.cType]}>Type</Text>
          <Text style={[styles.th, styles.cDesc]}>Description</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          <Text style={[styles.th, styles.cUnit]}>Unit</Text>
          <Text style={[styles.th, styles.cAmount]}>Amount</Text>
        </View>
        {lines.map((line) => (
          <View key={line.id} style={styles.tRow} wrap={false}>
            <Text style={[styles.cType, styles.muted]}>{KIND_LABELS[line.kind] ?? 'Charge'}</Text>
            <Text style={styles.cDesc}>{line.description}</Text>
            <Text style={styles.cQty}>{line.quantity}</Text>
            <Text style={styles.cUnit}>{formatPence(line.unit_price_pence)}</Text>
            <Text style={[styles.cAmount, styles.bold]}>{formatPence(line.amount_pence)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Subtotal</Text>
              <Text>{formatPence(invoice.subtotal_pence)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>VAT ({invoice.tax_rate}%)</Text>
              <Text>{formatPence(invoice.tax_pence)}</Text>
            </View>
            <View style={styles.totalsFinal}>
              <Text style={styles.totalsFinalText}>{isCreditNote ? 'Total credit' : 'Total due'}</Text>
              <Text style={styles.totalsFinalText}>{formatPence(invoice.total_pence)}</Text>
            </View>
          </View>
        </View>

        {/* Payment terms (invoices only) */}
        {!isCreditNote ? (
          <View style={styles.payBox}>
            <Text style={styles.sectionLabel}>Payment</Text>
            <Text style={styles.notesText}>
              Payment is due within {invoice.payment_terms_days} days
              {invoice.due_date ? ` (by ${formatDateUK(invoice.due_date)})` : ''}. Please quote
              invoice number {invoice.invoice_number} with your remittance.
            </Text>
          </View>
        ) : null}

        {/* Notes */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          {[
            companyName,
            company?.registration_number ? `Reg. No. ${company.registration_number}` : null,
            company?.vat_number ? `VAT No. ${company.vat_number}` : null,
            company?.website,
          ]
            .filter(Boolean)
            .join('   ·   ')}
        </Text>
      </Page>
    </Document>
  )
}

// Render the invoice to a PDF Buffer (server-side). Used by the download route
// and, later, the "email invoice" flow. The customer copy deliberately omits
// nominal codes (internal accounting only).
export async function renderInvoicePdfBuffer(args: {
  invoice: Invoice
  lines: InvoiceLineItem[]
  company: CompanyInfo | null
}): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument {...args} />)
}

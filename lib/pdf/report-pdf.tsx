import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'

/**
 * Server-side, branding-aware PDF of a completed service report, rendered with
 * @react-pdf/renderer so it can be attached to the client completion email.
 *
 * This is a print-oriented companion to the on-screen HTML report — it carries
 * the masthead, meta, overall result, the full checklist and engineer notes, and
 * signatures. Charts are omitted (not supported by react-pdf); the email keeps a
 * link to the rich interactive report for the full detail.
 */

const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const FALLBACK_HEADER = '#b91c1c'

export type ReportPdfStatus = 'pass' | 'fail' | 'partial' | 'no_access'

const STATUS_META: Record<ReportPdfStatus, { label: string; color: string }> = {
  pass: { label: 'Compliant', color: '#16a34a' },
  fail: { label: 'Action Required', color: '#dc2626' },
  partial: { label: 'Remedial', color: '#d97706' },
  no_access: { label: 'No Access', color: '#64748b' },
}

export interface ReportPdfChecklistItem {
  label: string
  type?: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value?: boolean | string | number | null
  passed: boolean | null
  advisory?: boolean
  notes?: string | null
  indented?: boolean
}

export interface ReportPdfData {
  // Branding (already resolved from the effective report template + company info)
  companyName: string
  logoUrl?: string | null // absolute URL for server-side fetch
  headerColor?: string | null
  footerText?: string | null
  standards?: string | null
  // Report identity
  docSubtitle: string // service type name
  referenceNumber?: string | null
  reportDate?: string | null // ISO
  // Meta
  siteName?: string | null
  siteAddress?: string | null
  clientName?: string | null
  systemName?: string | null
  serviceName?: string | null
  visitName?: string | null
  engineerName?: string | null
  // Body
  overallStatus: ReportPdfStatus
  checklist: ReportPdfChecklistItem[]
  engineerNotes?: string | null
  // Signature
  includeSignature?: boolean
  signatureUrl?: string | null // absolute URL
  signatoryName?: string | null
  signatoryTitle?: string | null
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontSize: 9,
    color: '#0f172a',
    fontFamily: 'Helvetica',
  },
  header: {
    color: '#ffffff',
    marginHorizontal: -40,
    marginTop: -36,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 34, width: 'auto', objectFit: 'contain' },
  companyName: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerSub: { fontSize: 8, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  headerRight: { textAlign: 'right' },
  headerLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  metaCol: { width: '50%', marginBottom: 6, paddingRight: 8 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 2,
  },
  ribbon: {
    marginVertical: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ribbonText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  ribbonSub: { color: '#ffffff', fontSize: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 3,
  },
  paragraph: { fontSize: 9, lineHeight: 1.5, marginBottom: 4 },
  tHead: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'dashed',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    color: MUTED,
  },
  cItem: { width: '58%', paddingRight: 6 },
  cValue: { width: '24%', paddingRight: 6 },
  cResult: { width: '18%', textAlign: 'right' },
  resultChip: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  note: { fontSize: 8, color: MUTED, marginTop: 1 },
  signatureBlock: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  signatureCol: { width: '48%' },
  signatureImage: { marginTop: 4, height: 40, width: 'auto', objectFit: 'contain' },
  signatureLine: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED },
  footerText: { fontSize: 7, color: MUTED, marginBottom: 3, lineHeight: 1.4 },
})

function MetaField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={styles.metaCol}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}

function resultFor(item: ReportPdfChecklistItem): { text: string; color: string } {
  if (item.advisory) return { text: 'ADVISORY', color: '#d97706' }
  if (item.passed === true) return { text: 'PASS', color: '#16a34a' }
  if (item.passed === false) return { text: 'FAIL', color: '#dc2626' }
  return { text: '—', color: MUTED }
}

function valueText(item: ReportPdfChecklistItem): string {
  if (item.value === true) return 'Yes'
  if (item.value === false) return 'No'
  if (item.value === null || item.value === undefined || item.value === '') return ''
  return String(item.value)
}

function ReportPdfDocument({ data }: { data: ReportPdfData }) {
  const headerColor = data.headerColor || FALLBACK_HEADER
  const status = STATUS_META[data.overallStatus] ?? STATUS_META.pass
  const rows = data.checklist ?? []
  const passCount = rows.filter((r) => r.passed === true).length
  const failCount = rows.filter((r) => r.passed === false && !r.advisory).length
  const dateLabel = data.reportDate ? formatDateUK(data.reportDate) : ''

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { backgroundColor: headerColor }]} fixed>
          <View style={styles.headerLeft}>
            {data.logoUrl ? <Image src={data.logoUrl} style={styles.logo} /> : null}
            <View>
              <Text style={styles.companyName}>{data.companyName}</Text>
              <Text style={styles.headerSub}>Service Report · {data.docSubtitle}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {data.referenceNumber ? (
              <Text style={styles.headerLabel}>{data.referenceNumber}</Text>
            ) : null}
            {dateLabel ? <Text style={styles.headerSub}>{dateLabel}</Text> : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaField label="Site" value={data.siteName} />
          <MetaField label="Client" value={data.clientName} />
          <MetaField label="Address" value={data.siteAddress} />
          <MetaField label="System" value={data.systemName} />
          <MetaField label="Service" value={data.serviceName || data.docSubtitle} />
          <MetaField label="Visit" value={data.visitName} />
          <MetaField label="Engineer" value={data.engineerName} />
          <MetaField label="Reference" value={data.referenceNumber} />
        </View>

        <View style={[styles.ribbon, { backgroundColor: status.color }]}>
          <Text style={styles.ribbonText}>{status.label}</Text>
          <Text style={styles.ribbonSub}>
            {passCount} passed{failCount > 0 ? ` · ${failCount} to action` : ''}
          </Text>
        </View>

        {rows.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Inspection Results</Text>
            <View style={styles.tHead}>
              <Text style={[styles.th, styles.cItem]}>Item</Text>
              <Text style={[styles.th, styles.cValue]}>Value</Text>
              <Text style={[styles.th, styles.cResult]}>Result</Text>
            </View>
            {rows.map((item, i) => {
              const res = resultFor(item)
              const val = valueText(item)
              return (
                <View key={i} style={styles.tRow} wrap={false}>
                  <View style={styles.cItem}>
                    <Text>
                      {item.indented ? '↳ ' : ''}
                      {item.label}
                    </Text>
                    {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
                  </View>
                  <Text style={styles.cValue}>{val}</Text>
                  <Text style={[styles.cResult, styles.resultChip, { color: res.color }]}>
                    {res.text}
                  </Text>
                </View>
              )
            })}
          </>
        )}

        {data.engineerNotes ? (
          <>
            <Text style={styles.sectionTitle}>Engineer Notes</Text>
            <Text style={styles.paragraph}>{data.engineerNotes}</Text>
          </>
        ) : null}

        {data.includeSignature !== false &&
        (data.signatureUrl || data.signatoryName) ? (
          <View style={styles.signatureBlock} wrap={false}>
            <View style={styles.signatureCol}>
              <Text style={styles.sectionLabel}>Engineer</Text>
              {data.signatureUrl ? (
                <Image src={data.signatureUrl} style={styles.signatureImage} />
              ) : null}
              <View style={styles.signatureLine}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                  {data.signatoryName || data.engineerName || '—'}
                </Text>
                {data.signatoryTitle ? (
                  <Text style={{ color: MUTED, fontSize: 8 }}>{data.signatoryTitle}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.signatureCol}>
              <Text style={styles.sectionLabel}>Date</Text>
              <View style={styles.signatureLine}>
                <Text>{dateLabel || '—'}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          {data.footerText ? <Text style={styles.footerText}>{data.footerText}</Text> : null}
          {data.standards ? <Text style={styles.footerText}>{data.standards}</Text> : null}
          <View style={styles.footerRow}>
            <Text>
              {data.companyName}
              {data.referenceNumber ? ` · ${data.referenceNumber}` : ''}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderReportPdf(data: ReportPdfData): Promise<Buffer> {
  return renderToBuffer(<ReportPdfDocument data={data} />)
}

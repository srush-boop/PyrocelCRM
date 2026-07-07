import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'
import {
  formatPence,
  quoteTypeLabel,
  workTypeLabel,
  designedByLabel,
  QUOTE_STATUS_META,
} from '@/lib/sales'
import type { CompanyInfo, Quote, QuoteLineItem, QuoteSystem } from '@/lib/types/database'
import {
  buildEquipmentSpecSections,
  type SpecCatalogueItem,
} from '@/lib/sales/equipment-spec'

const HEADER_COLOR = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontSize: 9, color: '#0f172a', fontFamily: 'Helvetica' },
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
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1 },
  headerSub: { fontSize: 8, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  headerRight: { textAlign: 'right' },
  headerLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  metaCol: { flex: 1 },
  // Right-hand meta pairs (Date / Prepared by / Status). `gap` is unreliable in
  // @react-pdf, so spacing between label and value is set with an explicit margin.
  metaPair: { flexDirection: 'row', marginBottom: 1 },
  metaKey: { color: MUTED, marginRight: 12 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: MUTED, marginBottom: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  summary: { fontSize: 9, color: MUTED, lineHeight: 1.5, marginBottom: 20 },
  system: { marginBottom: 20 },
  systemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3, marginBottom: 6 },
  systemName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  block: { marginBottom: 8 },
  spec: { fontSize: 9, lineHeight: 1.5 },
  groupLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: MUTED, marginTop: 8, marginBottom: 3 },
  tHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3, marginBottom: 2 },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'dashed', paddingVertical: 4 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: MUTED },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 70, textAlign: 'right' },
  cUnit: { width: 80, textAlign: 'right' },
  cTotal: { width: 80, textAlign: 'right' },
  lineDetail: { fontSize: 7, color: MUTED, marginTop: 1 },
  systemTotal: { textAlign: 'right', marginTop: 4, fontSize: 9, color: MUTED },
  totals: { marginTop: 24, alignItems: 'flex-end' },
  totalsBox: { width: 200 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsFinal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 4, marginTop: 4 },
  totalsFinalText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  designBlock: { marginBottom: 8, backgroundColor: '#f8fafc', borderRadius: 4, padding: 8 },
  specSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12 },
  specSectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  specGroup: { marginTop: 10 },
  specGroupTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 2, marginBottom: 4 },
  cPart: { width: 90, paddingRight: 6, fontFamily: 'Helvetica' },
  cSpec: { flex: 1, paddingRight: 6 },
  cSpecQty: { width: 50, textAlign: 'right' },
  terms: { marginTop: 24, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  termsText: { fontSize: 7.5, color: MUTED, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: MUTED, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 },
})

function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isOmittedValue(value: string | number | boolean): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === '' || v === 'na' || v === 'n/a'
  }
  return false
}

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

function renderConditionalValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return String(value)
}

function QuotePdfDocument({
  quote,
  systems,
  lines,
  company,
  catalogue = [],
}: {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  company: CompanyInfo | null
  catalogue?: SpecCatalogueItem[]
}) {
  const companyName = company?.name || 'Pyrocel Ltd'
  // The issuing branch selects which address/contact details render in the
  // header under the company name; fall back to the company's own details.
  const headerAddress = quote.branch?.address || company?.address
  const headerPhone = quote.branch?.phone || company?.phone
  const headerEmail = quote.branch?.email || company?.email
  // The document title is simply the site name (falling back to the stored
  // quote title when the quote has no linked site).
  const documentTitle = quote.site?.name || quote.title
  const equipmentSpecSections = quote.show_equipment_spec
    ? buildEquipmentSpecSections(systems, lines, catalogue)
    : []
  const recipientName = quote.client?.name || quote.prospect_name || 'Prospective client'
  const recipientContact = quote.client?.contact_name || quote.prospect_contact
  const recipientEmail = quote.client?.contact_email || quote.prospect_email
  const recipientPhone = quote.client?.contact_phone || quote.prospect_phone
  const recipientAddress = quote.site?.address || quote.client?.address || quote.prospect_address
  const sortedSystems = systems.slice().sort((a, b) => a.position - b.position)

  return (
    <Document title={documentTitle || 'Quotation'}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>{companyName}</Text>
            {headerAddress ? <Text style={styles.headerSub}>{headerAddress}</Text> : null}
            <Text style={styles.headerSub}>
              {[headerPhone, headerEmail].filter(Boolean).join('  -  ')}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>Quotation</Text>
            <Text style={styles.headerSub}>{quote.reference ?? quote.quote_number ?? 'Draft'}</Text>
            {quote.revision > 0 ? <Text style={styles.headerSub}>Revision {quote.revision}</Text> : null}
            <Text style={styles.headerSub}>{quoteTypeLabel(quote.quote_type)}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={[styles.metaCol, { paddingRight: 24 }]}>
            <Text style={styles.sectionLabel}>Prepared for</Text>
            <Text style={styles.bold}>{recipientName}</Text>
            {recipientContact ? <Text>{recipientContact}</Text> : null}
            {recipientAddress ? <Text style={styles.muted}>{recipientAddress}</Text> : null}
            {recipientEmail || recipientPhone ? (
              <Text style={styles.muted}>{[recipientEmail, recipientPhone].filter(Boolean).join('  -  ')}</Text>
            ) : null}
            {quote.site?.name ? (
              <Text style={{ marginTop: 2 }}>
                <Text style={styles.muted}>Site: </Text>
                {quote.site.name}
              </Text>
            ) : null}
          </View>
          <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
            <View style={styles.metaPair}>
              <Text style={styles.metaKey}>Date</Text>
              <Text style={styles.bold}>{formatDateUK(quote.created_at)}</Text>
            </View>
            {quote.preparer?.full_name ? (
              <View style={styles.metaPair}>
                <Text style={styles.metaKey}>Prepared by</Text>
                <Text style={styles.bold}>{quote.preparer.full_name}</Text>
              </View>
            ) : null}
            {quote.valid_until ? (
              <View style={styles.metaPair}>
                <Text style={styles.metaKey}>Valid until</Text>
                <Text style={styles.bold}>{formatDateUK(quote.valid_until)}</Text>
              </View>
            ) : null}
            <View style={styles.metaPair}>
              <Text style={styles.metaKey}>Status</Text>
              <Text style={styles.bold}>{QUOTE_STATUS_META[quote.status].label}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title}>{documentTitle}</Text>
        {quote.summary ? <Text style={styles.summary}>{quote.summary}</Text> : null}

        {/* Systems */}
        {sortedSystems.map((system) => {
          const systemLines = lines
            .filter((l) => l.system_id === system.id)
            .sort((a, b) => a.position - b.position)
          const coreLines = systemLines.filter((l) => !l.is_optional)
          const productLines = coreLines.filter((l) => !l.is_service)
          const serviceLines = coreLines.filter((l) => l.is_service)
          const optionalLines = systemLines.filter((l) => l.is_optional)
          const systemTotal = systemLines.reduce(
            (sum, l) => sum + (l.is_optional && l.client_selected !== true ? 0 : l.line_total_pence),
            0,
          )
          const conditional = Object.entries(system.conditional_values ?? {}).filter(
            ([, value]) => !isOmittedValue(value as string | number | boolean),
          ) as [string, string | number | boolean][]
          const scalars = conditional.filter(([, v]) => !parseTableRows(v))
          const tables = conditional.filter(([, v]) => parseTableRows(v))
          const groups = [
            { heading: null as string | null, rows: productLines },
            { heading: 'Services' as string | null, rows: serviceLines },
          ]

          return (
            <View key={system.id} style={styles.system} wrap={false}>
              <View style={styles.systemHead}>
                <Text style={styles.systemName}>
                  {system.system_name}
                  {system.system_code ? `  ${system.system_code}` : ''}
                </Text>
                <Text style={styles.muted}>{workTypeLabel(system.work_type)}</Text>
              </View>

              {system.specification ? (
                <View style={styles.block}>
                  <Text style={styles.sectionLabel}>Specification</Text>
                  <Text style={styles.spec}>{system.specification}</Text>
                </View>
              ) : null}

              {scalars.length > 0 ? (
                <View style={styles.block}>
                  {scalars.map(([key, value]) => (
                    <Text key={key} style={{ marginBottom: 1 }}>
                      <Text style={styles.muted}>{humanizeKey(key)}: </Text>
                      <Text style={styles.bold}>{renderConditionalValue(value)}</Text>
                    </Text>
                  ))}
                </View>
              ) : null}

              {tables.map(([key, value]) => {
                const rows = parseTableRows(value) ?? []
                if (rows.length === 0) return null
                const columns = Object.keys(rows[0])
                return (
                  <View key={key} style={styles.block}>
                    <Text style={styles.groupLabel}>{humanizeKey(key)}</Text>
                    <View style={styles.tHead}>
                      {columns.map((c) => (
                        <Text key={c} style={[styles.th, { flex: 1 }]}>
                          {humanizeKey(c)}
                        </Text>
                      ))}
                    </View>
                    {rows.map((row, i) => (
                      <View key={i} style={styles.tRow}>
                        {columns.map((c) => (
                          <Text key={c} style={{ flex: 1, paddingRight: 6 }}>
                            {row[c]}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                )
              })}

              {systemLines.length > 0 ? (
                <View>
                  {quote.show_line_items
                    ? groups.map((group) =>
                        group.rows.length === 0 ? null : (
                          <View key={group.heading ?? 'products'}>
                            {group.heading ? <Text style={styles.groupLabel}>{group.heading}</Text> : null}
                            <View style={styles.tHead}>
                              <Text style={[styles.th, styles.cDesc]}>Description</Text>
                              <Text style={[styles.th, styles.cQty]}>Qty</Text>
                              <Text style={[styles.th, styles.cUnit]}>Unit price</Text>
                              <Text style={[styles.th, styles.cTotal]}>Total</Text>
                            </View>
                            {group.rows.map((line) => (
                              <View key={line.id} style={styles.tRow}>
                                <View style={styles.cDesc}>
                                  <Text style={styles.bold}>{line.description}</Text>
                                  {line.detail ? (
                                    <Text style={[styles.muted, { fontSize: 8 }]}>{line.detail}</Text>
                                  ) : null}
                                  {line.standard ? (
                                    <Text style={[styles.muted, { fontSize: 8 }]}>
                                      Standard: {line.standard}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={styles.cQty}>
                                  {line.quantity}
                                  {line.unit ? ` ${line.unit}` : ''}
                                </Text>
                                <Text style={styles.cUnit}>
                                  {formatPence(line.unit_price_pence, quote.currency)}
                                </Text>
                                <Text style={[styles.cTotal, styles.bold]}>
                                  {formatPence(line.line_total_pence, quote.currency)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ),
                      )
                    : null}
                  {quote.show_line_items && optionalLines.length > 0 ? (
                    <View>
                      <Text style={styles.groupLabel}>Optional extras</Text>
                      <View style={styles.tHead}>
                        <Text style={[styles.th, styles.cDesc]}>Option</Text>
                        <Text style={[styles.th, styles.cQty]}>Qty</Text>
                        <Text style={[styles.th, styles.cUnit]}>Price</Text>
                        <Text style={[styles.th, styles.cTotal]}>Selected</Text>
                      </View>
                      {optionalLines.map((line) => (
                        <View key={line.id} style={styles.tRow}>
                          <View style={styles.cDesc}>
                            <Text style={styles.bold}>{line.description}</Text>
                            {line.detail ? (
                              <Text style={[styles.muted, { fontSize: 8 }]}>{line.detail}</Text>
                            ) : null}
                            {line.standard ? (
                              <Text style={[styles.muted, { fontSize: 8 }]}>
                                Standard: {line.standard}
                              </Text>
                            ) : null}
                            {line.option_group ? (
                              <Text style={[styles.muted, { fontSize: 8 }]}>
                                Choose one from: {line.option_group}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.cQty}>
                            {line.quantity}
                            {line.unit ? ` ${line.unit}` : ''}
                          </Text>
                          <Text style={styles.cUnit}>
                            {formatPence(line.line_total_pence, quote.currency)}
                          </Text>
                          <Text style={[styles.cTotal, styles.bold]}>
                            {line.client_selected === true ? 'Yes' : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.systemTotal}>
                    Total:{' '}
                    <Text style={[styles.bold, { color: '#0f172a' }]}>
                      {formatPence(systemTotal, quote.currency)}
                    </Text>
                  </Text>
                </View>
              ) : null}
            </View>
          )
        })}

        {/* Equipment specification (opt-in) */}
        {equipmentSpecSections.length > 0 ? (
          <View style={styles.specSection}>
            <Text style={styles.specSectionTitle}>Equipment specification</Text>
            <Text style={styles.muted}>
              Official part numbers and specifications for the equipment supplied.
            </Text>
            {equipmentSpecSections.map(({ system, rows }) => (
              <View key={system.id} style={styles.specGroup} wrap={false}>
                <Text style={styles.specGroupTitle}>
                  {system.system_name || quoteTypeLabel(quote.quote_type)}
                </Text>
                <View style={styles.tHead}>
                  <Text style={[styles.th, styles.cPart]}>Part number</Text>
                  <Text style={[styles.th, styles.cSpec]}>Specification</Text>
                  <Text style={[styles.th, styles.cSpecQty]}>Qty</Text>
                </View>
                {rows.map((row) => (
                  <View key={row.id} style={styles.tRow}>
                    <Text style={styles.cPart}>{row.partNumber}</Text>
                    <View style={styles.cSpec}>
                      <Text style={styles.bold}>{row.standardDescription}</Text>
                      {row.specDetail ? (
                        <Text style={styles.lineDetail}>{row.specDetail}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.cSpecQty}>
                      {row.quantity}
                      {row.unit ? ` ${row.unit}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Totals */}
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Subtotal</Text>
              <Text>{formatPence(quote.subtotal_pence, quote.currency)}</Text>
            </View>
            {quote.discount_pence > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.muted}>Discount applied</Text>
                <Text>-{formatPence(quote.discount_pence, quote.currency)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>VAT ({quote.vat_rate}%)</Text>
              <Text>{formatPence(quote.vat_pence, quote.currency)}</Text>
            </View>
            <View style={styles.totalsFinal}>
              <Text style={styles.totalsFinalText}>Total</Text>
              <Text style={styles.totalsFinalText}>{formatPence(quote.total_pence, quote.currency)}</Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        {quote.terms ? (
          <View style={styles.terms} wrap={false}>
            <Text style={[styles.bold, { marginBottom: 3 }]}>Terms &amp; Conditions</Text>
            <Text style={styles.termsText}>{quote.terms}</Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          fixed
          render={() =>
            `${companyName}${company?.registration_number ? `  -  Reg. ${company.registration_number}` : ''}${
              company?.vat_number ? `  -  VAT ${company.vat_number}` : ''
            }`
          }
        />
      </Page>
    </Document>
  )
}

// Render the quote to a PDF Buffer (server-side). Used to attach the quote to
// the "send quote" email.
export async function renderQuotePdfBuffer(args: {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  company: CompanyInfo | null
  catalogue?: SpecCatalogueItem[]
}): Promise<Buffer> {
  return renderToBuffer(<QuotePdfDocument {...args} />)
}

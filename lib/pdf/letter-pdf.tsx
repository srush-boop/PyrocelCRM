import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { CompanyInfo } from '@/lib/types/database'

// Shared palette with the quote PDF so generated letters look on-brand.
const HEADER_COLOR = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: '#0f172a',
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  header: {
    backgroundColor: HEADER_COLOR,
    color: '#ffffff',
    marginHorizontal: -48,
    marginTop: -36,
    paddingHorizontal: 48,
    paddingVertical: 20,
    marginBottom: 28,
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
  headerSub: { fontSize: 8, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  logo: { maxHeight: 40, maxWidth: 150, objectFit: 'contain' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 3,
  },
  recipientName: { fontFamily: 'Helvetica-Bold' },
  date: { textAlign: 'right', color: MUTED },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  paragraph: { marginBottom: 10 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    fontSize: 7,
    color: MUTED,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

export interface LetterPdfArgs {
  company: CompanyInfo | null
  title?: string | null
  bodyText: string
  recipientName?: string | null
  recipientAddress?: string | null
  date?: string
}

// Split the merged body into paragraphs on blank lines; keep single newlines as
// soft breaks within a paragraph.
function toParagraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function LetterDocument({ company, title, bodyText, recipientName, recipientAddress, date }: LetterPdfArgs) {
  const companyName = company?.name || 'Pyrocel Ltd'
  const dateStr =
    date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const footerBits = [
    company?.registration_number ? `Reg. no. ${company.registration_number}` : null,
    company?.vat_number ? `VAT ${company.vat_number}` : null,
    company?.website || null,
  ].filter(Boolean) as string[]

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{companyName}</Text>
            {company?.address ? <Text style={styles.headerSub}>{company.address}</Text> : null}
            {company?.phone || company?.email ? (
              <Text style={styles.headerSub}>
                {[company?.phone, company?.email].filter(Boolean).join('  ·  ')}
              </Text>
            ) : null}
          </View>
          {company?.logo_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={company.logo_url} style={styles.logo} />
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.sectionLabel}>To</Text>
            {recipientName ? <Text style={styles.recipientName}>{recipientName}</Text> : null}
            {recipientAddress
              ? recipientAddress
                  .split('\n')
                  .map((line, i) => <Text key={i}>{line}</Text>)
              : null}
          </View>
          <View>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
        </View>

        {title ? <Text style={styles.title}>{title}</Text> : null}

        {toParagraphs(bodyText).map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}

        <View style={styles.footer} fixed>
          <Text>{companyName}</Text>
          <Text>{footerBits.join('  ·  ')}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderLetterPdfBuffer(args: LetterPdfArgs): Promise<Buffer> {
  return renderToBuffer(<LetterDocument {...args} />)
}

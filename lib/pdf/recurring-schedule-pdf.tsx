import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'
import { formatPence } from '@/lib/billing/invoices'
import { PYROCEL_RED } from '@/lib/service-colors'
import type { CompanyInfo } from '@/lib/types/database'
import type { ClientRecurringSchedule } from '@/lib/billing/recurring-schedule'

const HEADER_COLOR = PYROCEL_RED
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const INK = '#0f172a'

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
  docSub: { fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
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
  accountBlock: { marginBottom: 18 },
  accountHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: HEADER_COLOR,
    paddingBottom: 4,
    marginBottom: 4,
  },
  accountName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  accountRef: { fontSize: 8, color: MUTED, marginTop: 1 },
  accountTotal: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 3,
    marginBottom: 2,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'dashed',
    paddingVertical: 4,
  },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: MUTED },
  cDesc: { flex: 1, paddingRight: 8 },
  cFreq: { width: 74, paddingRight: 6 },
  cNext: { width: 66, paddingRight: 6 },
  cCover: { width: 92, paddingRight: 6 },
  cPer: { width: 60, textAlign: 'right' },
  cAnnual: { width: 64, textAlign: 'right' },
  subLabel: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  grandTotal: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  grandTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 240,
    borderTopWidth: 1,
    borderTopColor: INK,
    paddingTop: 6,
  },
  grandTotalText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  empty: { marginTop: 40, textAlign: 'center', color: MUTED },
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
})

function ScheduleDocument({
  clientName,
  schedule,
  company,
  generatedAt,
}: {
  clientName: string
  schedule: ClientRecurringSchedule
  company: CompanyInfo | null
  generatedAt: Date
}) {
  const companyName = company?.name || 'Pyrocel Ltd'

  return (
    <Document title={`Recurring billing schedule - ${clientName}`}>
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.docLabel}>Billing Schedule</Text>
            <Text style={styles.docSub}>Recurring charges</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={[styles.metaCol, { paddingRight: 24 }]}>
            <Text style={styles.sectionLabel}>Client</Text>
            <Text style={styles.bold}>{clientName}</Text>
          </View>
          <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
            <View style={styles.metaPair}>
              <Text style={styles.metaKey}>Generated</Text>
              <Text style={styles.bold}>{formatDateUK(generatedAt.toISOString())}</Text>
            </View>
            <View style={styles.metaPair}>
              <Text style={styles.metaKey}>Active charges</Text>
              <Text style={styles.bold}>{schedule.chargeCount}</Text>
            </View>
          </View>
        </View>

        {schedule.groups.length === 0 ? (
          <Text style={styles.empty}>
            This client has no active recurring charges configured.
          </Text>
        ) : (
          schedule.groups.map((group) => (
            <View key={group.accountId} style={styles.accountBlock} wrap={false}>
              <View style={styles.accountHead}>
                <View>
                  <Text style={styles.accountName}>{group.accountName}</Text>
                  {group.sageAccountRef ? (
                    <Text style={styles.accountRef}>Sage A/C {group.sageAccountRef}</Text>
                  ) : null}
                </View>
                <Text style={styles.accountTotal}>
                  {formatPence(group.annualValuePence)} / yr
                </Text>
              </View>

              <View style={styles.tHead}>
                <Text style={[styles.th, styles.cDesc]}>Charge</Text>
                <Text style={[styles.th, styles.cFreq]}>Frequency</Text>
                <Text style={[styles.th, styles.cNext]}>Next due</Text>
                <Text style={[styles.th, styles.cCover]}>Covers</Text>
                <Text style={[styles.th, styles.cPer]}>Per invoice</Text>
                <Text style={[styles.th, styles.cAnnual]}>Annual</Text>
              </View>

              {group.rows.map((row) => (
                <View key={row.id} style={styles.tRow} wrap={false}>
                  <View style={styles.cDesc}>
                    <Text>{row.description}</Text>
                    {row.systemService ? (
                      <Text style={styles.subLabel}>{row.systemService}</Text>
                    ) : null}
                  </View>
                  <View style={styles.cFreq}>
                    <Text>{row.frequencyLabel}</Text>
                    <Text style={styles.subLabel}>{row.timingLabel}</Text>
                  </View>
                  <Text style={styles.cNext}>{formatDateUK(row.nextDueDate)}</Text>
                  <Text style={[styles.cCover, styles.muted]}>{row.coveragePeriod}</Text>
                  <Text style={styles.cPer}>{formatPence(row.perOccurrencePence)}</Text>
                  <Text style={[styles.cAnnual, styles.bold]}>
                    {formatPence(row.annualValuePence)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* Grand total */}
        {schedule.groups.length > 0 ? (
          <View style={styles.grandTotal}>
            <View style={styles.grandTotalBox}>
              <Text style={styles.grandTotalText}>Total annual recurring value</Text>
              <Text style={styles.grandTotalText}>
                {formatPence(schedule.totalAnnualValuePence)}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {[
            companyName,
            company?.registration_number ? `Reg. No. ${company.registration_number}` : null,
            company?.vat_number ? `VAT No. ${company.vat_number}` : null,
            'Schedule is indicative and excludes VAT. Amounts follow the current live prices.',
          ]
            .filter(Boolean)
            .join('   ·   ')}
        </Text>
      </Page>
    </Document>
  )
}

export async function renderRecurringSchedulePdfBuffer(args: {
  clientName: string
  schedule: ClientRecurringSchedule
  company: CompanyInfo | null
  generatedAt?: Date
}): Promise<Buffer> {
  return renderToBuffer(
    <ScheduleDocument
      clientName={args.clientName}
      schedule={args.schedule}
      company={args.company}
      generatedAt={args.generatedAt ?? new Date()}
    />,
  )
}

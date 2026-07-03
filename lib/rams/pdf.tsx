import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'
import { riskScore, riskBand, riskCellColor } from '@/lib/rams/risk'
import type { RamsDocument, RamsCompanySettings } from '@/lib/rams/types'

const HEADER_COLOR = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    color: '#0f172a',
    fontFamily: 'Helvetica',
  },
  header: {
    backgroundColor: HEADER_COLOR,
    color: '#ffffff',
    marginHorizontal: -40,
    marginTop: -36,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 20,
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
  headerRight: { textAlign: 'right' },
  headerLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  metaCol: { width: '50%', marginBottom: 6 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 2,
  },
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
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 3,
    marginBottom: 2,
    backgroundColor: '#f8fafc',
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'dashed',
    paddingVertical: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    color: MUTED,
  },
  cHazard: { width: '34%', paddingRight: 6 },
  cRisk: { width: '13%', textAlign: 'center' },
  cControls: { width: '40%', paddingLeft: 6 },
  riskChip: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    paddingVertical: 2,
    borderRadius: 2,
    textAlign: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 8,
    marginRight: 4,
    marginBottom: 4,
  },
  step: { flexDirection: 'row', marginBottom: 4 },
  stepNum: { width: 18, fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    fontSize: 7,
    color: MUTED,
  },
})

function RiskChip({ l, s }: { l: number; s: number }) {
  const score = riskScore(l, s)
  return (
    <Text
      style={[styles.riskChip, { backgroundColor: riskCellColor(score) }]}
    >
      {score} {riskBand(score).toUpperCase()}
    </Text>
  )
}

function RamsPdfDocument({
  doc,
  settings,
  clientName,
  siteName,
  preparedByName,
}: {
  doc: RamsDocument
  settings: RamsCompanySettings | null
  clientName: string | null
  siteName: string | null
  preparedByName: string | null
}) {
  const company = settings?.company_name || 'Pyrocel Fire & Security'
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>{company}</Text>
            <Text style={styles.headerSub}>
              Risk Assessment &amp; Method Statement
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{doc.rams_number}</Text>
            <Text style={styles.headerSub}>
              Revision {doc.revision} · {doc.status.replace('_', ' ')}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{doc.title}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Client</Text>
            <Text>{clientName || '—'}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Site / Location</Text>
            <Text>{doc.work_location || siteName || '—'}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Job Number</Text>
            <Text>{doc.job_number || '—'}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Planned Dates</Text>
            <Text>
              {doc.planned_start_date ? formatDateUK(doc.planned_start_date) : '—'}
              {' — '}
              {doc.no_end_date
                ? 'Ongoing'
                : doc.planned_end_date
                  ? formatDateUK(doc.planned_end_date)
                  : '—'}
            </Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Prepared By</Text>
            <Text>{preparedByName || '—'}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.sectionLabel}>Prepared Date</Text>
            <Text>
              {doc.prepared_date ? formatDateUK(doc.prepared_date) : '—'}
            </Text>
          </View>
        </View>

        {doc.work_description && (
          <>
            <Text style={styles.sectionTitle}>Description of Works</Text>
            <Text style={styles.paragraph}>{doc.work_description}</Text>
          </>
        )}

        <Text style={styles.sectionTitle}>Risk Assessment</Text>
        <View style={styles.tHead}>
          <Text style={[styles.th, styles.cHazard]}>Hazard</Text>
          <Text style={[styles.th, styles.cRisk]}>Initial</Text>
          <Text style={[styles.th, styles.cRisk]}>Residual</Text>
          <Text style={[styles.th, styles.cControls]}>Control Measures</Text>
        </View>
        {(doc.selected_hazards || []).map((h, i) => (
          <View key={i} style={styles.tRow} wrap={false}>
            <View style={styles.cHazard}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{h.description}</Text>
              {h.potential_consequences ? (
                <Text style={{ color: MUTED, fontSize: 8 }}>
                  {h.potential_consequences}
                </Text>
              ) : null}
            </View>
            <View style={styles.cRisk}>
              <RiskChip l={h.likelihood} s={h.severity} />
            </View>
            <View style={styles.cRisk}>
              <RiskChip l={h.residual_likelihood} s={h.residual_severity} />
            </View>
            <View style={styles.cControls}>
              {(h.controls || []).map((c, ci) => (
                <Text key={ci} style={{ fontSize: 8 }}>
                  • {c}
                </Text>
              ))}
            </View>
          </View>
        ))}

        {doc.ppe_requirements?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>PPE Requirements</Text>
            <View style={styles.chipRow}>
              {doc.ppe_requirements.map((p, i) => (
                <Text key={i} style={styles.chip}>
                  {p}
                </Text>
              ))}
            </View>
          </>
        )}

        {doc.equipment_list?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Equipment &amp; Tools</Text>
            <View style={styles.chipRow}>
              {doc.equipment_list.map((p, i) => (
                <Text key={i} style={styles.chip}>
                  {p}
                </Text>
              ))}
            </View>
          </>
        )}

        {doc.method_steps?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Method Statement</Text>
            {doc.method_steps.map((s, i) => (
              <View key={i} style={styles.step} wrap={false}>
                <Text style={styles.stepNum}>{s.step}.</Text>
                <Text style={{ flex: 1, lineHeight: 1.4 }}>{s.description}</Text>
              </View>
            ))}
          </>
        )}

        {(doc.emergency_procedures || doc.emergency_hospital_info) && (
          <>
            <Text style={styles.sectionTitle}>Emergency Arrangements</Text>
            {doc.emergency_procedures ? (
              <Text style={styles.paragraph}>{doc.emergency_procedures}</Text>
            ) : null}
            {doc.emergency_hospital_info?.name ? (
              <Text style={styles.paragraph}>
                Nearest hospital: {doc.emergency_hospital_info.name}
                {doc.emergency_hospital_info.address
                  ? `, ${doc.emergency_hospital_info.address}`
                  : ''}
                {doc.emergency_hospital_info.phone
                  ? ` (${doc.emergency_hospital_info.phone})`
                  : ''}
              </Text>
            ) : null}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>
            {company} · {doc.rams_number} · Rev {doc.revision}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

export async function renderRamsPdf(args: {
  doc: RamsDocument
  settings: RamsCompanySettings | null
  clientName: string | null
  siteName: string | null
  preparedByName: string | null
}): Promise<Buffer> {
  return renderToBuffer(<RamsPdfDocument {...args} />)
}

import type { ComponentProps, ReactNode } from 'react'
import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { formatDateUK } from '@/lib/utils'
import { riskScore } from '@/lib/rams/risk'
import { styles, PYROCEL_RED, PYROCEL_GRAY, PYROCEL_GRAY_MEDIUM } from '@/lib/rams/pdf-styles'
import type { RamsDocument, RamsCompanySettings } from '@/lib/rams/types'

export interface RamsPdfSignOff {
  name: string
  signedAt: string | null
  signatureUrl: string | null
}

interface RamsPdfArgs {
  doc: RamsDocument
  settings: RamsCompanySettings | null
  clientName: string | null
  siteName: string | null
  siteAddress?: string | null
  templateName?: string | null
  preparedByName: string | null
  preparedByRole?: string | null
  preparedBySignatureUrl?: string | null
  approvedByName?: string | null
  engineerSignOffs?: RamsPdfSignOff[]
}

const STANDARDS = [
  'Health and Safety at Work etc. Act 1974',
  'Management of Health and Safety at Work Regulations 1999',
  'Construction (Design and Management) Regulations 2015 (CDM)',
  'Work at Height Regulations 2005',
  'Electricity at Work Regulations 1989',
  'BS 7671 - Requirements for Electrical Installations (IET Wiring Regulations)',
  'Relevant system-specific British Standards (BS 5839, BS 5266, BS EN 50131, etc.)',
]

const TRAINING = [
  'All operatives hold valid CSCS cards appropriate to their role',
  'Relevant electrical competence certifications (e.g. BS 7671, ECS card)',
  'Manufacturer training on specific equipment being installed/maintained',
  'Working at Height training where applicable (IPAF, PASMA)',
  'Asbestos Awareness training (Category A)',
  'First Aid trained personnel available on site',
]

const RESPONSIBILITIES = [
  'All personnel must read and understand this RAMS before commencing work',
  'Site induction to be completed and documented',
  'Dynamic risk assessment to be conducted on arrival at site',
  'Stop work if conditions change or unsafe situations arise',
  'Report all accidents, incidents, and near misses immediately',
]

const HIERARCHY = [
  'ELIMINATION - Remove the hazard completely from the workplace',
  'SUBSTITUTION - Replace the hazard with something less dangerous',
  'ENGINEERING CONTROLS - Isolate people from the hazard (guards, barriers, ventilation)',
  'ADMINISTRATIVE CONTROLS - Change the way people work (procedures, training, signage)',
  'PPE - Personal Protective Equipment as the last line of defence',
]

function riskStyle(score: number) {
  if (score <= 4) return styles.riskLow
  if (score <= 9) return styles.riskMedium
  if (score <= 16) return styles.riskHigh
  return styles.riskCritical
}

function cellColor(score: number): string {
  if (score <= 4) return '#22C55E'
  if (score <= 9) return '#EAB308'
  if (score <= 16) return '#F97316'
  return '#DC2626'
}

function riskLabel(score: number): string {
  if (score <= 4) return 'LOW'
  if (score <= 9) return 'MEDIUM'
  if (score <= 16) return 'HIGH'
  return 'CRITICAL'
}

function statusColor(status: string) {
  if (status === 'approved') return '#22C55E'
  if (status === 'draft') return '#F59E0B'
  if (status === 'rejected') return '#DC2626'
  return '#3B82F6'
}

function fmt(date: string | null | undefined) {
  return date ? formatDateUK(date) : null
}

function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionNumber}>
          <Text style={styles.sectionNumberText}>{number}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionDivider} />
      <View style={styles.sectionContent}>{children}</View>
    </View>
  )
}

function PageHeader({ brand, title, ramsNumber, revision }: { brand: string; title: string; ramsNumber: string; revision: number }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.companyName}>{brand}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.docNumber}>{ramsNumber}</Text>
        <View style={styles.revisionBadge}>
          <Text style={styles.revisionText}>REV {revision}</Text>
        </View>
      </View>
    </View>
  )
}

function PageFooter({ brand, ramsNumber, revision }: { brand: string; ramsNumber: string; revision: number }) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerLeft}>
        <Text style={styles.footerLogo}>{brand}</Text>
        <View style={styles.footerDivider} />
        <Text style={styles.footerDoc}>
          {ramsNumber} | Rev.{revision}
        </Text>
      </View>
      <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last ? { borderBottomWidth: 0 } : {}]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function BulletBox({
  title,
  items,
  bullet,
  boxStyle,
  titleColor,
  textColor,
}: {
  title: string
  items: string[]
  bullet: string
  boxStyle: ComponentProps<typeof View>['style']
  titleColor?: string
  textColor?: string
}) {
  return (
    <View style={boxStyle}>
      <Text style={[styles.standardsTitle, titleColor ? { color: titleColor } : {}]}>{title}</Text>
      <View style={styles.standardsList}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.standardsItem}>
            <Text style={[styles.standardsBullet, textColor ? { color: titleColor ?? textColor } : {}]}>{bullet}</Text>
            <Text style={[styles.standardsText, textColor ? { color: textColor } : {}]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function RiskMatrix({ likelihood, severity, label }: { likelihood: number; severity: number; label: string }) {
  const score = riskScore(likelihood, severity)
  return (
    <View style={styles.matrixContainer}>
      <Text style={styles.matrixTitle}>{label}</Text>
      <View style={styles.matrixGrid}>
        {[5, 4, 3, 2, 1].map((l) => (
          <View key={l} style={styles.matrixRow}>
            <View style={styles.matrixLabelCell}>
              <Text style={styles.matrixLabelText}>{l}</Text>
            </View>
            {[1, 2, 3, 4, 5].map((s) => {
              const selected = l === likelihood && s === severity
              return (
                <View
                  key={s}
                  style={[styles.matrixCell, { backgroundColor: cellColor(l * s) }, selected ? styles.matrixSelectedRing : {}]}
                >
                  <Text style={[styles.matrixCellText, selected ? { fontSize: 8 } : {}]}>{l * s}</Text>
                </View>
              )
            })}
          </View>
        ))}
        <View style={styles.matrixRow}>
          <View style={styles.matrixLabelCell} />
          {[1, 2, 3, 4, 5].map((s) => (
            <View key={s} style={styles.matrixLabelCell}>
              <Text style={styles.matrixLabelText}>{s}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.matrixAxisLabel}>Severity →</Text>
      </View>
      <View style={styles.matrixScoreSummary}>
        <View style={[styles.matrixScoreChip, { backgroundColor: cellColor(score) }]}>
          <Text style={styles.matrixScoreChipText}>{score}</Text>
        </View>
        <Text style={styles.matrixScoreLevelText}>
          {riskLabel(score)} RISK (L{likelihood} × S{severity})
        </Text>
      </View>
    </View>
  )
}

function RamsPdfDocument({
  doc,
  settings,
  clientName,
  siteName,
  siteAddress,
  templateName,
  preparedByName,
  preparedByRole,
  preparedBySignatureUrl,
  approvedByName,
  engineerSignOffs = [],
}: RamsPdfArgs) {
  const company = settings?.company_name || 'Pyrocel Fire & Security'
  const brand = 'PYROCEL'
  const hazards = doc.selected_hazards || []
  const steps = doc.method_steps || []
  const hospital = doc.emergency_hospital_info
  const location = doc.work_location || siteAddress || siteName || 'Not specified'
  const preparedBy = preparedByName
    ? preparedByRole
      ? `${preparedByName} (${preparedByRole})`
      : preparedByName
    : 'Not specified'
  const workPeriod = [
    fmt(doc.planned_start_date),
    doc.no_end_date ? 'onwards (no fixed end date)' : fmt(doc.planned_end_date) ? `to ${fmt(doc.planned_end_date)}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const header = (title: string) => (
    <PageHeader brand={brand} title={title} ramsNumber={doc.rams_number} revision={doc.revision} />
  )
  const footer = <PageFooter brand={brand} ramsNumber={doc.rams_number} revision={doc.revision} />
  // Blank lines on the sign-on sheet so engineers can sign a printed copy on site.
  const blankSignOffRows = Math.max(0, 6 - engineerSignOffs.length)

  return (
    <Document title={`${doc.rams_number} - ${doc.title}`} author={company}>
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverHeader}>
          <Text style={styles.coverTitleSmall}>Risk Assessment &amp; Method Statement</Text>
          <Text style={styles.coverTitle}>{company.toUpperCase()}</Text>
        </View>

        <View style={styles.coverBody}>
          <View style={styles.coverInfoGrid}>
            <View style={styles.coverInfoBlock}>
              <Text style={styles.coverInfoLabel}>Document Reference</Text>
              <Text style={styles.coverInfoValue}>{doc.rams_number}</Text>
            </View>
            <View style={styles.coverInfoBlock}>
              <Text style={styles.coverInfoLabel}>Revision</Text>
              <Text style={styles.coverInfoValue}>{doc.revision}</Text>
            </View>
            <View style={[styles.coverInfoBlock, { width: '100%' }]}>
              <Text style={styles.coverInfoLabel}>Title</Text>
              <Text style={styles.coverInfoValue}>{doc.title}</Text>
            </View>
            <View style={styles.coverInfoBlock}>
              <Text style={styles.coverInfoLabel}>Client</Text>
              <Text style={styles.coverInfoValueSmall}>{clientName || 'N/A'}</Text>
            </View>
            <View style={styles.coverInfoBlock}>
              <Text style={styles.coverInfoLabel}>Site</Text>
              <Text style={styles.coverInfoValueSmall}>{siteName || 'N/A'}</Text>
            </View>
            {doc.job_number ? (
              <View style={styles.coverInfoBlock}>
                <Text style={styles.coverInfoLabel}>Job Number</Text>
                <Text style={styles.coverInfoValueSmall}>{doc.job_number}</Text>
              </View>
            ) : null}
            {workPeriod ? (
              <View style={styles.coverInfoBlock}>
                <Text style={styles.coverInfoLabel}>Work Period</Text>
                <Text style={styles.coverInfoValueSmall}>{workPeriod}</Text>
              </View>
            ) : null}
            <View style={[styles.coverInfoBlock, { width: '100%' }]}>
              <Text style={styles.coverInfoLabel}>Site Location</Text>
              <Text style={styles.coverInfoValueSmall}>{location}</Text>
            </View>
          </View>

          <View style={[styles.coverStatus, { backgroundColor: statusColor(doc.status) }]}>
            <Text style={styles.coverStatusText}>{doc.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.coverFooter}>
          <View>
            <Text style={[styles.coverFooterText, { fontWeight: 'bold', color: PYROCEL_RED }]}>{company}</Text>
            <Text style={styles.coverFooterText}>
              {settings?.company_phone || 'Fire | Security | Safety Systems'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.coverFooterText}>Created: {fmt(doc.created_at)}</Text>
            {doc.approved_date ? <Text style={styles.coverFooterText}>Approved: {fmt(doc.approved_date)}</Text> : null}
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        {header('Risk Assessment & Method Statement')}
        <View style={styles.openingStatement}>
          <Text style={styles.openingStatementText}>
            All works will be carried out in accordance with relevant British Standards, statutory legislation,
            third-party certification requirements, and internal quality management procedures to ensure systems are
            safe, compliant, and fit for purpose. This document provides a comprehensive risk assessment and method
            statement for the works described herein, establishing safe working practices and control measures to
            protect all persons who may be affected by the work activities.
          </Text>
        </View>

        <Section number="1" title="Document Information">
          <InfoRow label="Document Title" value={doc.title} />
          {templateName ? <InfoRow label="Template" value={templateName} /> : null}
          <InfoRow label="Client" value={clientName || 'N/A'} />
          <InfoRow label="Site" value={siteName || 'N/A'} />
          <InfoRow label="Work Location" value={location} />
          {doc.job_number ? <InfoRow label="Job Number" value={doc.job_number} /> : null}
          {workPeriod ? <InfoRow label="Work Period" value={workPeriod} /> : null}
          <InfoRow label="Prepared By" value={preparedBy} />
          <InfoRow label="Prepared Date" value={fmt(doc.prepared_date) || 'Not specified'} last />
        </Section>

        {doc.key_personnel?.length > 0 ? (
          <Section number="1a" title="Key Personnel">
            {doc.key_personnel.map((p, i) => (
              <InfoRow
                key={i}
                label={p.role || 'Personnel'}
                value={p.phone ? `${p.name} · ${p.phone}` : p.name}
                last={i === doc.key_personnel.length - 1}
              />
            ))}
          </Section>
        ) : null}
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        {header('Standards, Training & Competence')}
        <Section number="2" title="Standards, Training &amp; Competence">
          <BulletBox title="Applicable Standards & Legislation" items={STANDARDS} bullet="•" boxStyle={styles.standardsBox} />
          <BulletBox
            title="Training & Competence Requirements"
            items={TRAINING}
            bullet="✓"
            boxStyle={styles.trainingBox}
            textColor="#166534"
          />
          <BulletBox
            title="Health & Safety Responsibilities"
            items={RESPONSIBILITIES}
            bullet="!"
            boxStyle={[styles.standardsBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderLeftColor: PYROCEL_RED }]}
            titleColor={PYROCEL_RED}
            textColor="#7F1D1D"
          />
        </Section>
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        {header('Scope of Works')}
        <Section number="3" title="Scope of Works">
          <Text style={styles.contentText}>{doc.work_description || 'Not specified'}</Text>
        </Section>

        <Section number="4" title="Site Specific Considerations">
          {doc.site_specific_considerations ? (
            <Text style={styles.contentText}>{doc.site_specific_considerations}</Text>
          ) : (
            <View style={styles.siteConsiderations}>
              <Text style={styles.siteConsiderationsPlaceholder}>
                Site-specific considerations to be confirmed on site. Consider: access restrictions, permit
                requirements, working hours, occupied premises, high-risk areas, coordination with other contractors,
                client-specific requirements, environmental factors, and any hazards not covered in the general risk
                assessment.
              </Text>
            </View>
          )}
        </Section>

        <Section number="5" title="PPE &amp; Equipment Requirements">
          <View style={{ marginBottom: 15 }}>
            <Text style={[styles.controlsTitle, { marginBottom: 10 }]}>Required PPE</Text>
            <View style={styles.ppeGrid}>
              {doc.ppe_requirements?.length ? (
                doc.ppe_requirements.map((ppe, idx) => (
                  <Text key={idx} style={styles.ppeBadge}>
                    {ppe}
                  </Text>
                ))
              ) : (
                <Text style={{ fontSize: 9, color: PYROCEL_GRAY }}>None specified</Text>
              )}
            </View>
          </View>
          {doc.additional_ppe?.length ? (
            <View style={{ marginBottom: 15 }}>
              <Text style={[styles.controlsTitle, { marginBottom: 10 }]}>Additional PPE (task / site specific)</Text>
              <View style={styles.ppeGrid}>
                {doc.additional_ppe.map((ppe, idx) => (
                  <Text key={idx} style={styles.ppeBadge}>
                    {ppe}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
          {doc.equipment_list?.length ? (
            <View style={styles.equipmentList}>
              <Text style={[styles.controlsTitle, { marginBottom: 10 }]}>Equipment Required</Text>
              {doc.equipment_list.map((item, idx) => (
                <View key={idx} style={styles.equipmentItem}>
                  <Text style={styles.equipmentBullet}>▸</Text>
                  <Text style={styles.equipmentText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Section>
        {footer}
      </Page>

      <Page size="A4" style={styles.page} wrap>
        {header('Method Statement')}
        <Section number="6" title="Method Statement">
          {steps.length ? (
            steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 6 }} wrap={false}>
                <Text style={{ width: 20, fontSize: 9, fontWeight: 'bold', color: PYROCEL_RED }}>{s.step}.</Text>
                <Text style={[styles.contentText, { flex: 1 }]}>{s.description}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.contentText}>Not specified</Text>
          )}
        </Section>

        {doc.emergency_procedures ? (
          <Section number="7" title="Emergency Procedures">
            <Text style={styles.contentText}>{doc.emergency_procedures}</Text>
          </Section>
        ) : null}

        {hospital?.name ? (
          <Section number="8" title="Emergency Hospital Information">
            <View style={{ marginBottom: 8 }} wrap={false}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: PYROCEL_RED, marginBottom: 4 }}>{hospital.name}</Text>
              {hospital.type || hospital.opening_hours ? (
                <Text style={{ fontSize: 9, color: PYROCEL_GRAY, marginBottom: 2 }}>
                  {[hospital.type, hospital.opening_hours].filter(Boolean).join(' • ')}
                </Text>
              ) : null}
              {hospital.address ? (
                <Text style={{ fontSize: 9, marginBottom: 2 }}>
                  Address: {[hospital.address, hospital.postcode].filter(Boolean).join(', ')}
                </Text>
              ) : null}
              {hospital.phone ? <Text style={{ fontSize: 9, marginBottom: 2 }}>Telephone: {hospital.phone}</Text> : null}
              {hospital.distance ? (
                <Text style={{ fontSize: 9, marginBottom: 6 }}>Distance from site: {hospital.distance}</Text>
              ) : null}
              {hospital.services?.length ? (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 8, fontWeight: 'bold', color: PYROCEL_GRAY, marginBottom: 2 }}>
                    Services Available:
                  </Text>
                  <Text style={{ fontSize: 8 }}>{hospital.services.join(' • ')}</Text>
                </View>
              ) : null}
            </View>
            {hospital.emergency_text ? (
              <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 4 }} wrap={false}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#92400E', marginBottom: 4 }}>
                  Emergency Instructions
                </Text>
                <Text style={{ fontSize: 9, color: '#78350F', lineHeight: 1.4 }}>{hospital.emergency_text}</Text>
              </View>
            ) : null}
          </Section>
        ) : null}
        {footer}
      </Page>

      {hazards.length > 0 ? (
        <Page size="A4" style={styles.page} wrap>
          {header('Risk Assessment')}
          <Section number="9" title="Risk Assessment">
            <View style={styles.riskLegend}>
              <Text style={{ fontSize: 8, fontWeight: 'bold', color: PYROCEL_GRAY, marginRight: 10 }}>
                Risk Score = Likelihood × Severity:
              </Text>
              {[
                { s: styles.riskLow, t: 'Low (1-4)' },
                { s: styles.riskMedium, t: 'Medium (5-9)' },
                { s: styles.riskHigh, t: 'High (10-16)' },
                { s: styles.riskCritical, t: 'Critical (17-25)' },
              ].map((x) => (
                <View key={x.t} style={styles.riskLegendItem}>
                  <View style={[styles.riskLegendDot, x.s]} />
                  <Text style={styles.riskLegendText}>{x.t}</Text>
                </View>
              ))}
            </View>

            <View style={styles.hierarchyBox}>
              <Text style={styles.hierarchyTitle}>Hierarchy of Control Measures (in order of priority)</Text>
              {HIERARCHY.map((text, i) => (
                <View key={i} style={styles.hierarchyItem}>
                  <Text style={styles.hierarchyNumber}>{i + 1}.</Text>
                  <Text style={styles.hierarchyText}>{text}</Text>
                </View>
              ))}
            </View>
          </Section>

          {hazards.map((h, idx) => {
            const before = riskScore(h.likelihood, h.severity)
            const after = riskScore(h.residual_likelihood, h.residual_severity)
            return (
              <View key={idx} style={styles.hazardCard} wrap={false}>
                <View style={styles.hazardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={styles.hazardNumber}>
                      <Text style={styles.hazardNumberText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.hazardName}>{h.description}</Text>
                  </View>
                  <View style={styles.riskScoreContainer}>
                    <View style={styles.riskScoreBox}>
                      <Text style={styles.riskScoreLabel}>Initial</Text>
                      <View style={[styles.riskBadge, riskStyle(before)]}>
                        <Text style={styles.riskBadgeText}>{before}</Text>
                      </View>
                    </View>
                    <Text style={styles.riskArrow}>→</Text>
                    <View style={styles.riskScoreBox}>
                      <Text style={styles.riskScoreLabel}>Residual</Text>
                      <View style={[styles.riskBadge, riskStyle(after)]}>
                        <Text style={styles.riskBadgeText}>{after}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {h.potential_consequences ? (
                  <View style={styles.consequencesBox}>
                    <Text style={styles.consequencesLabel}>Potential Consequences</Text>
                    <Text style={styles.consequencesText}>{h.potential_consequences}</Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.matrixWrapper,
                    { padding: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: PYROCEL_GRAY_MEDIUM },
                  ]}
                >
                  <RiskMatrix likelihood={h.likelihood} severity={h.severity} label="Initial Risk (Before Controls)" />
                  <View style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 20 }}>
                    <Text style={{ fontSize: 18, color: PYROCEL_GRAY }}>→</Text>
                  </View>
                  <RiskMatrix
                    likelihood={h.residual_likelihood}
                    severity={h.residual_severity}
                    label="Residual Risk (After Controls)"
                  />
                </View>

                {h.controls?.length ? (
                  <View style={styles.controlsBox}>
                    <Text style={styles.controlsTitle}>Control Measures Applied</Text>
                    {h.controls.map((c, i) => (
                      <View key={i} style={styles.controlItem}>
                        <Text style={styles.controlCheck}>✓</Text>
                        <Text style={styles.controlText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.monitoringBox}>
                  <Text style={styles.monitoringLabel}>Ongoing Monitoring</Text>
                  <Text style={styles.monitoringText}>
                    Supervise works to ensure controls remain effective. Review and update if conditions change.
                  </Text>
                </View>
              </View>
            )
          })}
          {footer}
        </Page>
      ) : null}

      <Page size="A4" style={styles.page}>
        {header('Authorisation & Sign-Off')}
        <Section number="10" title="Document Authorisation">
          <View style={styles.signatureGrid}>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>Prepared By</Text>
              <Text style={styles.signatureName}>{preparedBy}</Text>
              <Text style={styles.signatureDate}>Date: {fmt(doc.prepared_date) || 'Pending'}</Text>
              {preparedBySignatureUrl ? (
                <Image src={preparedBySignatureUrl} style={{ width: 150, height: 50, marginTop: 10, objectFit: 'contain' }} />
              ) : (
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureLineLabel}>Signature</Text>
                </View>
              )}
            </View>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureLabel}>Approved By (on behalf of Pyrocel)</Text>
              <Text style={styles.signatureName}>{approvedByName || 'Pending'}</Text>
              <Text style={styles.signatureDate}>Date: {fmt(doc.approved_date) || 'Pending'}</Text>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureLineLabel}>Signature</Text>
              </View>
            </View>
          </View>
        </Section>

        <Section number="11" title="Engineer Acknowledgement">
          <Text style={[styles.contentText, { marginBottom: 12 }]}>
            I confirm that I have read and understood this Risk Assessment and Method Statement. I will follow the control
            measures and safe working practices described herein.
          </Text>
          <View style={[styles.tableHeader, { flexDirection: 'row' }]}>
            <Text style={[styles.tableHeaderText, { width: '40%' }]}>Engineer Name</Text>
            <Text style={[styles.tableHeaderText, { width: '40%' }]}>Signature</Text>
            <Text style={[styles.tableHeaderText, { width: '20%' }]}>Date</Text>
          </View>
          {engineerSignOffs.map((e, i) => (
            <View key={`e-${i}`} style={[styles.tableRow, { flexDirection: 'row', alignItems: 'center', minHeight: 34 }]} wrap={false}>
              <Text style={[styles.tableCell, { width: '40%' }]}>{e.name}</Text>
              <View style={{ width: '40%' }}>
                {e.signatureUrl ? (
                  <Image src={e.signatureUrl} style={{ height: 26, width: 110, objectFit: 'contain' }} />
                ) : (
                  <Text style={styles.tableCell}>Confirmed electronically</Text>
                )}
              </View>
              <Text style={[styles.tableCell, { width: '20%' }]}>{fmt(e.signedAt) || ''}</Text>
            </View>
          ))}
          {Array.from({ length: blankSignOffRows }).map((_, i) => (
            <View key={`b-${i}`} style={[styles.tableRow, { flexDirection: 'row', minHeight: 34 }]} wrap={false}>
              <Text style={[styles.tableCell, { width: '40%' }]}> </Text>
              <Text style={[styles.tableCell, { width: '40%' }]}> </Text>
              <Text style={[styles.tableCell, { width: '20%' }]}> </Text>
            </View>
          ))}
        </Section>
        {footer}
      </Page>
    </Document>
  )
}

export async function renderRamsPdf(args: RamsPdfArgs): Promise<Buffer> {
  return renderToBuffer(<RamsPdfDocument {...args} />)
}

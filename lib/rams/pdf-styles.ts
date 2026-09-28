import { StyleSheet } from '@react-pdf/renderer'

// Ported from the standalone Pyrocel RAMS app's document layout.
// Pyrocel Brand Colors
export const PYROCEL_RED = '#C41E3A'
export const PYROCEL_RED_DARK = '#9A1830'
export const PYROCEL_GRAY = '#5A5A5A'
export const PYROCEL_GRAY_LIGHT = '#F5F5F5'
export const PYROCEL_GRAY_MEDIUM = '#E8E8E8'

// Professional Modern PDF Styles
export const styles = StyleSheet.create({
  // Page Layouts
  page: {
    padding: 50,
    paddingBottom: 70,
    fontSize: 9,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  coverPage: {
    padding: 0,
    backgroundColor: '#FFFFFF',
  },
  
  // Cover Page Elements
  coverHeader: {
    backgroundColor: PYROCEL_RED,
    padding: 40,
    paddingTop: 60,
    paddingBottom: 60,
  },
  coverHeaderAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 150,
    height: 150,
    backgroundColor: PYROCEL_RED_DARK,
    opacity: 0.5,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 4,
  },
  coverTitleSmall: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  coverBody: {
    padding: 50,
    flex: 1,
  },
  coverInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 40,
  },
  coverInfoBlock: {
    width: '45%',
    marginBottom: 20,
  },
  coverInfoLabel: {
    fontSize: 8,
    color: PYROCEL_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  coverInfoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  coverInfoValueSmall: {
    fontSize: 11,
    color: '#333',
  },
  coverStatus: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  coverStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  coverFooter: {
    backgroundColor: PYROCEL_GRAY_LIGHT,
    padding: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coverFooterText: {
    fontSize: 8,
    color: PYROCEL_GRAY,
  },
  
  // Page Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 3,
    borderBottomColor: PYROCEL_RED,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PYROCEL_RED,
    letterSpacing: 0.5,
  },
  pageTitle: {
    fontSize: 9,
    color: PYROCEL_GRAY,
    marginTop: 2,
  },
  docNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  revisionBadge: {
    backgroundColor: PYROCEL_GRAY_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginTop: 4,
  },
  revisionText: {
    fontSize: 8,
    color: PYROCEL_GRAY,
  },

  // Section Styling
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  sectionNumber: {
    backgroundColor: PYROCEL_RED,
    color: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: PYROCEL_RED,
    marginTop: 8,
    marginBottom: 15,
  },
  sectionContent: {
    paddingLeft: 40,
  },

  // Opening Statement
  openingStatement: {
    backgroundColor: PYROCEL_GRAY_LIGHT,
    padding: 20,
    marginBottom: 25,
    borderLeftWidth: 4,
    borderLeftColor: PYROCEL_RED,
  },
  openingStatementText: {
    fontSize: 9,
    lineHeight: 1.7,
    color: '#333',
    fontStyle: 'italic',
  },

  // Info Rows
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PYROCEL_GRAY_MEDIUM,
  },
  infoLabel: {
    width: 130,
    fontSize: 9,
    fontWeight: 'bold',
    color: PYROCEL_GRAY,
  },
  infoValue: {
    flex: 1,
    fontSize: 9,
    color: '#1a1a1a',
  },

  // Standards Box
  standardsBox: {
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#B3D4FC',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    padding: 15,
    marginBottom: 15,
  },
  standardsTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 10,
  },
  standardsList: {
    paddingLeft: 5,
  },
  standardsItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  standardsBullet: {
    width: 12,
    fontSize: 9,
    color: '#2563EB',
  },
  standardsText: {
    flex: 1,
    fontSize: 8,
    color: '#1E3A5F',
    lineHeight: 1.4,
  },

  // Training Box
  trainingBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 12,
    marginBottom: 10,
  },
  trainingTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 8,
  },

  // Hierarchy of Controls
  hierarchyBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 12,
    marginBottom: 15,
  },
  hierarchyTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 8,
  },
  hierarchyItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hierarchyNumber: {
    width: 18,
    fontSize: 9,
    fontWeight: 'bold',
    color: PYROCEL_RED,
  },
  hierarchyText: {
    flex: 1,
    fontSize: 8,
    color: '#78350F',
    lineHeight: 1.4,
  },

  // Content Text
  contentText: {
    fontSize: 9,
    lineHeight: 1.7,
    color: '#333',
  },

  // Hazard Cards
  hazardCard: {
    marginBottom: 15,
    borderWidth: 1,
    borderColor: PYROCEL_GRAY_MEDIUM,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hazardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PYROCEL_GRAY_LIGHT,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: PYROCEL_GRAY_MEDIUM,
  },
  hazardNumber: {
    backgroundColor: PYROCEL_RED,
    color: '#FFFFFF',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  hazardNumberText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  hazardName: {
    flex: 1,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  riskScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskScoreBox: {
    alignItems: 'center',
  },
  riskScoreLabel: {
    fontSize: 6,
    color: PYROCEL_GRAY,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  riskBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  riskArrow: {
    fontSize: 12,
    color: PYROCEL_GRAY,
  },
  riskLow: { backgroundColor: '#22C55E' },
  riskMedium: { backgroundColor: '#EAB308' },
  riskHigh: { backgroundColor: '#F97316' },
  riskCritical: { backgroundColor: '#DC2626' },
  
  consequencesBox: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: PYROCEL_GRAY_MEDIUM,
  },
  consequencesLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 3,
  },
  consequencesText: {
    fontSize: 8,
    color: '#78350F',
    lineHeight: 1.4,
  },
  
  controlsBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  controlsTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PYROCEL_GRAY,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  controlItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  controlCheck: {
    width: 14,
    fontSize: 10,
    color: '#22C55E',
    fontWeight: 'bold',
  },
  controlText: {
    flex: 1,
    fontSize: 8,
    color: '#333',
    lineHeight: 1.4,
  },
  
  monitoringBox: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: PYROCEL_GRAY_MEDIUM,
  },
  monitoringLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 3,
  },
  monitoringText: {
    fontSize: 8,
    color: '#1E3A5F',
    lineHeight: 1.4,
  },

  // PPE Section
  ppeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ppeBadge: {
    backgroundColor: PYROCEL_RED,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 'bold',
  },
  
  equipmentList: {
    marginTop: 15,
  },
  equipmentItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  equipmentBullet: {
    width: 15,
    fontSize: 9,
    color: PYROCEL_RED,
  },
  equipmentText: {
    flex: 1,
    fontSize: 9,
    color: '#333',
  },

  // Site Considerations
  siteConsiderations: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: PYROCEL_GRAY_MEDIUM,
    borderStyle: 'dashed',
    padding: 15,
    minHeight: 80,
  },
  siteConsiderationsPlaceholder: {
    fontSize: 9,
    color: '#999',
    fontStyle: 'italic',
    lineHeight: 1.6,
  },

  // Signature Section
  signatureGrid: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  signatureBox: {
    flex: 1,
    backgroundColor: PYROCEL_GRAY_LIGHT,
    padding: 15,
    borderRadius: 4,
    borderTopWidth: 3,
    borderTopColor: PYROCEL_RED,
  },
  signatureLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PYROCEL_RED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  signatureName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  signatureDate: {
    fontSize: 9,
    color: PYROCEL_GRAY,
    marginBottom: 20,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: PYROCEL_GRAY,
    paddingTop: 6,
  },
  signatureLineLabel: {
    fontSize: 7,
    color: '#999',
    textAlign: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: PYROCEL_RED,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLogo: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PYROCEL_RED,
  },
  footerDivider: {
    width: 1,
    height: 12,
    backgroundColor: PYROCEL_GRAY_MEDIUM,
    marginHorizontal: 10,
  },
  footerDoc: {
    fontSize: 8,
    color: PYROCEL_GRAY,
  },
  footerPage: {
    fontSize: 8,
    color: PYROCEL_GRAY,
  },

  // Risk Matrix Grid (PDF-native 5x5)
  matrixWrapper: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 10,
  },
  matrixContainer: {
    flex: 1,
  },
  matrixTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PYROCEL_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  matrixGrid: {
    flexDirection: 'column',
  },
  matrixRow: {
    flexDirection: 'row',
  },
  matrixCell: {
    width: 22,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixCellText: {
    fontSize: 7,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  matrixLabelCell: {
    width: 22,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixLabelText: {
    fontSize: 6,
    color: PYROCEL_GRAY,
  },
  matrixAxisLabel: {
    fontSize: 6,
    color: PYROCEL_GRAY,
    textAlign: 'center',
    marginTop: 2,
  },
  matrixSelectedRing: {
    borderWidth: 2,
    borderColor: '#000000',
  },
  matrixScoreSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  matrixScoreChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  matrixScoreChipText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  matrixScoreLevelText: {
    fontSize: 8,
    color: PYROCEL_GRAY,
  },

  // Risk Matrix Legend
  riskLegend: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    backgroundColor: PYROCEL_GRAY_LIGHT,
    marginBottom: 15,
    borderRadius: 4,
  },
  riskLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  riskLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  riskLegendText: {
    fontSize: 7,
    color: PYROCEL_GRAY,
  },
  tableHeader: {
    backgroundColor: PYROCEL_GRAY_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: PYROCEL_GRAY_MEDIUM,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PYROCEL_GRAY,
    textTransform: 'uppercase',
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: PYROCEL_GRAY_MEDIUM,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tableCell: {
    fontSize: 9,
  },
})


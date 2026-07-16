/**
 * Mock data for the Quote Studio *preview* (a clickable prototype).
 *
 * NONE of this is wired to the database or a live model — it exists purely to
 * demonstrate the proposed "brief-first" quoting flow so the team can react to
 * the UX before we commit to building it for real. Content is representative
 * fire-alarm domain data (care-home takeover + extension) chosen to show off
 * manufacturer cost comparison and tiered client options.
 */

export type StudioRequirement = {
  id: string
  text: string
  /** Which detected system this requirement maps to. */
  system: string
  priority: 'must' | 'should' | 'note'
}

export type StudioDetected = {
  clientName: string
  siteName: string
  siteAddress: string
  buildingType: string
  standard: string
  category: string
  workType: string
  confidence: number
  summary: string
}

export type ManufacturerCost = {
  manufacturer: string
  range: string
  /** Our buy cost for the whole device schedule, in pounds. */
  cost: number
  /** Lead time in working days. */
  leadDays: number
  approved: boolean
  note: string
}

export type StudioPart = {
  ref: string
  name: string
  qty: number
  unit: number
}

export type StudioOption = {
  id: string
  tier: 'Essential' | 'Recommended' | 'Premium'
  name: string
  manufacturer: string
  headline: string
  price: number
  ourCost: number
  pros: string[]
  cons: string[]
  aiOverview: string
  includedByDefault: boolean
}

/* ------------------------------------------------------------------------
 * BAFE SP203-1 / BS 5839-1 design specification content.
 *
 * This models the clause structure an NSI/BAFE auditor expects to see in a
 * fire detection & alarm design specification. It is a FIRST-CUT structure for
 * the team to correct — all values are representative mock data for the
 * Meadowview care-home job, not a real design.
 * --------------------------------------------------------------------- */

/** Document-control metadata (revision block auditors look for). */
export const MOCK_DOC_CONTROL = {
  ref: 'PYR-DS-2026-0481',
  revision: 'A',
  status: 'For client approval',
  date: '16 July 2026',
  preparedBy: 'M. Ainsworth — Fire Systems Designer',
  preparedCompetency: 'BAFE SP203-1 registered designer · FIA Unit 1–4',
  checkedBy: 'S. Rushworth — Technical Manager',
  approvalRef: 'BAFE SP203-1 Cert. No. 0123 · NSI Gold NSI/1234',
}

/** A prose clause of the specification. */
export type SpecSection = {
  id: string
  number: string
  title: string
  body: string
  bullets?: string[]
}

/** Ordered narrative clauses of the BS 5839-1 design specification. */
export const MOCK_SPEC_SECTIONS: SpecSection[] = [
  {
    id: 's1',
    number: '1',
    title: 'Purpose & scope of the installation',
    body: 'Pyrocel proposes the design, supply, installation, commissioning and certification of an automatic fire detection and fire alarm system (AFD) for Meadowview Care Home, comprising a full takeover and upgrade of the existing three-storey premises and an extension to cover the new single-storey wing. The system is designed to protect life in a premises with a sleeping risk.',
  },
  {
    id: 's2',
    number: '2',
    title: 'System category & design rationale',
    body: 'The system is designed to Category L1 in accordance with BS 5839-1:2025 — automatic detection installed throughout all areas of the building to offer the earliest possible warning and the maximum time for evacuation. Category L1 is selected because the premises is a residential care setting with occupants who are asleep and cannot be assumed capable of self-evacuation without assistance.',
    bullets: [
      'Occupancy: sleeping risk, dependent occupants requiring staff-assisted (progressive horizontal) evacuation.',
      'A phased/progressive horizontal evacuation strategy is supported by the detection and alarm zoning.',
      'Category confirmed with the Responsible Person; no reduction from L1 has been agreed.',
    ],
  },
  {
    id: 's3',
    number: '3',
    title: 'Design responsibility & competency',
    body: 'The design has been prepared by a competent person under Pyrocel’s BAFE SP203-1 registration and NSI Gold third-party certification. Design, installation, commissioning and verification responsibilities rest with Pyrocel unless otherwise agreed in writing with the Responsible Person.',
    bullets: [
      'Designer: M. Ainsworth — BAFE SP203-1 registered, FIA Unit 1–4 qualified.',
      'A Design Certificate will be issued on completion in accordance with BS 5839-1 §41.',
      'Any variations from this specification will be recorded and agreed before implementation.',
    ],
  },
  {
    id: 's4',
    number: '4',
    title: 'Applicable standards & documents',
    body: 'The installation will comply with the following, current at the date of design:',
    bullets: [
      'BS 5839-1:2025 — Fire detection and fire alarm systems for buildings: Code of practice for design, installation, commissioning and maintenance.',
      'BS 7671:2018+A2:2022 — Requirements for Electrical Installations (IET Wiring Regulations).',
      'BS EN 54 series — Fire detection and fire alarm systems (component standards).',
      'Regulatory Reform (Fire Safety) Order 2005 — duties of the Responsible Person.',
      'BAFE SP203-1 scheme requirements and NSI Gold quality schedule.',
    ],
  },
  {
    id: 's5',
    number: '5',
    title: 'Area coverage & detector selection',
    body: 'Automatic detection is provided throughout, with detector type selected per area to balance the earliest reliable detection against false-alarm resistance (BS 5839-1 §21 and §35). Detector siting and spacing will comply with BS 5839-1 §22.',
    bullets: [
      'Bedrooms, lounges, offices, escape routes: point multi-sensor detectors (optical + heat).',
      'Kitchen, laundry, plant and boiler rooms: point heat detectors (rate-of-rise / fixed temperature).',
      'Roof void / concealed spaces exceeding 800 mm: detection provided where required by §22.',
      'Detection extended throughout the new single-storey wing (8 bedrooms + day room).',
    ],
  },
  {
    id: 's6',
    number: '6',
    title: 'Manual call points',
    body: 'Addressable manual call points (MCPs) to BS EN 54-11 will be sited on escape routes at all storey exits and final exits, at a height of 1.4 m, such that no person need travel more than 45 m to reach one (BS 5839-1 §20). MCPs will be fitted with protective covers to reduce malicious operation in the care environment.',
  },
  {
    id: 's7',
    number: '7',
    title: 'Audibility & visual alarm devices',
    body: 'The alarm warning will achieve a minimum sound pressure level of 65 dB(A) throughout, and 75 dB(A) at bedheads to rouse sleeping occupants (BS 5839-1 §16 and §18). Given hearing-impaired occupants, visual alarm devices (VADs) to BS EN 54-23 are provided in bedrooms, sanitary accommodation and communal areas. Staff alerting supports the progressive horizontal evacuation strategy.',
  },
  {
    id: 's8',
    number: '8',
    title: 'Zoning & staged evacuation',
    body: 'The premises is divided into detection and alarm zones aligned to the compartmentation and the phased evacuation strategy. Each zone does not exceed 2,000 m² and is confined to a single storey (BS 5839-1 §13). An addressable system provides device-level location to speed staff response.',
  },
  {
    id: 's9',
    number: '9',
    title: 'Cause & effect',
    body: 'A documented cause-and-effect matrix defines system outputs on activation, to be agreed with the Responsible Person prior to commissioning and recorded on an as-fitted C&E chart (see matrix below). Interfaces include magnetic door hold-open release, AOV/ventilation, lift homing, plant shutdown and transmission to the Alarm Receiving Centre.',
  },
  {
    id: 's10',
    number: '10',
    title: 'Control equipment & power supplies',
    body: 'A 2-loop addressable control and indicating panel to BS EN 54-2, with an integral power supply to BS EN 54-4, will be located at the main staff/reception point (a manned position forming the building’s normal point of entry for the fire service). Standby power is sized for 24 hours’ quiescent operation followed by 30 minutes in alarm (see battery calculation below), in accordance with BS 5839-1 §25.',
  },
  {
    id: 's11',
    number: '11',
    title: 'Cabling, containment & survivability',
    body: 'All fire alarm cabling will be enhanced fire-resistant cable (FP200 Gold or equivalent to BS EN 50200 PH120), installed and supported with fire-resistant fixings. Cabling will be segregated from other services and mechanically protected where at risk (BS 5839-1 §26). Standard/enhanced grade selection reflects the phased evacuation strategy and single-stage alarm arrangement.',
  },
  {
    id: 's12',
    number: '12',
    title: 'False alarm management',
    body: 'The design targets a low rate of unwanted fire signals in line with BS 5839-1 §35. Measures include multi-sensor detection in areas prone to nuisance (near kitchenettes and bathrooms), appropriate detector siting away from steam and cooking, MCP covers, and a documented false-alarm management plan handed over to the Responsible Person. A target of no more than one unwanted signal per 100 detectors per annum is adopted.',
  },
  {
    id: 's13',
    number: '13',
    title: 'Installation, commissioning & handover',
    body: 'Installation will be carried out to BS 5839-1 §38 and BS 7671. On completion Pyrocel will commission the system to §39, verify the design to §44, and hand over the following:',
    bullets: [
      'Design, Installation, Commissioning and (where applicable) Acceptance/Verification Certificates.',
      'As-fitted drawings and the agreed cause-and-effect chart.',
      'Operation & maintenance manual and a completed system log book.',
      'User training for nominated staff and the Responsible Person.',
    ],
  },
  {
    id: 's14',
    number: '14',
    title: 'Recommended maintenance',
    body: 'To maintain compliance and the third-party certification, periodic inspection and servicing to BS 5839-1 §45 is recommended — a minimum of two service visits per annum — together with the user’s weekly test and routine attention. A maintenance proposal is available separately.',
  },
  {
    id: 's15',
    number: '15',
    title: 'Variations & limitations',
    body: 'No variations from the recommendations of BS 5839-1:2025 are proposed. This specification covers the fire detection and alarm system only; it excludes fire-fighting equipment, emergency lighting, fire doors and passive fire protection unless separately quoted. Final device counts will be confirmed against the approved layout drawing at design freeze.',
  },
]

/** Detection/alarm zone schedule. */
export type SpecZone = {
  zone: string
  area: string
  detection: string
  devices: number
}

export const MOCK_SPEC_ZONES: SpecZone[] = [
  { zone: 'Z1', area: 'Ground floor — communal, dining, reception', detection: 'Multi-sensor + heat (kitchen)', devices: 22 },
  { zone: 'Z2', area: 'Ground floor — bedroom wing A', detection: 'Multi-sensor', devices: 18 },
  { zone: 'Z3', area: 'First floor — bedrooms & escape routes', detection: 'Multi-sensor', devices: 24 },
  { zone: 'Z4', area: 'Second floor — bedrooms & escape routes', detection: 'Multi-sensor', devices: 22 },
  { zone: 'Z5', area: 'New single-storey wing (8 beds + day room)', detection: 'Multi-sensor + heat', devices: 16 },
  { zone: 'Z6', area: 'Plant, boiler & roof voids', detection: 'Heat / void detection', devices: 6 },
]

/** Standby battery calculation (BS 5839-1 §25). */
export type BatteryRow = { label: string; value: string }
export const MOCK_BATTERY_CALC: BatteryRow[] = [
  { label: 'Quiescent current (Iq)', value: '0.42 A' },
  { label: 'Standby period required', value: '24 h' },
  { label: 'Quiescent capacity (Iq × 24 h)', value: '10.08 Ah' },
  { label: 'Alarm current (Ia)', value: '3.60 A' },
  { label: 'Alarm period required', value: '0.5 h' },
  { label: 'Alarm capacity (Ia × 0.5 h)', value: '1.80 Ah' },
  { label: 'Sub-total', value: '11.88 Ah' },
  { label: 'De-rating factor', value: '× 1.25' },
  { label: 'Minimum battery capacity', value: '14.85 Ah' },
  { label: 'Specified batteries', value: '2 × 17 Ah VRLA (24 V) — compliant with headroom' },
]

/** Cause & effect matrix — inputs (rows) vs outputs (columns). */
export const MOCK_CE_OUTPUTS = ['Sounders / VADs', 'ARC signal', 'Door holders release', 'Lift homing', 'AHU / plant shutdown'] as const
export type CauseEffectRow = { input: string; effects: boolean[] }
export const MOCK_CE_MATRIX: CauseEffectRow[] = [
  { input: 'Any automatic detector', effects: [true, true, true, true, true] },
  { input: 'Any manual call point', effects: [true, true, true, true, true] },
  { input: 'Panel fault / PSU fail', effects: [false, true, false, false, false] },
]

/** Equipment schedule with EN 54 approval references. */
export type SpecEquipment = {
  ref: string
  description: string
  standard: string
  qty: number
}
export const MOCK_SPEC_EQUIPMENT: SpecEquipment[] = [
  { ref: 'DET-MS', description: 'Addressable multi-sensor detector (optical + heat)', standard: 'BS EN 54-7 / 54-5', qty: 58 },
  { ref: 'DET-HT', description: 'Addressable heat detector (kitchen / plant)', standard: 'BS EN 54-5', qty: 6 },
  { ref: 'MCP', description: 'Addressable manual call point + cover', standard: 'BS EN 54-11', qty: 14 },
  { ref: 'SND-VAD', description: 'Sounder / VAD beacon base', standard: 'BS EN 54-3 / 54-23', qty: 46 },
  { ref: 'PANEL', description: '2-loop addressable control panel + PSU', standard: 'BS EN 54-2 / 54-4', qty: 1 },
  { ref: 'CABLE', description: 'Enhanced fire-resistant cable (FP200 Gold)', standard: 'BS EN 50200 PH120', qty: 1250 },
]

/** The realistic client email that seeds the whole flow. */
export const MOCK_BRIEF = `From: j.hartley@meadowviewcare.co.uk
Subject: Fire alarm - takeover + new wing

Hi,

We've just taken over the management contract for Meadowview Care Home in
Headingley (3 storeys, 42 beds). The existing fire alarm is a conventional
system that's around 15 years old and we're getting frequent faults.

Two things we need a quote for:
1. Taking over / upgrading the existing system so it's compliant and reliable.
2. We're building a new single-storey wing (8 bedrooms + a day room) that
   needs to be covered and tied into the main system.

It's a residential care setting so we need full coverage. The responsible
person wants something that will pass our next NSI/BAFE audit without issues.
Can you also advise on options - the trustees will want to see value.

Thanks,
Julie Hartley
Facilities Manager`

export const MOCK_DETECTED: StudioDetected = {
  clientName: 'Meadowview Care (Headingley) Ltd',
  siteName: 'Meadowview Care Home',
  siteAddress: 'Otley Road, Headingley, Leeds, LS6 3AA',
  buildingType: 'Residential care home (sleeping risk)',
  standard: 'BS 5839-1:2025',
  category: 'Category L1 (life protection, maximum coverage)',
  workType: 'System takeover / upgrade + extension to cover new wing',
  confidence: 92,
  summary:
    'Existing ~15-year-old conventional fire alarm across a 3-storey, 42-bed residential care home is unreliable and likely non-compliant for a sleeping-risk premises. Client needs a compliant, reliable system plus coverage of a new single-storey 8-bedroom wing tied into the main system. As a sleeping-risk care setting this is a Category L1 life-protection system under BS 5839-1:2025. Client has explicitly asked for audit-ready compliance (NSI/BAFE) and tiered options to demonstrate value to trustees.',
}

export const MOCK_REQUIREMENTS: StudioRequirement[] = [
  { id: 'r1', text: 'Full L1 coverage across all 3 storeys (42 beds)', system: 'Fire Alarm', priority: 'must' },
  { id: 'r2', text: 'Replace unreliable 15-year-old conventional system', system: 'Fire Alarm', priority: 'must' },
  { id: 'r3', text: 'Extend detection to new single-storey wing (8 bedrooms + day room)', system: 'Fire Alarm', priority: 'must' },
  { id: 'r4', text: 'Tie new wing into the main system (single cause & effect)', system: 'Fire Alarm', priority: 'must' },
  { id: 'r5', text: 'Audit-ready for NSI / BAFE inspection', system: 'Compliance', priority: 'must' },
  { id: 'r6', text: 'Present tiered options showing value for the trustees', system: 'Commercial', priority: 'should' },
  { id: 'r7', text: 'Reduce false alarms / nuisance faults (multi-sensor detection)', system: 'Fire Alarm', priority: 'should' },
]

export const MOCK_MANUFACTURERS: ManufacturerCost[] = [
  { manufacturer: 'Hochiki', range: 'ESP addressable', cost: 8420, leadDays: 3, approved: true, note: 'Open protocol, strong care-sector track record' },
  { manufacturer: 'Apollo', range: 'Soteria Dimension', cost: 9180, leadDays: 5, approved: true, note: 'Premium multi-sensor, best false-alarm immunity' },
  { manufacturer: 'Nittan', range: 'Evolution', cost: 7650, leadDays: 8, approved: true, note: 'Lowest cost, longer lead time on panels' },
]

export const MOCK_PARTS: StudioPart[] = [
  { ref: 'DET-MS', name: 'Multi-sensor detector (heat + optical)', qty: 58, unit: 42.5 },
  { ref: 'DET-HT', name: 'Heat detector (kitchen / plant)', qty: 6, unit: 31.0 },
  { ref: 'MCP', name: 'Manual call point (addressable)', qty: 14, unit: 22.75 },
  { ref: 'SND-VAD', name: 'Sounder / VAD beacon base', qty: 46, unit: 38.9 },
  { ref: 'PANEL', name: '2-loop addressable control panel', qty: 1, unit: 1180.0 },
  { ref: 'CABLE', name: 'FP200 Gold fire-rated cable (m)', qty: 1250, unit: 1.85 },
]

export const MOCK_OPTIONS: StudioOption[] = [
  {
    id: 'opt-essential',
    tier: 'Essential',
    name: 'Compliant like-for-like takeover',
    manufacturer: 'Nittan Evolution',
    headline: 'Meets L1 compliance at the lowest capital cost',
    price: 18450,
    ourCost: 12900,
    includedByDefault: false,
    pros: [
      'Lowest upfront investment',
      'Fully BS 5839-1:2025 L1 compliant',
      'Open protocol — not tied to one maintainer',
    ],
    cons: [
      'Basic optical detection — higher false-alarm risk in a care setting',
      'Longer panel lead time (~8 days)',
      'No networking headroom for future phases',
    ],
    aiOverview:
      'The Essential option satisfies every compliance requirement for the audit at the lowest cost, making it the easiest for trustees to approve on price. The trade-off is single-criteria optical detection, which carries a higher nuisance-alarm risk in a care home where cooking and steam are common — worth flagging given the client mentioned frequent faults.',
  },
  {
    id: 'opt-recommended',
    tier: 'Recommended',
    name: 'Multi-sensor addressable upgrade',
    manufacturer: 'Hochiki ESP',
    headline: 'Best balance of reliability, cost and audit confidence',
    price: 21990,
    ourCost: 14350,
    includedByDefault: true,
    pros: [
      'Multi-sensor detection sharply reduces false alarms',
      'Proven in residential care — strong NSI/BAFE audit history',
      'Open protocol, 3-day lead time, single networked cause & effect',
    ],
    cons: [
      'Higher cost than the Essential option',
      'Premium multi-sensor features sit above this tier',
    ],
    aiOverview:
      'The Recommended option directly addresses the client\u2019s stated pain — frequent faults — by moving to multi-sensor detection, while keeping an open protocol so they are never locked to a single maintainer. Its established care-sector track record makes it the safest choice to present as audit-ready, and the pricing still leaves a clear step up to Premium for value framing.',
  },
  {
    id: 'opt-premium',
    tier: 'Premium',
    name: 'Networked life-safety with remote monitoring',
    manufacturer: 'Apollo Soteria Dimension',
    headline: 'Highest resilience, lowest false alarms, future-proofed',
    price: 27800,
    ourCost: 18100,
    includedByDefault: false,
    pros: [
      'Best-in-class false-alarm immunity (multi-criteria)',
      'Networked panels + 24/7 remote monitoring ready',
      'Headroom for future site expansion phases',
    ],
    cons: [
      'Highest capital cost',
      'Some features exceed the minimum L1 requirement',
    ],
    aiOverview:
      'The Premium option is the most resilient and effectively eliminates nuisance alarms, with networking and remote-monitoring headroom that suits a growing care group. It exceeds the minimum compliance bar, so position it on risk reduction and future expansion rather than pure compliance — most useful as the anchor that makes the Recommended tier look like strong value.',
  },
]

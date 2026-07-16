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

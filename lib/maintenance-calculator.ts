/**
 * Maintenance pricing engine — a faithful port of the customer's Excel
 * "maintenance calculator" workbook (sheets: OVERVIEW, FIRE & LIGHTS, INTRUDER,
 * CCTV, ACCESS, DAMPERS, MONITORING).
 *
 * Every formula below is a direct translation of the corresponding spreadsheet
 * cell. Cell references from the workbook are noted in comments so the logic can
 * be verified against the source. All functions are pure so results are
 * deterministic and easy to unit-check against the spreadsheet's worked values.
 */

// ---------------------------------------------------------------------------
// Rate configuration (seeded from the workbook; overridable via Settings)
// ---------------------------------------------------------------------------

export interface MonitoringPart {
  /** CASH part number from the workbook price list. */
  partNo: string
  label: string
  cost: number
  sell: number
}

export interface AccessEquipmentOption {
  label: string
  /** Fixed cost from the CCTV lookup table; null means "enter cost manually". */
  cost: number | null
}

export interface MaintenanceRates {
  /** Standard Labour Rate £/hr (fire, EL, intruder, CCTV, access). FIRE!Q3 */
  slr: number
  /** 2-man CDO team rate £/hr (dampers). DAMPERS!E3 */
  cdoTeamRate: number
  /** Engineer hourly cost (margin display only). OVERVIEW!K5 */
  engineerCost: number
  /** CDO hourly cost (margin display only). OVERVIEW!K6 */
  cdoCost: number
  /** Travel minutes added per visit. FIRE!T3 */
  travelMins: number
  /** Max direct-services discount. OVERVIEW!H1 */
  maxDiscount: number
  /** Sub-contract mark-up. OVERVIEW!H21 */
  subcontractMarkup: number
  /** Comprehensive uplift over Standard. FIRE!F4 */
  compUplift: number
  /** CCTV out-of-hours access-equipment mark-up. CCTV!P11 */
  accessEquipmentMarkup: number

  minFirePrice: number // FIRE!R3
  minElPrice: number // FIRE!S3
  minIntruderPrice: number // INTRUDER!T3
  minCctvPrice: number // CCTV!Q3
  minAccessPrice: number // ACCESS!I3
  minDamperPrice: number // DAMPERS!H3

  /** Weekly fire test price per visit. FIRE!U13 */
  weeklyFireTestPrice: number
  /** Monthly emergency-lighting test price per visit. FIRE!U15 */
  monthlyElTestPrice: number

  /** Mechanical dampers tested per day. DAMPERS!J2 */
  mechanicalDampersPerDay: number
  /** Automatic dampers tested per day. DAMPERS!J3 */
  automaticDampersPerDay: number
  /** Hours in a testing day used to derive dampers/hour. DAMPERS!P2 divisor */
  damperHoursPerDay: number

  monitoringParts: MonitoringPart[]
  accessEquipmentOptions: AccessEquipmentOption[]
}

// Per-asset labour figures. Fire is in MINUTES; the rest are in HOURS, matching
// the respective sheets.
export const FIRE_MAJOR_MINUTES = {
  controlPanel: 30,
  repeater: 15,
  psu: 15,
  manualCallPoint: 2,
  smokeDetector: 2.5,
  heatDetector: 3.5,
  beam: 15,
  mainsInterface: 15,
  sounder: 0.5,
  network: 15,
  remoteSignalling: 15,
} as const

export const FIRE_MINOR_MULTIPLIER = {
  controlPanel: 1,
  repeater: 1,
  psu: 1,
  manualCallPoint: 0.25,
  smokeDetector: 0.15,
  heatDetector: 0.1,
  beam: 1,
  mainsInterface: 1,
  sounder: 1,
  network: 1,
  remoteSignalling: 1,
} as const

export const INTRUDER_HOURS = {
  controlPanel: 0.33,
  remoteKeypad: 0.025,
  psu: 0.167,
  pirDualTec: 0.025,
  doorContact: 0.025,
  vibrationUnit: 0.033,
  rollerShutterContact: 0.025,
  personalAttackButton: 0.033,
  bgu: 0.033,
  beam: 0.033,
  audioMicrophone: 0.083,
  sounder: 0.025,
  audioVerification: 0.166,
  remoteSignalling: 0.25,
} as const

export const CCTV_HOURS = {
  monitor: 0.083,
  remoteKeypad: 0.25,
  remotePcTerminal: 0.5,
  dvrNvr: 0.75,
  internalFixed: 0.125,
  internalPtz: 0.25,
  externalFixed: 0.25,
  externalPtz: 0.5,
  redwallDetector: 0.1,
  infraredLamp: 0.1,
  cameraTower: 0.5,
} as const

export const ACCESS_HOURS = {
  server: 0.5,
  controlledDoor: 0.33,
  intercomDoorStation: 0.25,
} as const

export const DEFAULT_MAINTENANCE_RATES: MaintenanceRates = {
  slr: 77,
  cdoTeamRate: 104,
  engineerCost: 30.93,
  cdoCost: 25.95,
  travelMins: 20,
  maxDiscount: 0.15,
  subcontractMarkup: 0.5,
  compUplift: 0.5,
  accessEquipmentMarkup: 1.25,
  minFirePrice: 199,
  minElPrice: 99,
  minIntruderPrice: 99,
  minCctvPrice: 99,
  minAccessPrice: 99,
  minDamperPrice: 149,
  weeklyFireTestPrice: 27.5,
  monthlyElTestPrice: 49,
  mechanicalDampersPerDay: 30,
  automaticDampersPerDay: 25,
  damperHoursPerDay: 7.5,
  monitoringParts: [
    { partNo: 'B002', label: 'Digital Communicator', cost: 20, sell: 99 },
    { partNo: 'B004', label: 'RedCare Classic - Grade 4', cost: 197.64, sell: 399 },
    { partNo: 'B004AG2R', label: 'RedCare Secure - Grade 2', cost: 98.4, sell: 349 },
    { partNo: 'B004AG3R', label: 'RedCare Secure - Grade 3', cost: 124.8, sell: 375 },
    { partNo: 'B007AGIP4R', label: 'RedCare Secure - Grade 4', cost: 119.4, sell: 460 },
    { partNo: 'B004G4G', label: 'RedCare GSM - Grade 4', cost: 188.76, sell: 460 },
    { partNo: 'B007EM2', label: 'Emizon IP - Grade 2', cost: 97, sell: 325 },
    { partNo: 'B007EM3', label: 'Emizon IP - Grade 3', cost: 123, sell: 350 },
    { partNo: 'B007EM4', label: 'Emizon IP - Grade 4', cost: 149, sell: 375 },
    { partNo: 'B013DIGA', label: 'DualCom DigiAIR - Grade 2', cost: 45, sell: 150 },
    { partNo: 'B013GP2', label: 'DualCom GPRS - Grade 2', cost: 89, sell: 350 },
    { partNo: 'B013GP3', label: 'DualCom GPRS - Grade 3', cost: 140, sell: 395 },
    { partNo: 'B013GP4W', label: 'DualCom GPRS - Grade 4', cost: 199, sell: 450 },
  ],
  accessEquipmentOptions: [
    { label: 'None', cost: 0 },
    { label: '15m Van Mount (Up to 1 Day)', cost: 204 },
    { label: '15m Van Mount (Up to 3 Days)', cost: 408 },
    { label: '15m Van Mount (Up to 5 Days)', cost: 612 },
    { label: 'Other (enter cost manually)', cost: null },
  ],
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const sumValues = (obj: Record<string, number>) =>
  Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0)

export type FireCover = 'standard' | 'comprehensive'
export type FireVisits = 2 | 4

// ---------------------------------------------------------------------------
// FIRE & LIGHTS
// ---------------------------------------------------------------------------

export interface FireLightsInput {
  assets: Partial<Record<keyof typeof FIRE_MAJOR_MINUTES, number>>
  cover: FireCover
  visits: FireVisits
  /**
   * When true, the calculator also offers Comprehensive fire cover as a
   * client-selectable upgrade alongside Standard. Defaults to false, in which
   * case only Standard cover is quoted as the core (non-optional) line.
   */
  includeComprehensive?: boolean
  /** Enter 52 if weekly fire testing is required, else 0. FIRE!U14 */
  weeklyFireTestingVisits: number
  // Emergency lighting (same sheet)
  centralBatteryUnits: number // FIRE!N8
  luminaires: number // FIRE!O8
  /** Enter 11 if monthly EL testing is required, else 0. FIRE!U16 */
  monthlyElTestingVisits: number
}

export interface FireLightsResult {
  hasFireAssets: boolean
  // All four priced options (FIRE!U21..U24) for comparison in the UI.
  standardTwo: number
  standardFour: number
  comprehensiveTwo: number
  comprehensiveFour: number
  /** The single option matching the selected cover + visits. */
  selectedFirePrice: number
  weeklyFireTesting: number
  // Emergency lighting
  hasElAssets: boolean
  elStandard: number
  monthlyElTesting: number
}

export function calcFireLights(
  input: FireLightsInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): FireLightsResult {
  const { slr, travelMins: travel, minFirePrice, minElPrice, compUplift } = rates
  const a = (k: keyof typeof FIRE_MAJOR_MINUTES) => Number(input.assets?.[k]) || 0

  // FIRE!Q9 — major-visit labour (£). Sum(count·majorMin)/60·SLR + travel labour.
  let majorMinutes = 0
  let minorMinutes = 0
  ;(Object.keys(FIRE_MAJOR_MINUTES) as (keyof typeof FIRE_MAJOR_MINUTES)[]).forEach((k) => {
    const count = a(k)
    const major = FIRE_MAJOR_MINUTES[k]
    majorMinutes += count * major
    minorMinutes += count * major * FIRE_MINOR_MULTIPLIER[k]
  })
  const travelLabour = (travel / 60) * slr
  const q9 = (majorMinutes / 60) * slr + travelLabour // FIRE!Q9
  const q10 = (minorMinutes / 60) * slr + travelLabour // FIRE!Q10
  const q11 = q9 + q10 // FIRE!Q11 (2-visit labour)
  const r11 = q9 + q10 * 3 // FIRE!R11 (4-visit labour)

  const standardTwo = Math.max(q11, minFirePrice) // FIRE!Q8
  const standardFour = Math.max(r11, minFirePrice + 2 * travelLabour) // FIRE!R8
  const comprehensiveTwo = standardTwo * (1 + compUplift) // FIRE!S10/S8
  const comprehensiveFour = comprehensiveTwo - q11 + r11 // FIRE!T10/T8

  const hasFireAssets =
    sumValues(input.assets as Record<string, number>) > 0 // FIRE!M11 (SUM C8:M8)

  const optionMap: Record<string, number> = {
    'standard-2': standardTwo,
    'standard-4': standardFour,
    'comprehensive-2': comprehensiveTwo,
    'comprehensive-4': comprehensiveFour,
  }
  const selectedFirePrice = hasFireAssets
    ? optionMap[`${input.cover}-${input.visits}`] ?? 0
    : 0

  const weeklyFireTesting =
    (Number(input.weeklyFireTestingVisits) || 0) * rates.weeklyFireTestPrice // FIRE!U26

  // Emergency lighting — FIRE!U1 ported verbatim.
  const cbu = Number(input.centralBatteryUnits) || 0 // N8
  const lum = Number(input.luminaires) || 0 // O8
  const otherFireAssets = sumValues(input.assets as Record<string, number>) // SUM(C8:M8)
  const elVisits = 2 // FIRE!C4 (U3) — base multiplier used by the U1 formula
  let elStandard: number
  if (cbu + lum === 0) {
    elStandard = 0
  } else if (((20 + cbu * 60 + lum + travel) * elVisits * slr) / 60 <= minElPrice - 1) {
    elStandard = minElPrice
  } else if (
    ((20 + cbu * 60 + lum) * elVisits * slr) / 60 <= 139 &&
    otherFireAssets > 0
  ) {
    elStandard = minElPrice
  } else if (otherFireAssets === 0) {
    elStandard = ((20 + cbu * 60 + lum + travel) * elVisits * slr) / 60
  } else {
    elStandard = ((20 + cbu * 60 + lum) * elVisits * slr) / 60
  }

  const monthlyElTesting =
    (Number(input.monthlyElTestingVisits) || 0) * rates.monthlyElTestPrice // FIRE!U30

  return {
    hasFireAssets,
    standardTwo: round2(standardTwo),
    standardFour: round2(standardFour),
    comprehensiveTwo: round2(comprehensiveTwo),
    comprehensiveFour: round2(comprehensiveFour),
    selectedFirePrice: round2(selectedFirePrice),
    weeklyFireTesting: round2(weeklyFireTesting),
    hasElAssets: cbu + lum > 0,
    elStandard: round2(elStandard),
    monthlyElTesting: round2(monthlyElTesting),
  }
}

// ---------------------------------------------------------------------------
// INTRUDER
// ---------------------------------------------------------------------------

export interface IntruderInput {
  assets: Partial<Record<keyof typeof INTRUDER_HOURS, number>>
  visits: number // INTRUDER!S3 (default 2)
  platinum: boolean // INTRUDER!R8
  outOfHours: boolean // INTRUDER!S8
}

export interface IntruderResult {
  hasAssets: boolean
  base: number // INTRUDER!Q8
  platinumUplift: number // INTRUDER!R10
  outOfHoursUplift: number // INTRUDER!S10
  total: number // INTRUDER!S11
  hasRemoteSignalling: boolean
}

export function calcIntruder(
  input: IntruderInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): IntruderResult {
  const { slr, travelMins: travel, minIntruderPrice } = rates
  const visits = Number(input.visits) || 2
  const assetSum = sumValues(input.assets as Record<string, number>)

  let labour = 0
  ;(Object.keys(INTRUDER_HOURS) as (keyof typeof INTRUDER_HOURS)[]).forEach((k) => {
    labour += (Number(input.assets?.[k]) || 0) * INTRUDER_HOURS[k] * slr
  })
  const perVisit = labour + (travel / 60) * slr
  const raw = perVisit * visits
  const base = assetSum === 0 ? 0 : Math.max(raw, minIntruderPrice) // Q8

  const platinumUplift = input.platinum ? base * 0.5 : 0 // R10
  const outOfHoursUplift = input.outOfHours ? base * 0.5 : 0 // S10
  const total = base + platinumUplift + outOfHoursUplift // S11

  return {
    hasAssets: assetSum > 0,
    base: round2(base),
    platinumUplift: round2(platinumUplift),
    outOfHoursUplift: round2(outOfHoursUplift),
    total: round2(total),
    hasRemoteSignalling: (Number(input.assets?.remoteSignalling) || 0) > 0,
  }
}

// ---------------------------------------------------------------------------
// CCTV
// ---------------------------------------------------------------------------

export interface CctvInput {
  assets: Partial<Record<keyof typeof CCTV_HOURS, number>>
  visits: number // CCTV!P3 (default 1)
  outOfHours: boolean // CCTV!O9
  /** Access-equipment cost (from lookup, or manual for "Other"). CCTV!P9 */
  accessEquipmentCost: number
  /** Hours of banksman required. CCTV!P10 */
  banksmanHours: number
}

export interface CctvResult {
  hasAssets: boolean
  base: number // CCTV!N9
  outOfHoursUplift: number // CCTV!O12
  accessEquipmentCharge: number // CCTV!P12
  banksmanCharge: number // CCTV!Q11
  total: number // CCTV!P13
}

export function calcCctv(
  input: CctvInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): CctvResult {
  const { slr, travelMins: travel, minCctvPrice, accessEquipmentMarkup } = rates
  const visits = Number(input.visits) || 1
  const assetSum = sumValues(input.assets as Record<string, number>)

  let labour = 0
  ;(Object.keys(CCTV_HOURS) as (keyof typeof CCTV_HOURS)[]).forEach((k) => {
    labour += (Number(input.assets?.[k]) || 0) * CCTV_HOURS[k] * slr
  })
  const raw = (labour + (travel / 60) * slr) * visits
  const base = assetSum === 0 ? 0 : Math.max(raw, minCctvPrice) // N9

  const outOfHoursUplift = input.outOfHours ? base * 0.5 : 0 // O12
  const accessEquipmentCharge =
    (Number(input.accessEquipmentCost) || 0) * accessEquipmentMarkup // P12
  const banksmanCharge = ((Number(input.banksmanHours) || 0) * slr) / 2 // Q11
  const total = base + outOfHoursUplift + accessEquipmentCharge + banksmanCharge // P13

  return {
    hasAssets: assetSum > 0,
    base: round2(base),
    outOfHoursUplift: round2(outOfHoursUplift),
    accessEquipmentCharge: round2(accessEquipmentCharge),
    banksmanCharge: round2(banksmanCharge),
    total: round2(total),
  }
}

// ---------------------------------------------------------------------------
// ACCESS CONTROL
// ---------------------------------------------------------------------------

export interface AccessInput {
  assets: Partial<Record<keyof typeof ACCESS_HOURS, number>>
  visits: number // ACCESS!H3 (default 1)
  outOfHours: boolean // ACCESS!G9
}

export interface AccessResult {
  hasAssets: boolean
  base: number // ACCESS!F9
  outOfHoursUplift: number // ACCESS!G11
  total: number // ACCESS!H12
}

export function calcAccess(
  input: AccessInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): AccessResult {
  const { slr, travelMins: travel, minAccessPrice } = rates
  const visits = Number(input.visits) || 1
  const assetSum = sumValues(input.assets as Record<string, number>)

  let labour = 0
  ;(Object.keys(ACCESS_HOURS) as (keyof typeof ACCESS_HOURS)[]).forEach((k) => {
    labour += (Number(input.assets?.[k]) || 0) * ACCESS_HOURS[k] * slr
  })
  const raw = (labour + (travel / 60) * slr) * visits
  const base = assetSum === 0 ? 0 : Math.max(raw, minAccessPrice) // F9

  const outOfHoursUplift = input.outOfHours ? base * 0.5 : 0 // G11
  const total = base + outOfHoursUplift // H12

  return {
    hasAssets: assetSum > 0,
    base: round2(base),
    outOfHoursUplift: round2(outOfHoursUplift),
    total: round2(total),
  }
}

// ---------------------------------------------------------------------------
// DAMPERS (2-man CDO team)
// ---------------------------------------------------------------------------

export interface DampersInput {
  mechanicalDampers: number // DAMPERS!C9
  automaticDampers: number // DAMPERS!D9
  visits: number // DAMPERS!G3 (default 1)
  outOfHours: boolean // DAMPERS!F9
  accessEquipmentCost: number // DAMPERS!G9
}

export interface DampersResult {
  hasAssets: boolean
  base: number // DAMPERS!E9
  outOfHoursUplift: number // DAMPERS!F11
  accessEquipmentCharge: number // DAMPERS!G11
  total: number // DAMPERS!G12
  mechanicalHoursPerUnit: number
  automaticHoursPerUnit: number
}

export function calcDampers(
  input: DampersInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): DampersResult {
  const {
    cdoTeamRate: teamRate,
    travelMins: travel,
    minDamperPrice,
    accessEquipmentMarkup,
    mechanicalDampersPerDay,
    automaticDampersPerDay,
    damperHoursPerDay,
  } = rates
  const visits = Number(input.visits) || 1
  const mech = Number(input.mechanicalDampers) || 0
  const auto = Number(input.automaticDampers) || 0

  // DAMPERS!C10 = 1/(perDay/hoursPerDay); D10 likewise.
  const mechHours = 1 / (mechanicalDampersPerDay / damperHoursPerDay)
  const autoHours = 1 / (automaticDampersPerDay / damperHoursPerDay)

  const raw =
    (mech * mechHours * teamRate + auto * autoHours * teamRate + (travel / 60) * teamRate) *
    visits
  const base = mech + auto === 0 ? 0 : Math.max(raw, minDamperPrice) // E9

  const outOfHoursUplift = input.outOfHours ? base * 0.5 : 0 // F11
  const accessEquipmentCharge =
    (Number(input.accessEquipmentCost) || 0) * accessEquipmentMarkup // G11
  const total = base + outOfHoursUplift + accessEquipmentCharge // G12

  return {
    hasAssets: mech + auto > 0,
    base: round2(base),
    outOfHoursUplift: round2(outOfHoursUplift),
    accessEquipmentCharge: round2(accessEquipmentCharge),
    total: round2(total),
    mechanicalHoursPerUnit: round2(mechHours),
    automaticHoursPerUnit: round2(autoHours),
  }
}

// ---------------------------------------------------------------------------
// MONITORING
// ---------------------------------------------------------------------------

/** Map of partNo -> quantity for fire and intruder monitoring. */
export interface MonitoringInput {
  fire: Record<string, number>
  intruder: Record<string, number>
  /** CCTV monitoring cost entered manually; sell = cost/(1-margin). */
  cctvCost: number
  cctvMargin: number // CCTV monitoring margin (MONITORING!S11, default 0.5)
}

export interface MonitoringResult {
  fireSell: number // MONITORING!T4
  fireCost: number
  intruderSell: number // MONITORING!T7
  intruderCost: number
  cctvSell: number // MONITORING!T11
  cctvCost: number
  total: number // MONITORING!S12
}

export function calcMonitoring(
  input: MonitoringInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): MonitoringResult {
  const byPart = new Map(rates.monitoringParts.map((p) => [p.partNo, p]))
  const tally = (counts: Record<string, number>) => {
    let sell = 0
    let cost = 0
    for (const [partNo, qty] of Object.entries(counts || {})) {
      const part = byPart.get(partNo)
      const n = Number(qty) || 0
      if (part && n > 0) {
        sell += part.sell * n
        cost += part.cost * n
      }
    }
    return { sell, cost }
  }

  const fire = tally(input.fire)
  const intruder = tally(input.intruder)
  const cctvMargin = input.cctvMargin ?? 0.5
  const cctvCostVal = Number(input.cctvCost) || 0
  const cctvSell = cctvCostVal > 0 ? cctvCostVal / (1 - cctvMargin) : 0 // T11

  return {
    fireSell: round2(fire.sell),
    fireCost: round2(fire.cost),
    intruderSell: round2(intruder.sell),
    intruderCost: round2(intruder.cost),
    cctvSell: round2(cctvSell),
    cctvCost: round2(cctvCostVal),
    total: round2(fire.sell + intruder.sell + cctvSell), // S12
  }
}

// ---------------------------------------------------------------------------
// OVERVIEW aggregation
// ---------------------------------------------------------------------------

export type MaintenanceLineCategory = 'direct' | 'monitoring' | 'subcontract'

export interface MaintenanceLine {
  description: string
  coverType?: string
  visits?: number | string
  /** List price before discount / mark-up. OVERVIEW column D. */
  price: number
  /** Sell price after discount / mark-up. OVERVIEW column E. */
  sell: number
  category: MaintenanceLineCategory
  /** Relevant industry standard, e.g. "BS 5839-1". */
  standard?: string
  /** One-line description of the service provided (rendered on the quote). */
  overview?: string
  /** Client-selectable option (excluded from the core total until chosen). */
  optional?: boolean
  /** Optional lines sharing a group are mutually exclusive (client picks one). */
  optionGroup?: string
}

export interface SubcontractInput {
  description: string
  cost: number
  /** Gross margin fraction 0..1; sell = cost / (1 - margin). Defaults to 0.5. */
  margin?: number
}

// Relevant standard + short service overview per maintenance service, rendered
// beneath each line on the quote document.
export interface ServiceMeta {
  standard: string
  overview: string
}

export const MAINTENANCE_SERVICE_META: Record<string, ServiceMeta> = {
  fire: {
    standard: 'BS 5839-1',
    overview:
      'Routine inspection, testing and servicing of the fire detection and alarm system to keep it fully operational and compliant.',
  },
  fireWeekly: {
    standard: 'BS 5839-1',
    overview: 'Attended weekly fire alarm testing on your behalf where in-house testing is not practical.',
  },
  el: {
    standard: 'BS 5266-1',
    overview:
      'Annual full-duration test and inspection of the emergency lighting system to confirm safe illumination on mains failure.',
  },
  elMonthly: {
    standard: 'BS 5266-1',
    overview: 'Monthly short-duration functional testing of the emergency lighting luminaires.',
  },
  intruder: {
    standard: 'BS EN 50131 / PD 6662',
    overview:
      'Preventative maintenance of the intruder alarm system including detectors, control equipment and signalling.',
  },
  cctv: {
    standard: 'BS EN 62676',
    overview:
      'Inspection and servicing of the CCTV system — cameras, recording and transmission — to maintain image quality and uptime.',
  },
  access: {
    standard: 'BS EN 60839',
    overview:
      'Servicing of the access control system including door hardware, controllers and credentials management.',
  },
  dampers: {
    standard: 'BS 9999 / BS EN 15650',
    overview: 'Drop-testing, inspection and servicing of fire and smoke dampers to verify correct operation.',
  },
  monitoring: {
    standard: 'BS 8591 / BS EN 50136',
    overview: 'Alarm receiving centre monitoring and signalling of activations to the appropriate responders.',
  },
  outOfHours: {
    standard: '',
    overview: 'Optional uplift for maintenance visits carried out outside standard working hours.',
  },
  subcontract: {
    standard: '',
    overview: 'Specialist works delivered through an approved sub-contractor and managed on your behalf.',
  },
}

export interface OverviewInput {
  fire?: FireLightsInput
  intruder?: IntruderInput
  cctv?: CctvInput
  access?: AccessInput
  dampers?: DampersInput
  monitoring?: MonitoringInput
  /** Direct-services discount 0..maxDiscount. OVERVIEW!J1 */
  directDiscount: number
  /** Monitoring discount 0..1. OVERVIEW!J16 */
  monitoringDiscount: number
  subcontract?: SubcontractInput[]
}

export interface OverviewResult {
  lines: MaintenanceLine[]
  /** OVERVIEW!E32 — TOTAL SALE (sum of all sell values). */
  totalSale: number
}

/** Clamp the direct-services discount to the configured maximum. */
export function clampDirectDiscount(value: number, rates = DEFAULT_MAINTENANCE_RATES) {
  const v = Number(value) || 0
  return Math.min(Math.max(v, 0), rates.maxDiscount)
}

export function calcOverview(
  input: OverviewInput,
  rates: MaintenanceRates = DEFAULT_MAINTENANCE_RATES,
): OverviewResult {
  const lines: MaintenanceLine[] = []
  const directDiscount = clampDirectDiscount(input.directDiscount, rates)
  const monitoringDiscount = Math.min(Math.max(Number(input.monitoringDiscount) || 0, 0), 1)

  const applyDiscount = (price: number) => round2(price - price * directDiscount)

  const pushDirect = (
    description: string,
    price: number,
    serviceKey: keyof typeof MAINTENANCE_SERVICE_META,
    extra: { coverType?: string; visits?: number | string; optional?: boolean; optionGroup?: string } = {},
  ) => {
    if (price <= 0) return
    const meta = MAINTENANCE_SERVICE_META[serviceKey]
    lines.push({
      description,
      price: round2(price),
      sell: applyDiscount(price),
      category: 'direct',
      standard: meta?.standard || undefined,
      overview: meta?.overview || undefined,
      ...extra,
    })
  }

  // Push an optional out-of-hours add-on for a service (client opt-in). The
  // uplift is 50% of the standard base price.
  const pushOutOfHours = (label: string, base: number) => {
    if (base <= 0) return
    const meta = MAINTENANCE_SERVICE_META.outOfHours
    lines.push({
      description: `${label} — Out of Hours Cover`,
      price: round2(base * 0.5),
      sell: applyDiscount(base * 0.5),
      category: 'direct',
      overview: meta.overview,
      optional: true,
    })
  }

  // Fire & lights (OVERVIEW rows 5-11)
  if (input.fire) {
    const f = calcFireLights(input.fire, rates)
    const visits = input.fire.visits
    const stdPrice = visits === 4 ? f.standardFour : f.standardTwo
    const compPrice = visits === 4 ? f.comprehensiveFour : f.comprehensiveTwo
    if (input.fire.includeComprehensive) {
      // Offer Standard and Comprehensive cover as mutually-exclusive options so
      // the client selects the level they want.
      pushDirect('Annual Fire Alarm Maintenance', stdPrice, 'fire', {
        coverType: 'Standard',
        visits,
        optional: true,
        optionGroup: 'fire-cover',
      })
      pushDirect('Annual Fire Alarm Maintenance', compPrice, 'fire', {
        coverType: 'Comprehensive',
        visits,
        optional: true,
        optionGroup: 'fire-cover',
      })
    } else {
      // Standard cover only: quote it as the core (non-optional) line.
      pushDirect('Annual Fire Alarm Maintenance', stdPrice, 'fire', {
        coverType: 'Standard',
        visits,
      })
    }
    pushOutOfHours('Fire Alarm Maintenance', stdPrice)
    pushDirect('Fire Alarm Weekly Testing', f.weeklyFireTesting, 'fireWeekly', {
      visits: input.fire.weeklyFireTestingVisits,
    })
    pushDirect('Annual Emergency Lighting Maintenance', f.elStandard, 'el', {
      coverType: 'Standard',
      visits: 1,
    })
    pushDirect('Monthly Emergency Lighting Testing', f.monthlyElTesting, 'elMonthly', {
      visits: input.fire.monthlyElTestingVisits,
    })
  }

  // Intruder (OVERVIEW row 12)
  if (input.intruder) {
    const r = calcIntruder(input.intruder, rates)
    pushDirect('Annual Intruder Alarm Maintenance', r.total - r.outOfHoursUplift, 'intruder', {
      coverType: input.intruder.platinum ? 'Platinum' : 'Standard',
      visits: input.intruder.visits || 2,
    })
    pushOutOfHours('Intruder Alarm Maintenance', r.base)
  }

  // CCTV (OVERVIEW row 13)
  if (input.cctv) {
    const r = calcCctv(input.cctv, rates)
    pushDirect('Annual CCTV Maintenance', r.total - r.outOfHoursUplift, 'cctv', {
      visits: input.cctv.visits || 1,
    })
    pushOutOfHours('CCTV Maintenance', r.base)
  }

  // Access (OVERVIEW row 14)
  if (input.access) {
    const r = calcAccess(input.access, rates)
    pushDirect('Annual Access Control Maintenance', r.total - r.outOfHoursUplift, 'access', {
      visits: input.access.visits || 1,
    })
    pushOutOfHours('Access Control Maintenance', r.base)
  }

  // Dampers (OVERVIEW row 15)
  if (input.dampers) {
    const r = calcDampers(input.dampers, rates)
    pushDirect('Annual Damper Maintenance', r.total - r.outOfHoursUplift, 'dampers', {
      visits: input.dampers.visits || 1,
    })
    pushOutOfHours('Damper Maintenance', r.base)
  }

  // Monitoring (OVERVIEW rows 18-20)
  if (input.monitoring) {
    const m = calcMonitoring(input.monitoring, rates)
    const meta = MAINTENANCE_SERVICE_META.monitoring
    const pushMonitoring = (description: string, price: number) => {
      if (price <= 0) return
      lines.push({
        description,
        price: round2(price),
        sell: round2(price - price * monitoringDiscount),
        category: 'monitoring',
        standard: meta.standard,
        overview: meta.overview,
      })
    }
    pushMonitoring('Annual Fire Alarm Monitoring', m.fireSell)
    pushMonitoring('Annual Intruder Alarm Monitoring', m.intruderSell)
    pushMonitoring('Annual CCTV Monitoring', m.cctvSell)
  }

  // Sub-contracted services (OVERVIEW rows 23-29): sell = cost / (1 - margin).
  for (const sc of input.subcontract ?? []) {
    const cost = Number(sc.cost) || 0
    if (cost <= 0) continue
    const margin = Math.min(Math.max(Number(sc.margin ?? rates.subcontractMarkup) || 0, 0), 0.95)
    lines.push({
      description: sc.description || 'Sub-Contracted Service',
      price: round2(cost),
      sell: round2(cost / (1 - margin)),
      category: 'subcontract',
      overview: MAINTENANCE_SERVICE_META.subcontract.overview,
    })
  }

  // Core total excludes client-selectable optional lines (add-ons/choices).
  const totalSale = round2(
    lines.filter((l) => !l.optional).reduce((acc, l) => acc + l.sell, 0),
  ) // E32
  return { lines, totalSale }
}

// ---------------------------------------------------------------------------
// Settings resolution + UI metadata
// ---------------------------------------------------------------------------

/**
 * Merge a partial rates object saved in company settings over the built-in
 * defaults. Unknown/absent keys fall back to DEFAULT_MAINTENANCE_RATES so the
 * engine always has a complete, valid rate set.
 */
export function resolveMaintenanceRates(
  saved: Partial<MaintenanceRates> | null | undefined,
): MaintenanceRates {
  if (!saved || typeof saved !== 'object') return DEFAULT_MAINTENANCE_RATES
  return {
    ...DEFAULT_MAINTENANCE_RATES,
    ...saved,
    // Arrays: use the saved list only if it's a non-empty array.
    monitoringParts:
      Array.isArray(saved.monitoringParts) && saved.monitoringParts.length > 0
        ? saved.monitoringParts
        : DEFAULT_MAINTENANCE_RATES.monitoringParts,
    accessEquipmentOptions:
      Array.isArray(saved.accessEquipmentOptions) && saved.accessEquipmentOptions.length > 0
        ? saved.accessEquipmentOptions
        : DEFAULT_MAINTENANCE_RATES.accessEquipmentOptions,
  }
}

// Human-readable labels for each asset input, used by the calculator dialog.
export const FIRE_ASSET_LABELS: Record<keyof typeof FIRE_MAJOR_MINUTES, string> = {
  controlPanel: 'Control panel',
  repeater: 'Repeater panel',
  psu: 'Power supply unit',
  manualCallPoint: 'Manual call point',
  smokeDetector: 'Smoke detector',
  heatDetector: 'Heat detector',
  beam: 'Beam detector',
  mainsInterface: 'Mains interface',
  sounder: 'Sounder',
  network: 'Network card',
  remoteSignalling: 'Remote signalling',
}

export const INTRUDER_ASSET_LABELS: Record<keyof typeof INTRUDER_HOURS, string> = {
  controlPanel: 'Control panel',
  remoteKeypad: 'Remote keypad',
  psu: 'Power supply unit',
  pirDualTec: 'PIR / dual-tec',
  doorContact: 'Door contact',
  vibrationUnit: 'Vibration unit',
  rollerShutterContact: 'Roller-shutter contact',
  personalAttackButton: 'Personal attack button',
  bgu: 'Bell / BGU',
  beam: 'Beam',
  audioMicrophone: 'Audio microphone',
  sounder: 'Sounder',
  audioVerification: 'Audio verification',
  remoteSignalling: 'Remote signalling',
}

export const CCTV_ASSET_LABELS: Record<keyof typeof CCTV_HOURS, string> = {
  monitor: 'Monitor',
  remoteKeypad: 'Remote keypad',
  remotePcTerminal: 'Remote PC terminal',
  dvrNvr: 'DVR / NVR',
  internalFixed: 'Internal fixed camera',
  internalPtz: 'Internal PTZ camera',
  externalFixed: 'External fixed camera',
  externalPtz: 'External PTZ camera',
  redwallDetector: 'Redwall detector',
  infraredLamp: 'Infrared lamp',
  cameraTower: 'Camera tower',
}

export const ACCESS_ASSET_LABELS: Record<keyof typeof ACCESS_HOURS, string> = {
  server: 'Server / head-end',
  controlledDoor: 'Controlled door',
  intercomDoorStation: 'Intercom door station',
}

import type { PpmAssetRow, PpmVisitRow } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// PPM service-contract calculator.
//
// Cost model (all money in pence, all time in minutes):
//   per-visit testing minutes  = Σ(asset.minutes × asset.quantity × visit.coverage%)
//   per-visit overhead minutes  = travel + download(if required) + access + remote(if monitored)
//   labour minutes              = Σ over visits ( testing minutes(visit) + overhead minutes )
//   labour cost                 = labour minutes / 60 × hourly cost,
//                                 with an out-of-hours % uplift on the rate when enabled
//   travel cost                 = round-trip miles × mileage rate × number of visits
//   total cost                  = labour cost + travel cost
//   price                       = total cost / (1 − margin%)   (margin on sell price)
// ---------------------------------------------------------------------------

export interface PpmInput {
  numVisits: number
  roundTripMiles: number
  mileageRatePence: number
  travelMinutesPerVisit: number
  hourlyCostPence: number
  downloadRequired: boolean
  downloadMinutesPerVisit: number
  accessMinutesPerVisit: number
  remoteMonitored: boolean
  remoteMinutesPerVisit: number
  outOfHours: boolean
  oohUpliftPercent: number
  marginPercent: number
  assets: PpmAssetRow[]
  visits: PpmVisitRow[]
}

export interface PpmResult {
  // Minutes spent purely testing assets, summed across visits.
  testingMinutes: number
  // Non-testing minutes (travel time, download, access, remote), summed across visits.
  overheadMinutes: number
  totalLabourMinutes: number
  // Effective hourly rate after any out-of-hours uplift.
  effectiveHourlyPence: number
  labourCostPence: number
  travelCostPence: number
  totalCostPence: number
  marginPence: number
  pricePence: number
  // Per-visit testing-minute breakdown for display.
  perVisit: { label: string; coveragePercent: number; testingMinutes: number }[]
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
}

function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : 0
}

// Minutes to test the full asset population once (100% coverage).
function fullPassMinutes(assets: PpmAssetRow[]): number {
  return assets.reduce(
    (sum, a) => sum + safeNumber(a.minutes) * safeNumber(a.quantity),
    0,
  )
}

export function calculatePpm(input: PpmInput): PpmResult {
  const fullPass = fullPassMinutes(input.assets)

  // If no visits are defined, treat as a single 100% visit so the calc still works.
  const visits =
    input.visits.length > 0
      ? input.visits
      : [{ label: 'Visit 1', coverage_percent: 100 }]

  const perVisit = visits.map((v) => {
    const coverage = clampPercent(v.coverage_percent)
    return {
      label: v.label,
      coveragePercent: coverage,
      testingMinutes: (fullPass * coverage) / 100,
    }
  })

  const testingMinutes = perVisit.reduce((s, v) => s + v.testingMinutes, 0)

  // Overhead minutes applied per visit.
  const perVisitOverhead =
    safeNumber(input.travelMinutesPerVisit) +
    (input.downloadRequired ? safeNumber(input.downloadMinutesPerVisit) : 0) +
    safeNumber(input.accessMinutesPerVisit) +
    (input.remoteMonitored ? safeNumber(input.remoteMinutesPerVisit) : 0)

  const numVisits = Math.max(0, Math.round(safeNumber(input.numVisits)))
  const overheadMinutes = perVisitOverhead * numVisits

  const totalLabourMinutes = testingMinutes + overheadMinutes

  const upliftFactor = input.outOfHours
    ? 1 + clampPercent(input.oohUpliftPercent) / 100
    : 1
  const effectiveHourlyPence = safeNumber(input.hourlyCostPence) * upliftFactor

  const labourCostPence = Math.round((totalLabourMinutes / 60) * effectiveHourlyPence)

  const travelCostPence = Math.round(
    safeNumber(input.roundTripMiles) * safeNumber(input.mileageRatePence) * numVisits,
  )

  const totalCostPence = labourCostPence + travelCostPence

  // Margin is taken on the sell price: price = cost / (1 − margin%).
  const margin = clampPercent(input.marginPercent)
  const pricePence =
    margin >= 100 ? totalCostPence : Math.round(totalCostPence / (1 - margin / 100))

  return {
    testingMinutes,
    overheadMinutes,
    totalLabourMinutes,
    effectiveHourlyPence,
    labourCostPence,
    travelCostPence,
    totalCostPence,
    marginPence: pricePence - totalCostPence,
    pricePence,
    perVisit,
  }
}

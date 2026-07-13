import type { RecurringFrequency } from '@/lib/types/database'

/**
 * Annualised occurrence count per frequency. This is a *run-rate* projection:
 * every live charge is assumed to run for a full 12 months, so start/end dates
 * are intentionally ignored. Weekly is approximated at 52 invoices/year.
 */
export const ANNUAL_OCCURRENCES: Record<RecurringFrequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  biannual: 2,
  annual: 1,
}

/** Bucket key used for charges with no resolvable branch / service type. */
export const UNASSIGNED = '__unassigned__'

export interface ServiceTypeProjection {
  serviceTypeId: string
  serviceTypeName: string
  systemTypeId: string | null
  systemTypeName: string | null
  chargeCount: number
  revenuePence: number
  costPence: number
  marginPence: number
}

export interface BranchProjection {
  branchId: string
  branchName: string
  chargeCount: number
  revenuePence: number
  costPence: number
  marginPence: number
  serviceTypes: ServiceTypeProjection[]
}

export interface ProjectedRevenue {
  totalRevenuePence: number
  totalCostPence: number
  totalMarginPence: number
  chargeCount: number
  branches: BranchProjection[]
}

/** A single charge flattened with its resolved branch / service / system type. */
export interface ProjectionInput {
  frequency: RecurringFrequency
  unitPricePence: number
  quantity: number
  isSubcontracted: boolean
  subcontractPricePence: number | null
  branchId: string | null
  branchName: string | null
  serviceTypeId: string | null
  serviceTypeName: string | null
  systemTypeId: string | null
  systemTypeName: string | null
}

/** Annualised gross (ex-VAT) sell value of one charge over the next 12 months. */
export function annualRevenuePence(c: ProjectionInput): number {
  const per = c.unitPricePence * (c.quantity || 1)
  return Math.round(per * ANNUAL_OCCURRENCES[c.frequency])
}

/** Annualised buy cost — only subcontracted charges carry a cost. */
export function annualCostPence(c: ProjectionInput): number {
  if (!c.isSubcontracted || c.subcontractPricePence == null) return 0
  const per = c.subcontractPricePence * (c.quantity || 1)
  return Math.round(per * ANNUAL_OCCURRENCES[c.frequency])
}

/**
 * Aggregate flattened charges into branch → service-type projections plus grand
 * totals. Branches and service-type rows are sorted by descending revenue so
 * the biggest contributors surface first; unassigned buckets sink to the end.
 */
export function aggregateProjection(charges: ProjectionInput[]): ProjectedRevenue {
  const branchMap = new Map<string, BranchProjection & { _svc: Map<string, ServiceTypeProjection> }>()

  let totalRevenue = 0
  let totalCost = 0

  for (const c of charges) {
    const revenue = annualRevenuePence(c)
    const cost = annualCostPence(c)
    totalRevenue += revenue
    totalCost += cost

    const branchKey = c.branchId ?? UNASSIGNED
    let branch = branchMap.get(branchKey)
    if (!branch) {
      branch = {
        branchId: branchKey,
        branchName: c.branchName ?? 'Unassigned branch',
        chargeCount: 0,
        revenuePence: 0,
        costPence: 0,
        marginPence: 0,
        serviceTypes: [],
        _svc: new Map(),
      }
      branchMap.set(branchKey, branch)
    }
    branch.chargeCount += 1
    branch.revenuePence += revenue
    branch.costPence += cost
    branch.marginPence += revenue - cost

    const svcKey = c.serviceTypeId ?? UNASSIGNED
    let svc = branch._svc.get(svcKey)
    if (!svc) {
      svc = {
        serviceTypeId: svcKey,
        serviceTypeName: c.serviceTypeName ?? 'Other charges',
        systemTypeId: c.systemTypeId,
        systemTypeName: c.systemTypeName,
        chargeCount: 0,
        revenuePence: 0,
        costPence: 0,
        marginPence: 0,
      }
      branch._svc.set(svcKey, svc)
    }
    svc.chargeCount += 1
    svc.revenuePence += revenue
    svc.costPence += cost
    svc.marginPence += revenue - cost
  }

  const rank = (id: string, revA: number, revB: number) =>
    id === UNASSIGNED ? Number.NEGATIVE_INFINITY : revA - revB

  const branches = Array.from(branchMap.values())
    .map(({ _svc, ...b }) => ({
      ...b,
      serviceTypes: Array.from(_svc.values()).sort(
        (a, z) => rank(z.serviceTypeId, z.revenuePence, 0) - rank(a.serviceTypeId, a.revenuePence, 0),
      ),
    }))
    .sort((a, z) => rank(z.branchId, z.revenuePence, 0) - rank(a.branchId, a.revenuePence, 0))

  return {
    totalRevenuePence: totalRevenue,
    totalCostPence: totalCost,
    totalMarginPence: totalRevenue - totalCost,
    chargeCount: charges.length,
    branches,
  }
}

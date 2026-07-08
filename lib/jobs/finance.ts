import type { Job } from '@/lib/types/database'

/**
 * Snapshot profit figures for a job (all in pence unless noted).
 *
 * Phase 1 uses the quoted snapshot captured at conversion. `committedCostPence`
 * is a placeholder for future phases (purchase orders, stock issues, expenses,
 * subcontractors) — it is kept separate so the "actual cost" source can be
 * swapped in without reworking the UI. Margin always derives from value − cost.
 */
export interface JobFinance {
  valuePence: number
  quotedCostPence: number
  quotedMarginPence: number
  quotedMarginPercent: number | null
  // Placeholder for later phases — real committed/actual cost tracking.
  committedCostPence: number
}

export function jobFinance(job: Pick<Job, 'quoted_total_pence' | 'quoted_subtotal_pence' | 'quoted_cost_pence'>): JobFinance {
  // Margin is measured against the net (ex-VAT) value the business earns.
  const valuePence = job.quoted_subtotal_pence || job.quoted_total_pence || 0
  const quotedCostPence = job.quoted_cost_pence || 0
  const quotedMarginPence = valuePence - quotedCostPence
  const quotedMarginPercent =
    valuePence > 0 ? Math.round((quotedMarginPence / valuePence) * 1000) / 10 : null
  return {
    valuePence,
    quotedCostPence,
    quotedMarginPence,
    quotedMarginPercent,
    committedCostPence: 0,
  }
}

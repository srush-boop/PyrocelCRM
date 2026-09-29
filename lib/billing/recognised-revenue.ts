/**
 * Recognised (earned) recurring revenue.
 *
 * Each recurring invoice line is spread evenly across the months it covers,
 * starting in its invoice-date month: annual → 12, bi-annual → 6, quarterly → 3.
 * Monthly, weekly, per-visit and on-completion lines are recognised in full in
 * the invoice month. Credit notes carry negative amounts and spread the same way.
 */

export type RecognitionBasis =
  | 'annual'
  | 'biannual'
  | 'quarterly'
  | 'monthly'
  | 'weekly'
  | 'per_visit'
  | 'on_completion'
  | 'unmatched'

export const SPREAD_MONTHS: Record<RecognitionBasis, number> = {
  annual: 12,
  biannual: 6,
  quarterly: 3,
  monthly: 1,
  weekly: 1,
  per_visit: 1,
  on_completion: 1,
  unmatched: 1,
}

export const BASIS_LABELS: Record<RecognitionBasis, string> = {
  annual: 'Annual (1/12)',
  biannual: 'Bi-annual (1/6)',
  quarterly: 'Quarterly (1/3)',
  monthly: 'Monthly (full)',
  weekly: 'Weekly (full)',
  per_visit: 'Per visit (full)',
  on_completion: 'On completion (full)',
  unmatched: 'Unmatched (full)',
}

export const BASIS_ORDER: RecognitionBasis[] = [
  'annual',
  'biannual',
  'quarterly',
  'monthly',
  'weekly',
  'per_visit',
  'on_completion',
  'unmatched',
]

export type RecognitionLine = {
  lineId: string
  invoiceId: string
  invoiceNumber: string
  documentType: 'invoice' | 'credit_note'
  issueDate: string
  clientName: string | null
  description: string
  /** Signed ex-VAT amount: credit-note lines are negative. */
  amountPence: number
  basis: RecognitionBasis
}

export type RecognitionContribution = {
  lineId: string
  invoiceId: string
  invoiceNumber: string
  documentType: 'invoice' | 'credit_note'
  clientName: string | null
  description: string
  basis: RecognitionBasis
  invoiceMonth: string
  facePence: number
  sharePence: number
  monthIndex: number
  monthsTotal: number
}

export type RecognitionMonth = {
  month: string
  invoicedPence: number
  creditedPence: number
  fromCurrentPence: number
  broughtForwardPence: number
  recognisedPence: number
  deferredClosingPence: number
  byBasis: Partial<Record<RecognitionBasis, number>>
  contributions: RecognitionContribution[]
}

export type RecognisedRevenue = {
  year: number
  months: RecognitionMonth[]
  totals: {
    invoicedPence: number
    creditedPence: number
    recognisedPence: number
    broughtForwardFromPriorYearPence: number
    deferredAtYearEndPence: number
    byBasis: Partial<Record<RecognitionBasis, number>>
  }
  unmatchedLineCount: number
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Even split; the first (invoice) month absorbs any rounding remainder. */
export function splitPence(amountPence: number, months: number): number[] {
  if (months <= 1) return [amountPence]
  const base = Math.trunc(amountPence / months)
  const shares = Array.from({ length: months }, () => base)
  shares[0] = amountPence - base * (months - 1)
  return shares
}

export function buildRecognition(lines: RecognitionLine[], year: number): RecognisedRevenue {
  const firstKey = `${year}-01`
  const lastKey = `${year}-12`
  const months: RecognitionMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: addMonths(firstKey, i),
    invoicedPence: 0,
    creditedPence: 0,
    fromCurrentPence: 0,
    broughtForwardPence: 0,
    recognisedPence: 0,
    deferredClosingPence: 0,
    byBasis: {},
    contributions: [],
  }))
  const byMonth = new Map(months.map((m) => [m.month, m]))

  let broughtForwardFromPriorYear = 0
  let deferredAtYearEnd = 0
  let unmatched = 0

  for (const line of lines) {
    const start = monthKey(line.issueDate)
    const total = SPREAD_MONTHS[line.basis]
    const shares = splitPence(line.amountPence, total)
    if (line.basis === 'unmatched' && start >= firstKey && start <= lastKey) unmatched += 1

    const startMonth = byMonth.get(start)
    if (startMonth) {
      if (line.amountPence < 0) startMonth.creditedPence += line.amountPence
      else startMonth.invoicedPence += line.amountPence
    }

    shares.forEach((share, i) => {
      const key = addMonths(start, i)
      if (key > lastKey) {
        if (start <= lastKey) deferredAtYearEnd += share
        return
      }
      if (key < firstKey) return
      const month = byMonth.get(key)!
      if (start < firstKey) broughtForwardFromPriorYear += share
      if (i === 0) month.fromCurrentPence += share
      else month.broughtForwardPence += share
      month.recognisedPence += share
      month.byBasis[line.basis] = (month.byBasis[line.basis] ?? 0) + share
      month.contributions.push({
        lineId: line.lineId,
        invoiceId: line.invoiceId,
        invoiceNumber: line.invoiceNumber,
        documentType: line.documentType,
        clientName: line.clientName,
        description: line.description,
        basis: line.basis,
        invoiceMonth: start,
        facePence: line.amountPence,
        sharePence: share,
        monthIndex: i + 1,
        monthsTotal: total,
      })
    })

    // Deferred balance: invoiced by month-end but not yet recognised.
    for (const month of months) {
      if (start > month.month) continue
      let remaining = 0
      shares.forEach((share, i) => {
        if (addMonths(start, i) > month.month) remaining += share
      })
      month.deferredClosingPence += remaining
    }
  }

  const byBasis: Partial<Record<RecognitionBasis, number>> = {}
  for (const m of months) {
    m.contributions.sort(
      (a, b) => a.invoiceMonth.localeCompare(b.invoiceMonth) || a.invoiceNumber.localeCompare(b.invoiceNumber),
    )
    for (const [k, v] of Object.entries(m.byBasis)) {
      const key = k as RecognitionBasis
      byBasis[key] = (byBasis[key] ?? 0) + (v ?? 0)
    }
  }

  return {
    year,
    months,
    totals: {
      invoicedPence: months.reduce((s, m) => s + m.invoicedPence, 0),
      creditedPence: months.reduce((s, m) => s + m.creditedPence, 0),
      recognisedPence: months.reduce((s, m) => s + m.recognisedPence, 0),
      broughtForwardFromPriorYearPence: broughtForwardFromPriorYear,
      deferredAtYearEndPence: deferredAtYearEnd,
      byBasis,
    },
    unmatchedLineCount: unmatched,
  }
}

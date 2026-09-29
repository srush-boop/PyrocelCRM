'use server'

import { createClient } from '@/lib/supabase/server'
import {
  buildRecognition,
  type RecognisedRevenue,
  type RecognitionBasis,
  type RecognitionLine,
} from '@/lib/billing/recognised-revenue'

export type RecognitionSource = 'sage' | 'issued'

type LineRow = {
  id: string
  description: string
  amount_pence: number
  site_service_id: string | null
  task_id: string | null
  sort_order: number
}

type InvoiceRow = {
  id: string
  invoice_number: string
  document_type: string
  origin: string
  status: string
  issue_date: string | null
  issued_at: string | null
  credited_invoice_id: string | null
  sage_exported_at: string | null
  bill_to_name: string | null
  lines: LineRow[] | null
}

type ChargeRow = {
  site_service_id: string
  unit_price_pence: number
  quantity: number | null
  frequency: string
  timing: string
}

const INVOICE_COLS =
  'id, invoice_number, document_type, origin, status, issue_date, issued_at, credited_invoice_id, sage_exported_at, bill_to_name, lines:invoice_line_items(id, description, amount_pence, site_service_id, task_id, sort_order)'

const FREQUENCY_BASIS: Record<string, RecognitionBasis> = {
  annual: 'annual',
  biannual: 'biannual',
  quarterly: 'quarterly',
  monthly: 'monthly',
  weekly: 'weekly',
}

export async function getRecognisedRevenue(
  year: number,
  source: RecognitionSource,
): Promise<RecognisedRevenue> {
  const supabase = await createClient()
  // Annual lines from up to 11 months before the year still recognise into it.
  const from = `${year - 1}-01-01`
  const to = `${year}-12-31`

  const { data } = await supabase
    .from('invoices')
    .select(INVOICE_COLS)
    .in('status', ['issued', 'paid'])
    .gte('issue_date', from)
    .lte('issue_date', to)
  let rows = (data ?? []) as unknown as InvoiceRow[]
  if (source === 'sage') rows = rows.filter((r) => r.sage_exported_at)

  const recurringInvoices = rows.filter(
    (r) => r.document_type !== 'credit_note' && r.origin === 'recurring',
  )
  const credits = rows.filter((r) => r.document_type === 'credit_note' && r.credited_invoice_id)

  // Credit notes are copies of their original, minus the service link — load
  // every credited original so credit lines can be traced back to a charge.
  const originals = new Map<string, InvoiceRow>(recurringInvoices.map((r) => [r.id, r]))
  const missing = Array.from(
    new Set(credits.map((c) => c.credited_invoice_id as string).filter((id) => !originals.has(id))),
  )
  if (missing.length) {
    const { data: extra } = await supabase.from('invoices').select(INVOICE_COLS).in('id', missing)
    for (const r of (extra ?? []) as unknown as InvoiceRow[]) originals.set(r.id, r)
  }
  const recurringCredits = credits.filter(
    (c) => originals.get(c.credited_invoice_id as string)?.origin === 'recurring',
  )

  const allLines = [...originals.values()].flatMap((r) => r.lines ?? [])
  const serviceIds = Array.from(
    new Set(allLines.map((l) => l.site_service_id).filter((v): v is string => !!v)),
  )
  const lineIds = allLines.map((l) => l.id)

  const [chargesRes, ledgerRes] = await Promise.all([
    serviceIds.length
      ? supabase
          .from('recurring_charges')
          .select('site_service_id, unit_price_pence, quantity, frequency, timing')
          .in('site_service_id', serviceIds)
      : Promise.resolve({ data: [] }),
    lineIds.length
      ? supabase
          .from('recurring_visit_billings')
          .select('invoice_line_item_id')
          .in('invoice_line_item_id', lineIds)
      : Promise.resolve({ data: [] }),
  ])

  const chargesByService = new Map<string, ChargeRow[]>()
  for (const c of (chargesRes.data ?? []) as ChargeRow[]) {
    const list = chargesByService.get(c.site_service_id) ?? []
    list.push(c)
    chargesByService.set(c.site_service_id, list)
  }
  const perVisitLineIds = new Set(
    ((ledgerRes.data ?? []) as { invoice_line_item_id: string | null }[])
      .map((r) => r.invoice_line_item_id)
      .filter((v): v is string => !!v),
  )

  function basisFor(line: LineRow): RecognitionBasis {
    if (perVisitLineIds.has(line.id)) return 'per_visit'
    const charges = line.site_service_id ? chargesByService.get(line.site_service_id) ?? [] : []
    if (!charges.length) return line.task_id ? 'on_completion' : 'unmatched'
    const exact = charges.filter(
      (c) => Math.round(c.unit_price_pence * Number(c.quantity ?? 1)) === Math.abs(line.amount_pence),
    )
    const pool = exact.length ? exact : charges
    const counts = new Map<string, number>()
    for (const c of pool) {
      const key = c.timing === 'per_visit' || c.timing === 'on_completion' ? c.timing : c.frequency
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    if (key === 'per_visit' || key === 'on_completion') return key
    return FREQUENCY_BASIS[key] ?? 'unmatched'
  }

  function originalLineFor(credit: LineRow, original: InvoiceRow | undefined): LineRow | undefined {
    const lines = original?.lines ?? []
    return (
      lines.find((l) => l.sort_order === credit.sort_order && l.description === credit.description) ??
      lines.find((l) => l.description === credit.description)
    )
  }

  const out: RecognitionLine[] = []
  const dateOf = (r: InvoiceRow) => r.issue_date ?? r.issued_at?.slice(0, 10) ?? null

  for (const inv of recurringInvoices) {
    const date = dateOf(inv)
    if (!date) continue
    for (const line of inv.lines ?? []) {
      if (!line.amount_pence) continue
      out.push({
        lineId: line.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        documentType: 'invoice',
        issueDate: date,
        clientName: inv.bill_to_name,
        description: line.description,
        amountPence: line.amount_pence,
        basis: basisFor(line),
      })
    }
  }

  for (const cn of recurringCredits) {
    const date = dateOf(cn)
    if (!date) continue
    const original = originals.get(cn.credited_invoice_id as string)
    for (const line of cn.lines ?? []) {
      if (!line.amount_pence) continue
      const source = originalLineFor(line, original)
      out.push({
        lineId: line.id,
        invoiceId: cn.id,
        invoiceNumber: cn.invoice_number,
        documentType: 'credit_note',
        issueDate: date,
        clientName: cn.bill_to_name,
        description: line.description,
        amountPence: -Math.abs(line.amount_pence),
        basis: source ? basisFor(source) : 'unmatched',
      })
    }
  }

  return buildRecognition(out, year)
}

export async function getRecognitionYears(): Promise<number[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('issue_date')
    .eq('origin', 'recurring')
    .not('issue_date', 'is', null)
    .order('issue_date', { ascending: true })
    .limit(1)
  const current = new Date().getFullYear()
  const first = (data?.[0] as { issue_date: string } | undefined)?.issue_date
  const start = first ? Math.min(Number(first.slice(0, 4)), current) : current
  const years: number[] = []
  for (let y = current + 1; y >= start; y--) years.push(y)
  return years
}

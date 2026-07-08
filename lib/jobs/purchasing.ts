import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from '@/lib/types/database'

const PO_PREFIX = 'PO-'
const PAD = 5

/**
 * Next sequential purchase-order number in the form `PO-00001`. Mirrors the
 * job-number scheme; numbering is display-only, so a rare race just needs a
 * single retry by the caller.
 */
export async function nextPurchaseOrderNumber(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .not('po_number', 'is', null)
    .order('po_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const current = (data as { po_number?: string | null } | null)?.po_number ?? null
  let next = 1
  if (current) {
    const match = current.match(/(\d+)\s*$/)
    if (match) next = Number.parseInt(match[1], 10) + 1
  }
  return `${PO_PREFIX}${String(next).padStart(PAD, '0')}`
}

// ---------------------------------------------------------------------------
// Grouping quoted parts into supplier purchase orders
// ---------------------------------------------------------------------------

/** A quote line that is a candidate for purchasing (a physical part). */
export interface PurchasableLine {
  quoteLineItemId: string
  catalogueItemId: string | null
  description: string
  productCode: string | null
  quantity: number
  unit: string
  unitCostPence: number
  lineTotalPence: number
}

/** One supplier's worth of purchasable lines, ready to become a draft PO. */
export interface SupplierGroup {
  supplierId: string | null
  supplierName: string
  orderEmail: string | null
  lines: PurchasableLine[]
  subtotalPence: number
  // A draft/active PO already exists for this job+supplier (avoid duplicates).
  alreadyOrdered: boolean
}

interface RawQuoteLine {
  id: string
  description: string | null
  product_code: string | null
  quantity: number | string | null
  unit: string | null
  unit_cost_pence: number | null
  is_service: boolean | null
  is_optional: boolean | null
  client_selected: boolean | null
  catalogue_item_id: string | null
  catalogue: {
    id: string
    product_code: string | null
    supplier_id: string | null
    supplier: { id: string; name: string; order_email: string | null } | null
  } | null
}

const UNASSIGNED = 'unassigned'

/**
 * Group a job's quoted physical parts by the supplier they're bought from.
 *
 * Rules:
 *  - Services (`is_service`) are never ordered as parts.
 *  - Optional lines the client didn't select are excluded (they won't be fitted).
 *  - A line's supplier comes from its catalogue item; lines with no supplier fall
 *    into an "Unassigned" group so they can be given a supplier before sending.
 *  - Groups that already have a non-cancelled PO for this job are flagged so the
 *    generator doesn't duplicate them.
 */
export async function previewJobPurchasing(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ quoteId: string | null; groups: SupplierGroup[] }> {
  const { data: job } = await supabase
    .from('jobs')
    .select('id, quote_id')
    .eq('id', jobId)
    .maybeSingle()

  const quoteId = (job as { quote_id?: string | null } | null)?.quote_id ?? null
  if (!quoteId) return { quoteId: null, groups: [] }

  const { data: rawLines } = await supabase
    .from('quote_line_items')
    .select(
      `id, description, product_code, quantity, unit, unit_cost_pence, is_service, is_optional, client_selected, catalogue_item_id,
       catalogue:quote_catalogue_items(id, product_code, supplier_id,
         supplier:suppliers!quote_catalogue_items_supplier_id_fkey(id, name, order_email))`,
    )
    .eq('quote_id', quoteId)
    .order('position')

  // Which suppliers already have a live PO for this job.
  const { data: existingPos } = await supabase
    .from('purchase_orders')
    .select('supplier_id, status')
    .eq('job_id', jobId)
    .neq('status', 'cancelled')

  const orderedSuppliers = new Set<string>()
  for (const po of (existingPos ?? []) as { supplier_id: string | null }[]) {
    orderedSuppliers.add(po.supplier_id ?? UNASSIGNED)
  }

  const groups = new Map<string, SupplierGroup>()

  for (const raw of (rawLines ?? []) as unknown as RawQuoteLine[]) {
    if (raw.is_service) continue
    // Skip optional lines the client didn't take.
    if (raw.is_optional && !raw.client_selected) continue

    const qty = Number(raw.quantity ?? 0)
    if (!qty || qty <= 0) continue

    const supplierId = raw.catalogue?.supplier_id ?? null
    const supplier = raw.catalogue?.supplier ?? null
    const key = supplierId ?? UNASSIGNED
    const unitCostPence = raw.unit_cost_pence ?? 0
    const lineTotalPence = Math.round(unitCostPence * qty)

    const line: PurchasableLine = {
      quoteLineItemId: raw.id,
      catalogueItemId: raw.catalogue_item_id,
      description: raw.description ?? 'Item',
      productCode: raw.product_code ?? raw.catalogue?.product_code ?? null,
      quantity: qty,
      unit: raw.unit ?? 'each',
      unitCostPence,
      lineTotalPence,
    }

    const existing = groups.get(key)
    if (existing) {
      existing.lines.push(line)
      existing.subtotalPence += lineTotalPence
    } else {
      groups.set(key, {
        supplierId,
        supplierName: supplier?.name ?? 'Unassigned supplier',
        orderEmail: supplier?.order_email ?? null,
        lines: [line],
        subtotalPence: lineTotalPence,
        alreadyOrdered: orderedSuppliers.has(key),
      })
    }
  }

  // Named suppliers first (alphabetical), Unassigned last.
  const sorted = [...groups.values()].sort((a, b) => {
    if (a.supplierId === null) return 1
    if (b.supplierId === null) return -1
    return a.supplierName.localeCompare(b.supplierName)
  })

  return { quoteId, groups: sorted }
}

// ---------------------------------------------------------------------------
// Reads used by the pages
// ---------------------------------------------------------------------------

const PO_SELECT =
  '*, supplier:suppliers(id, name, order_email, contact_name), job:jobs(id, job_number, title), branch:branches(id, name)'

export async function getPurchaseOrder(
  supabase: SupabaseClient,
  id: string,
): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`${PO_SELECT}, lines:purchase_order_lines(*)`)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const po = data as PurchaseOrder
  if (po.lines) po.lines = [...po.lines].sort((a, b) => a.position - b.position)
  return po
}

export interface PurchaseOrderFilters {
  branchId?: string | null
  status?: PurchaseOrderStatus | 'all'
  supplierId?: string | null
  search?: string
}

export async function getPurchaseOrders(
  supabase: SupabaseClient,
  filters: PurchaseOrderFilters = {},
): Promise<PurchaseOrder[]> {
  let query = supabase
    .from('purchase_orders')
    .select(`${PO_SELECT}, lines:purchase_order_lines(id)`)
    .order('created_at', { ascending: false })

  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)

  const { data, error } = await query
  if (error) {
    console.log('[v0] getPurchaseOrders error:', error.message)
    return []
  }

  let rows = (data ?? []) as (PurchaseOrder & { lines?: { id: string }[] })[]

  // Cheap in-memory search over PO number / supplier / job (list sizes are small).
  const term = filters.search?.trim().toLowerCase()
  if (term) {
    rows = rows.filter((po) => {
      const hay = [po.po_number, po.supplier?.name, po.job?.job_number, po.job?.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(term)
    })
  }

  return rows.map((po) => ({ ...po, line_count: po.lines?.length ?? 0 }))
}

/**
 * Total committed cost for a job = the sum of subtotals across its live
 * (non-cancelled) purchase orders. This is the "committed" figure the job
 * profit monitor compares against the quoted cost budget.
 */
export async function getJobCommittedCost(
  supabase: SupabaseClient,
  jobId: string,
): Promise<number> {
  const { data } = await supabase
    .from('purchase_orders')
    .select('subtotal_pence, status')
    .eq('job_id', jobId)
    .neq('status', 'cancelled')
  return ((data ?? []) as { subtotal_pence: number }[]).reduce(
    (sum, po) => sum + (po.subtotal_pence ?? 0),
    0,
  )
}

/** Purchase orders attached to a job (for the job detail Purchasing section). */
export async function getJobPurchaseOrders(
  supabase: SupabaseClient,
  jobId: string,
): Promise<PurchaseOrder[]> {
  const { data } = await supabase
    .from('purchase_orders')
    .select(`${PO_SELECT}, lines:purchase_order_lines(id, quantity, quantity_received)`)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  return ((data ?? []) as (PurchaseOrder & {
    lines?: { id: string; quantity: number; quantity_received: number }[]
  })[]).map((po) => ({ ...po, line_count: po.lines?.length ?? 0 }))
}

// ---------------------------------------------------------------------------
// Helpers shared with the UI
// ---------------------------------------------------------------------------

export function poSubtotalPence(lines: Pick<PurchaseOrderLine, 'line_total_pence'>[]): number {
  return lines.reduce((sum, l) => sum + (l.line_total_pence ?? 0), 0)
}

export function poLineTotalPence(unitCostPence: number, quantity: number): number {
  return Math.round((unitCostPence || 0) * (quantity || 0))
}

/** Whether every line on a PO has been fully received. */
export function isFullyReceived(
  lines: Pick<PurchaseOrderLine, 'quantity' | 'quantity_received'>[],
): boolean {
  if (lines.length === 0) return false
  return lines.every((l) => Number(l.quantity_received) >= Number(l.quantity))
}

export interface PurchaseOrderStatusMeta {
  key: PurchaseOrderStatus
  label: string
  badgeClass: string
}

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatusMeta[] = [
  { key: 'draft', label: 'Draft', badgeClass: 'bg-muted text-muted-foreground border-border' },
  { key: 'sent', label: 'Sent', badgeClass: 'bg-primary/10 text-primary border-primary/20' },
  {
    key: 'part_received',
    label: 'Part received',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    key: 'received',
    label: 'Received',
    badgeClass: 'bg-chart-4/15 text-foreground border-chart-4/30',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
  },
]

const PO_STATUS_BY_KEY = new Map<PurchaseOrderStatus, PurchaseOrderStatusMeta>(
  PURCHASE_ORDER_STATUSES.map((s) => [s.key, s]),
)

export function purchaseOrderStatusMeta(status: PurchaseOrderStatus): PurchaseOrderStatusMeta {
  return PO_STATUS_BY_KEY.get(status) ?? PURCHASE_ORDER_STATUSES[0]
}

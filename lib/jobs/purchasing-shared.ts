// Client-safe purchasing helpers. Deliberately free of `server-only` and any
// server imports so both client components and server code can use them.
import type { PurchaseOrderLine, PurchaseOrderStatus } from '@/lib/types/database'
import { STATUS_TONE_CLASS } from '@/lib/status-colors'

export interface PurchaseOrderStatusMeta {
  key: PurchaseOrderStatus
  label: string
  badgeClass: string
}

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatusMeta[] = [
  { key: 'draft', label: 'Draft', badgeClass: STATUS_TONE_CLASS.neutral },
  { key: 'sent', label: 'Sent', badgeClass: STATUS_TONE_CLASS.info },
  { key: 'part_received', label: 'Part received', badgeClass: STATUS_TONE_CLASS.warning },
  { key: 'received', label: 'Received', badgeClass: STATUS_TONE_CLASS.success },
  { key: 'cancelled', label: 'Cancelled', badgeClass: STATUS_TONE_CLASS.neutral },
]

const PO_STATUS_BY_KEY = new Map<PurchaseOrderStatus, PurchaseOrderStatusMeta>(
  PURCHASE_ORDER_STATUSES.map((s) => [s.key, s]),
)

export function purchaseOrderStatusMeta(status: PurchaseOrderStatus): PurchaseOrderStatusMeta {
  return PO_STATUS_BY_KEY.get(status) ?? PURCHASE_ORDER_STATUSES[0]
}

/** True when every line has been fully received (used to derive PO status). */
export function isFullyReceived(
  lines: Pick<PurchaseOrderLine, 'quantity' | 'quantity_received'>[],
): boolean {
  if (lines.length === 0) return false
  return lines.every((l) => Number(l.quantity_received) >= Number(l.quantity))
}

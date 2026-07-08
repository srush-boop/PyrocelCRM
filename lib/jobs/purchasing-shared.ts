// Client-safe purchasing helpers. Deliberately free of `server-only` and any
// server imports so both client components and server code can use them.
import type { PurchaseOrderLine, PurchaseOrderStatus } from '@/lib/types/database'

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

/** True when every line has been fully received (used to derive PO status). */
export function isFullyReceived(
  lines: Pick<PurchaseOrderLine, 'quantity' | 'quantity_received'>[],
): boolean {
  if (lines.length === 0) return false
  return lines.every((l) => Number(l.quantity_received) >= Number(l.quantity))
}

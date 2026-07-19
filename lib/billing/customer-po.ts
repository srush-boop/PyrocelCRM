// Customer purchase-order (PO) resolution.
//
// A customer PO can be recorded at four levels. When invoicing we resolve the
// most specific value available, falling back down the chain:
//
//   service/charge  ->  system  ->  site  ->  client
//
// The resolved value is snapshotted onto each invoice line (invoice_line_items
// .customer_po) so it survives later edits to the source records.

export interface CustomerPoSources {
  /** PO on the site_service / recurring charge (most specific). */
  servicePo?: string | null
  /** PO on the site_system. */
  systemPo?: string | null
  /** PO on the site. */
  sitePo?: string | null
  /** PO on the client (least specific). */
  clientPo?: string | null
}

/** Normalise to a trimmed non-empty string, or null. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve the effective customer PO from the four-level hierarchy.
 * Returns the most specific non-empty value, or null when none is set.
 */
export function resolveCustomerPo(sources: CustomerPoSources): string | null {
  return (
    clean(sources.servicePo) ??
    clean(sources.systemPo) ??
    clean(sources.sitePo) ??
    clean(sources.clientPo) ??
    null
  )
}

/** Which level a resolved PO came from — useful for UI hints. */
export type CustomerPoLevel = 'service' | 'system' | 'site' | 'client' | 'none'

export function resolveCustomerPoLevel(sources: CustomerPoSources): CustomerPoLevel {
  if (clean(sources.servicePo)) return 'service'
  if (clean(sources.systemPo)) return 'system'
  if (clean(sources.sitePo)) return 'site'
  if (clean(sources.clientPo)) return 'client'
  return 'none'
}

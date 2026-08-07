// Maps an in-app destination path to a short, human-friendly name so that
// "Back" buttons can be labelled with where they actually lead
// (e.g. "Back to Calls", "Back to Purchase Invoices"). Used by the global
// header back button and the task header, both of which resolve their
// destination dynamically.

// Explicit names for routes whose friendly label differs from a naive
// title-casing of the last URL segment (e.g. /dashboard/schedule -> "Calls",
// /dashboard/rams -> "RAMS"). Anything not listed here falls back to a
// title-cased last segment, which already reads well for most list routes
// (e.g. /dashboard/suppliers -> "Suppliers").
const KNOWN_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/schedule': 'Calls',
  '/dashboard/schedule/map': 'Map',
  '/dashboard/service': 'Service Dashboard',
  '/dashboard/cdo': 'CDO Management',
  '/dashboard/nearby': 'Nearby Calls',
  '/dashboard/oncall': 'On-call',
  '/dashboard/lone-worker': 'Lone Worker',
  '/dashboard/kpis': 'KPIs',
  '/dashboard/follow-ups': 'Follow-ups',
  '/dashboard/labour-costs': 'Labour Costs',
  '/dashboard/rams': 'RAMS',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/invoices/purchase-invoices': 'Purchase Invoices',
  '/dashboard/invoices/projected-revenue': 'Projected Revenue',
  '/dashboard/jobs': 'Jobs',
  '/dashboard/jobs/list': 'Jobs',
  '/dashboard/sales': 'Sales',
  '/dashboard/sales/quotes': 'Quotes',
  '/dashboard/stock': 'Stock',
  '/dashboard/vault': 'Employee Vault',
  '/dashboard/tender-ai': 'Tenders',
}

/**
 * Returns a short destination name for a path, suitable for a "Back to X"
 * label. Query strings and hashes are ignored, trailing slashes stripped.
 */
export function labelForPath(path: string): string {
  if (!path) return 'Dashboard'
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/dashboard'

  if (KNOWN_LABELS[clean]) return KNOWN_LABELS[clean]

  const segments = clean.split('/').filter(Boolean)
  // If the last segment looks like a dynamic id (uuid / number), label using
  // the parent segment instead ("/dashboard/sites/<id>" -> "Sites").
  let last = segments[segments.length - 1] ?? 'dashboard'
  const looksLikeId = /^[0-9]+$/.test(last) || /[0-9a-f]{8}-[0-9a-f]{4}/i.test(last)
  if (looksLikeId && segments.length > 1) {
    last = segments[segments.length - 2]
  }

  return last
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

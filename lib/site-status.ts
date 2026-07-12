/**
 * Site lifecycle status.
 *
 * The stored database values are kept as `live` / `new` / `dead` for backwards
 * compatibility with existing rows, queries and integrations. The UI, however,
 * presents them with friendlier terminology:
 *
 *   live  → Active   (contracted / in service — calls may be logged)
 *   new   → Engaged  (created from a job, not yet live — logging warns)
 *   dead  → Dormant  (out of service — logging is blocked)
 *
 * Always render site statuses through {@link siteStatusLabel} so the wording
 * stays consistent everywhere.
 */
export type SiteStatus = 'live' | 'new' | 'dead'

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  live: 'Active',
  new: 'Engaged',
  dead: 'Dormant',
}

/** Human-friendly label for a site status. Unknown/empty falls back to Active. */
export function siteStatusLabel(status?: string | null): string {
  if (!status) return SITE_STATUS_LABELS.live
  return SITE_STATUS_LABELS[status as SiteStatus] ?? status
}

/** Whether calls may be logged against a site of this status without a warning. */
export function isSiteLoggable(status?: string | null): boolean {
  return status !== 'dead'
}

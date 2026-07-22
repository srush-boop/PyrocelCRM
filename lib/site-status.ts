/**
 * Site lifecycle status.
 *
 * Sites share the app-wide entity lifecycle model (see `lib/entity-status`).
 * The stored DB values are `live` / `new` / `dead`; the UI presents them as
 * Active / Engaged / Dormant. This module re-exports the shared helpers and
 * keeps the site-specific `isSiteLoggable` convenience.
 */
import {
  ENTITY_STATUS_LABELS,
  type EntityStatus,
  entityStatusLabel,
} from '@/lib/entity-status'

export type SiteStatus = EntityStatus

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = ENTITY_STATUS_LABELS

/** Human-friendly label for a site status. Unknown/empty falls back to Active. */
export function siteStatusLabel(status?: string | null): string {
  return entityStatusLabel(status)
}

/** Whether calls may be logged against a site of this status without a warning. */
export function isSiteLoggable(status?: string | null): boolean {
  return status !== 'dead'
}

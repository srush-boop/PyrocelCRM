/**
 * Shared lifecycle status for the core CRM entities: clients, sites, systems
 * and services. ONE consistent model so a status always means the same thing.
 *
 * Stored DB values stay `live` / `new` / `dead` (backwards compatible with
 * existing site rows, queries and integrations). The UI always presents them
 * with friendlier, consistent terminology:
 *
 *   live  → Active   Normal. Visits generate, billing runs.
 *   new   → Engaged  Paused. NO new visits, NO billing. Contract retained.
 *   dead  → Dormant  Fully off. NO visits, NO billing. Effectively ended.
 *
 * Effective status cascades DOWN the hierarchy (client → site → system →
 * service): the most restrictive status wins, so a Dormant site makes all its
 * systems/services behave Dormant even if their own status is Active.
 */
import { cn } from '@/lib/utils'

export type EntityStatus = 'live' | 'new' | 'dead'

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  live: 'Active',
  new: 'Engaged',
  dead: 'Dormant',
}

/** All statuses in display order, for building Select options. */
export const ENTITY_STATUS_OPTIONS: EntityStatus[] = ['live', 'new', 'dead']

/** Short one-line meaning, handy for Select descriptions / tooltips. */
export const ENTITY_STATUS_HINTS: Record<EntityStatus, string> = {
  live: 'Normal — visits generate and billing runs',
  new: 'Paused — no visits or billing, contract retained',
  dead: 'Off — no visits or billing, effectively ended',
}

/** Most-restrictive-wins ranking. */
const STATUS_RANK: Record<EntityStatus, number> = { live: 0, new: 1, dead: 2 }

function normalize(status?: string | null): EntityStatus {
  if (status === 'new' || status === 'dead') return status
  return 'live'
}

/** Human-friendly label for a stored status. Unknown/empty falls back to Active. */
export function entityStatusLabel(status?: string | null): string {
  return ENTITY_STATUS_LABELS[normalize(status)]
}

/**
 * Effective status across a hierarchy — pass an entity's own status plus any
 * ancestor statuses; the most restrictive one wins.
 */
export function effectiveStatus(...statuses: Array<string | null | undefined>): EntityStatus {
  let worst: EntityStatus = 'live'
  for (const s of statuses) {
    const n = normalize(s)
    if (STATUS_RANK[n] > STATUS_RANK[worst]) worst = n
  }
  return worst
}

/** True only when the (effective) status is live/Active. */
export function isLive(status?: string | null): boolean {
  return normalize(status) === 'live'
}

/** Visits should only ever generate for a live entity. */
export function blocksVisits(status?: string | null): boolean {
  return !isLive(status)
}

/** Billing should only ever run for a live entity. */
export function blocksBilling(status?: string | null): boolean {
  return !isLive(status)
}

const STATUS_BADGE_CLASS: Record<EntityStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  new: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
  dead: 'bg-zinc-500/12 text-zinc-600 border-zinc-500/25 dark:text-zinc-300',
}

/**
 * Small coloured status pill (Active=emerald, Engaged=amber, Dormant=zinc).
 *
 * Pass `effective` when a parent downgrades this entity's status — the badge
 * shows the effective status and appends "· via <source>" so it's clear the
 * downgrade is inherited, not the entity's own setting.
 */
export function StatusBadge({
  status,
  effective,
  effectiveSource,
  className,
}: {
  status?: string | null
  /** Effective status after cascade, if different from the entity's own. */
  effective?: string | null
  /** e.g. "site" or "client" — what caused the downgrade. */
  effectiveSource?: string
  className?: string
}) {
  const own = normalize(status)
  const eff = effective ? normalize(effective) : own
  const downgraded = STATUS_RANK[eff] > STATUS_RANK[own]
  const shown = downgraded ? eff : own

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_BADGE_CLASS[shown],
        className,
      )}
    >
      {ENTITY_STATUS_LABELS[shown]}
      {downgraded && effectiveSource && (
        <span className="font-normal opacity-70">{`\u00b7 via ${effectiveSource}`}</span>
      )}
    </span>
  )
}

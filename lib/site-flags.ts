import type { LucideIcon } from 'lucide-react'
import { CalendarClock, DoorOpen, KeyRound, Users, Wrench } from 'lucide-react'
import type { ResolvedSiteFlags, Site, SiteService } from '@/lib/types/database'

// The boolean flag keys shared by sites and site_services.
export type SiteFlagKey =
  | 'booking_required'
  | 'access_required'
  | 'keys_required'
  | 'two_engineers_required'
  | 'remedial_required'

export const SITE_FLAG_META: Record<
  SiteFlagKey,
  { label: string; short: string; icon: LucideIcon }
> = {
  booking_required: { label: 'Must be booked in advance', short: 'Booking', icon: CalendarClock },
  access_required: { label: 'Access equipment required', short: 'Access equip', icon: DoorOpen },
  keys_required: { label: 'Keys required', short: 'Keys', icon: KeyRound },
  two_engineers_required: { label: '2 engineers required', short: '2 men', icon: Users },
  remedial_required: { label: 'Remedial works required', short: 'Remedial', icon: Wrench },
}

export const SITE_FLAG_KEYS: SiteFlagKey[] = [
  'booking_required',
  'access_required',
  'keys_required',
  'two_engineers_required',
  'remedial_required',
]

// The flags a user can manually toggle on a site/service. `remedial_required` is
// intentionally excluded: it is no longer a manual toggle but is derived
// automatically from open remedial calls (see resolveSiteFlags `remedialOpen`).
export type EditableSiteFlagKey = Exclude<SiteFlagKey, 'remedial_required'>

export const EDITABLE_SITE_FLAG_KEYS: EditableSiteFlagKey[] = [
  'booking_required',
  'access_required',
  'keys_required',
  'two_engineers_required',
]

type SiteFlagSource = Partial<
  Pick<
    Site,
    | 'booking_required'
    | 'access_required'
    | 'keys_required'
    | 'two_engineers_required'
    | 'remedial_required'
    | 'remedial_notes'
  >
>

type ServiceFlagSource = Partial<
  Pick<
    SiteService,
    | 'booking_required'
    | 'access_required'
    | 'keys_required'
    | 'two_engineers_required'
    | 'remedial_required'
    | 'remedial_notes'
  >
>

// A system sits between the site default and the individual service. Like a
// service, each flag is tri-state: `null`/`undefined` inherits the site default,
// an explicit boolean overrides it (and is itself overridden by the service).
export type SystemFlagSource = Partial<{
  booking_required: boolean | null
  access_required: boolean | null
  keys_required: boolean | null
  two_engineers_required: boolean | null
  remedial_notes: string | null
}>

/**
 * Resolve the effective pre-attendance flags for a task/service by layering
 * overrides in order of specificity: site default → system → service. For each
 * flag, the most specific tier that has an explicit boolean wins; `null`/
 * `undefined` at a tier means "inherit from the tier above". Remedial notes from
 * every tier are combined so nothing is lost.
 */
export function resolveSiteFlags(
  site: SiteFlagSource | null | undefined,
  service?: ServiceFlagSource | null,
  opts?: {
    /**
     * The system (parent of the service) this task belongs to. Its flags sit
     * between the site default and the service override.
     */
    system?: SystemFlagSource | null
    /**
     * Whether a remedial call is currently outstanding for this site/service.
     * `remedial_required` is derived from this instead of a stored toggle, so
     * the pre-attendance alert appears automatically once a remedial quote is
     * accepted (and clears when the remedial call is completed).
     */
    remedialOpen?: boolean
  },
): ResolvedSiteFlags {
  const system = opts?.system
  const pick = (key: SiteFlagKey): boolean => {
    // Service is most specific, then system, then the site default.
    const serviceVal = service?.[key]
    if (serviceVal === true || serviceVal === false) return serviceVal
    const systemVal = key === 'remedial_required' ? undefined : system?.[key as keyof SystemFlagSource]
    if (systemVal === true || systemVal === false) return systemVal
    return Boolean(site?.[key])
  }

  const siteNote = site?.remedial_notes?.trim() || null
  const systemNote = system?.remedial_notes?.trim() || null
  const serviceNote = service?.remedial_notes?.trim() || null
  // Combine notes from every tier (most specific first), dropping duplicates.
  const noteParts: string[] = []
  for (const [label, note] of [
    ['', serviceNote],
    ['System', systemNote],
    ['Site', siteNote],
  ] as const) {
    if (note && !noteParts.some((p) => p.includes(note))) {
      noteParts.push(label ? `(${label}: ${note})` : note)
    }
  }
  const remedialNotes: string | null = noteParts.length > 0 ? noteParts.join('\n\n') : null

  return {
    booking_required: pick('booking_required'),
    access_required: pick('access_required'),
    keys_required: pick('keys_required'),
    two_engineers_required: pick('two_engineers_required'),
    remedial_required: Boolean(opts?.remedialOpen),
    remedial_notes: remedialNotes,
  }
}

/** Return only the flag keys that are active, for compact icon rendering. */
export function activeFlagKeys(flags: ResolvedSiteFlags): SiteFlagKey[] {
  return SITE_FLAG_KEYS.filter((key) => flags[key])
}

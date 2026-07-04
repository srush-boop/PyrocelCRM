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
  access_required: { label: 'Access required', short: 'Access', icon: DoorOpen },
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

/**
 * Resolve the effective pre-attendance flags for a task/service by layering the
 * service-level overrides on top of the site defaults. A service value of
 * `null`/`undefined` inherits the site value; an explicit boolean overrides it.
 * Remedial notes from the site and service are combined so nothing is lost.
 */
export function resolveSiteFlags(
  site: SiteFlagSource | null | undefined,
  service?: ServiceFlagSource | null,
  opts?: {
    /**
     * Whether a remedial call is currently outstanding for this site/service.
     * `remedial_required` is derived from this instead of a stored toggle, so
     * the pre-attendance alert appears automatically once a remedial quote is
     * accepted (and clears when the remedial call is completed).
     */
    remedialOpen?: boolean
  },
): ResolvedSiteFlags {
  const pick = (key: SiteFlagKey): boolean => {
    const override = service?.[key]
    if (override === true || override === false) return override
    return Boolean(site?.[key])
  }

  const siteNote = site?.remedial_notes?.trim() || null
  const serviceNote = service?.remedial_notes?.trim() || null
  let remedialNotes: string | null = null
  if (siteNote && serviceNote && siteNote !== serviceNote) {
    remedialNotes = `${serviceNote}\n\n(Site: ${siteNote})`
  } else {
    remedialNotes = serviceNote || siteNote
  }

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

// Site / system "authorised works" pre-authorisation for non-recurring works.
//
// A site (and, per §6, a system) can carry a standing authorisation: a spend
// limit plus a PO that covers ad-hoc / reactive works up to that value without
// raising a per-call PO request. The system-level allowance is preferred over
// the site-level one when both are set.

export interface AuthorisedWorksSources {
  /** System-level allowance (preferred). */
  systemLimitPence?: number | null
  systemPo?: string | null
  /** Site-level allowance (fallback). */
  siteLimitPence?: number | null
  sitePo?: string | null
}

export type AuthorisedWorksLevel = 'system' | 'site' | 'none'

export interface ResolvedAuthorisedWorks {
  level: AuthorisedWorksLevel
  /** The spend ceiling in pence (>0 when an authorisation applies). */
  limitPence: number
  /** The PO to stamp onto the call. */
  po: string | null
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/**
 * Resolve the effective authorised-works authorisation. An authorisation only
 * applies when BOTH a limit > 0 and a PO are present at that level. Returns the
 * system-level authorisation when valid, else the site-level, else none.
 */
export function resolveAuthorisedWorks(
  sources: AuthorisedWorksSources,
): ResolvedAuthorisedWorks {
  const sysLimit = sources.systemLimitPence ?? 0
  const sysPo = clean(sources.systemPo)
  if (sysLimit > 0 && sysPo) {
    return { level: 'system', limitPence: sysLimit, po: sysPo }
  }

  const siteLimit = sources.siteLimitPence ?? 0
  const sitePo = clean(sources.sitePo)
  if (siteLimit > 0 && sitePo) {
    return { level: 'site', limitPence: siteLimit, po: sitePo }
  }

  return { level: 'none', limitPence: 0, po: null }
}

/**
 * Whether an (estimated) value is covered by the resolved authorisation. When
 * no estimate is known (booking time), the call is treated as within the limit
 * so the standing PO is applied; the true value is checked at chargeable review.
 */
export function isWithinAuthorisedWorks(
  resolved: ResolvedAuthorisedWorks,
  estimatedPence?: number | null,
): boolean {
  if (resolved.level === 'none' || resolved.limitPence <= 0 || !resolved.po) return false
  if (estimatedPence == null) return true
  return estimatedPence <= resolved.limitPence
}

/**
 * Pure UK postcode → area matching. No server/client dependencies so it can run
 * in the planner (client) and the site page (server) alike.
 *
 * A rule prefix is one of three levels:
 *   area letters  "NE"
 *   district      "NE2"   (the outward code)
 *   sector        "NE2 4" (outward + first inward digit)
 * The most specific matching rule wins: sector > district > area letters.
 */

export interface AreaPostcodeRule {
  prefix: string
  areaId: string
}

export interface PostcodeParts {
  area: string
  district: string
  sector: string | null
}

const AREA_RE = /^[A-Z]{1,2}$/
const DISTRICT_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/
const SECTOR_RE = /^[A-Z]{1,2}\d[A-Z\d]? \d$/

/** Split a full or partial postcode into area letters / district / sector. */
export function postcodeParts(postcode: string | null | undefined): PostcodeParts | null {
  if (!postcode) return null
  const compact = postcode.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length < 2) return null

  // A full UK postcode's inward code is always the last 3 characters (digit + 2 letters).
  let district = compact
  let sector: string | null = null
  if (compact.length >= 5 && /\d[A-Z]{2}$/.test(compact)) {
    district = compact.slice(0, -3)
    sector = `${district} ${compact.slice(-3, -2)}`
  }
  if (!DISTRICT_RE.test(district)) {
    const letters = compact.match(/^[A-Z]{1,2}/)?.[0]
    return letters ? { area: letters, district: letters, sector: null } : null
  }
  const area = district.match(/^[A-Z]{1,2}/)![0]
  return { area, district, sector }
}

/** Normalise a user-entered rule prefix; returns null when it isn't a valid level. */
export function normalisePrefix(input: string): string | null {
  const v = input.toUpperCase().replace(/\s+/g, ' ').trim()
  if (AREA_RE.test(v) || DISTRICT_RE.test(v) || SECTOR_RE.test(v)) return v
  // Accept "NE24" typed without a space as a sector only when it can't be a district.
  return null
}

export function prefixLevel(prefix: string): 'sector' | 'district' | 'area' {
  if (SECTOR_RE.test(prefix)) return 'sector'
  if (DISTRICT_RE.test(prefix)) return 'district'
  return 'area'
}

export interface AreaMatch {
  areaId: string
  prefix: string
}

/** Most specific rule matching this postcode, or null. */
export function matchArea(
  postcode: string | null | undefined,
  rules: AreaPostcodeRule[],
): AreaMatch | null {
  const parts = postcodeParts(postcode)
  if (!parts) return null
  const byPrefix = new Map(rules.map((r) => [r.prefix, r.areaId]))
  for (const candidate of [parts.sector, parts.district, parts.area]) {
    if (!candidate) continue
    const areaId = byPrefix.get(candidate)
    if (areaId) return { areaId, prefix: candidate }
  }
  return null
}

/** Distinct, readable colours offered for areas on the planner map. */
export const AREA_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#475569',
  '#ea580c',
] as const

export function nextAreaColor(usedColors: (string | null | undefined)[]): string {
  const counts = new Map<string, number>(AREA_COLORS.map((c) => [c, 0]))
  for (const c of usedColors) if (c && counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best: string = AREA_COLORS[0]
  for (const c of AREA_COLORS) if ((counts.get(c) ?? 0) < (counts.get(best) ?? 0)) best = c
  return best
}

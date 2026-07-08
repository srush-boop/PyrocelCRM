import "server-only"

/**
 * Postcode geocoding via postcodes.io (free, UK, no API key).
 * Used to convert site postcodes into coordinates so we can compute
 * straight-line distance for the engineer "nearby calls" feature.
 */

export interface LatLng {
  latitude: number
  longitude: number
}

interface PostcodesBulkResult {
  status: number
  result: Array<{
    query: string
    result: { postcode: string; latitude: number; longitude: number } | null
  }>
}

/** Normalise a postcode for consistent comparison/lookup. */
function normalisePostcode(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, " ")
}

/**
 * Geocode many postcodes at once. Returns a map keyed by the ORIGINAL
 * postcode string passed in, so callers can map results back to their rows.
 * Unknown/invalid postcodes are simply omitted from the result map.
 */
export async function geocodePostcodes(
  postcodes: string[]
): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>()
  const cleaned = Array.from(
    new Set(
      postcodes
        .map((p) => (p ? normalisePostcode(p) : ""))
        .filter((p) => p.length > 0)
    )
  )
  if (cleaned.length === 0) return out

  // postcodes.io bulk endpoint accepts up to 100 postcodes per request.
  const chunks: string[][] = []
  for (let i = 0; i < cleaned.length; i += 100) {
    chunks.push(cleaned.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
        // Don't cache at the fetch layer; we cache results in the DB instead.
        cache: "no-store",
      })
      if (!res.ok) continue
      const data = (await res.json()) as PostcodesBulkResult
      for (const entry of data.result || []) {
        if (entry.result) {
          out.set(normalisePostcode(entry.query), {
            latitude: entry.result.latitude,
            longitude: entry.result.longitude,
          })
        }
      }
    } catch {
      // Network/parse failure for a chunk should not abort the whole batch.
      continue
    }
  }

  return out
}

/** A site (or any location) to resolve to coordinates for map placement. */
export interface GeocodeSiteInput {
  id: string
  address: string | null
  postcode: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Geocode a single free-form UK address (+ postcode) via Nominatim
 * (OpenStreetMap). This resolves the actual street address, so markers land on
 * the building rather than the postcode centroid. Free and key-less, but
 * rate-limited (~1 req/s) and requires a descriptive User-Agent.
 */
async function geocodeAddressNominatim(
  address: string | null,
  postcode: string | null
): Promise<LatLng | null> {
  const parts = [address?.trim(), postcode?.trim()].filter(
    (p): p is string => Boolean(p && p.length > 0)
  )
  if (parts.length === 0) return null
  const query = `${parts.join(", ")}, United Kingdom`
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=" +
      encodeURIComponent(query)
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PyrocelCRM/1.0 (dispatch map site geocoding)",
        "Accept-Language": "en-GB",
      },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(data) || data.length === 0) return null
    const latitude = Number.parseFloat(data[0].lat)
    const longitude = Number.parseFloat(data[0].lon)
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolve sites to coordinates for map markers, preferring the full street
 * address (via Nominatim) for accuracy and falling back to the postcode
 * centroid (via postcodes.io) when the address can't be resolved or is missing.
 * Returns a map keyed by the site id.
 *
 * Address lookups run sequentially to respect Nominatim's ~1 req/s policy and
 * are capped per call (`maxAddressLookups`) so a large backlog never blocks a
 * request; the remainder use the fast bulk postcode fallback and will be
 * upgraded on subsequent runs as results are cached by callers.
 */
export async function geocodeSites(
  sites: GeocodeSiteInput[],
  maxAddressLookups = 8
): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>()
  if (sites.length === 0) return out

  const needPostcodeFallback: GeocodeSiteInput[] = []
  let addressLookups = 0
  for (const site of sites) {
    const hasAddress = Boolean(site.address && site.address.trim().length > 0)
    if (hasAddress && addressLookups < maxAddressLookups) {
      addressLookups += 1
      const hit = await geocodeAddressNominatim(site.address, site.postcode)
      if (hit) {
        out.set(site.id, hit)
        // Space out requests to stay within Nominatim's usage policy.
        await sleep(1100)
        continue
      }
    }
    needPostcodeFallback.push(site)
  }

  // Postcode-centroid fallback (bulk, fast) for anything not resolved above.
  const fallbackPostcodes = needPostcodeFallback
    .map((s) => s.postcode)
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
  if (fallbackPostcodes.length > 0) {
    const byPostcode = await geocodePostcodes(fallbackPostcodes)
    for (const site of needPostcodeFallback) {
      if (!site.postcode) continue
      const hit = byPostcode.get(normalisePostcode(site.postcode))
      if (hit) out.set(site.id, hit)
    }
  }

  return out
}

/** Haversine great-circle distance in miles between two coordinates. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export { normalisePostcode }

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

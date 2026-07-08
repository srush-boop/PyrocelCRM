import 'server-only'
import { distanceMiles, type LatLng } from '@/lib/geocode'

/**
 * Driving routes via the public OSRM demo server (free, no API key). Used by the
 * dispatch map to draw real road routes and estimate driving ETAs, rather than
 * straight-line distances. Best-effort: any failure (network, rate limit, empty
 * result) falls back to a straight-line haversine estimate with
 * `approximate: true` so callers can degrade gracefully.
 *
 * The OSRM demo is rate-limited and intended for light/internal use only.
 */

export interface DrivingRoute {
  /** Ordered [lat, lng] pairs forming the route polyline. */
  coordinates: [number, number][]
  miles: number
  minutes: number
  /** True when this is a straight-line fallback, not a real road route. */
  approximate: boolean
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'
const KM_TO_MILES = 0.621371

/** Straight-line fallback: connect the raw points, sum haversine legs. */
function straightLine(points: LatLng[]): DrivingRoute {
  let miles = 0
  for (let i = 1; i < points.length; i++) {
    miles += distanceMiles(points[i - 1], points[i])
  }
  // Rough driving assumption ~30mph average for an internal estimate.
  const minutes = miles > 0 ? (miles / 30) * 60 : 0
  return {
    coordinates: points.map((p) => [p.latitude, p.longitude] as [number, number]),
    miles: Math.round(miles * 10) / 10,
    minutes: Math.round(minutes),
    approximate: true,
  }
}

/**
 * Compute a driving route through the given points (in order). Requires at least
 * two points; fewer returns an empty, approximate route.
 */
export async function drivingRoute(points: LatLng[]): Promise<DrivingRoute> {
  if (points.length < 2) {
    return {
      coordinates: points.map((p) => [p.latitude, p.longitude] as [number, number]),
      miles: 0,
      minutes: 0,
      approximate: true,
    }
  }

  // OSRM expects lng,lat pairs separated by semicolons.
  const coordPath = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `${OSRM_BASE}/${coordPath}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      // Guard against a hung demo server holding up the whole dispatch panel.
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return straightLine(points)
    const data = (await res.json()) as {
      code: string
      routes?: Array<{
        distance: number // metres
        duration: number // seconds
        geometry: { coordinates: [number, number][] } // [lng, lat]
      }>
    }
    const route = data.code === 'Ok' ? data.routes?.[0] : undefined
    if (!route) return straightLine(points)

    return {
      // Flip [lng,lat] → [lat,lng] for Leaflet.
      coordinates: route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]),
      miles: Math.round((route.distance / 1000) * KM_TO_MILES * 10) / 10,
      minutes: Math.round(route.duration / 60),
      approximate: false,
    }
  } catch {
    return straightLine(points)
  }
}

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

export interface DrivingLeg {
  miles: number
  minutes: number
}

export interface DrivingLegsResult {
  /** Ordered [lat, lng] pairs forming the full route polyline. */
  coordinates: [number, number][]
  totalMiles: number
  totalMinutes: number
  /** Per-leg driving time/distance between consecutive points (n-1 legs). */
  legs: DrivingLeg[]
  approximate: boolean
}

/** Straight-line fallback that also reports each individual leg. */
function straightLineLegs(points: LatLng[]): DrivingLegsResult {
  const legs: DrivingLeg[] = []
  let totalMiles = 0
  for (let i = 1; i < points.length; i++) {
    const miles = distanceMiles(points[i - 1], points[i])
    totalMiles += miles
    legs.push({ miles: Math.round(miles * 10) / 10, minutes: Math.round((miles / 30) * 60) })
  }
  return {
    coordinates: points.map((p) => [p.latitude, p.longitude] as [number, number]),
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalMinutes: legs.reduce((a, l) => a + l.minutes, 0),
    legs,
    approximate: true,
  }
}

/**
 * Like `drivingRoute`, but also returns per-leg driving time/distance (from
 * OSRM's `legs[]`) so a route timeline can show the drive between each stop.
 */
export async function drivingLegs(points: LatLng[]): Promise<DrivingLegsResult> {
  if (points.length < 2) {
    return {
      coordinates: points.map((p) => [p.latitude, p.longitude] as [number, number]),
      totalMiles: 0,
      totalMinutes: 0,
      legs: [],
      approximate: true,
    }
  }

  const coordPath = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `${OSRM_BASE}/${coordPath}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    if (!res.ok) return straightLineLegs(points)
    const data = (await res.json()) as {
      code: string
      routes?: Array<{
        distance: number
        duration: number
        geometry: { coordinates: [number, number][] }
        legs?: Array<{ distance: number; duration: number }>
      }>
    }
    const route = data.code === 'Ok' ? data.routes?.[0] : undefined
    if (!route) return straightLineLegs(points)

    const legs: DrivingLeg[] = (route.legs ?? []).map((l) => ({
      miles: Math.round((l.distance / 1000) * KM_TO_MILES * 10) / 10,
      minutes: Math.round(l.duration / 60),
    }))

    return {
      coordinates: route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]),
      totalMiles: Math.round((route.distance / 1000) * KM_TO_MILES * 10) / 10,
      totalMinutes: Math.round(route.duration / 60),
      legs,
      approximate: false,
    }
  } catch {
    return straightLineLegs(points)
  }
}

export interface DrivingMatrix {
  /** NxN driving durations in minutes; [i][j] = from point i to point j. */
  durations: number[][]
  /** NxN driving distances in miles. */
  distances: number[][]
  approximate: boolean
}

/** Straight-line NxN fallback matrix (haversine, ~30mph). */
function straightLineMatrix(points: LatLng[]): DrivingMatrix {
  const n = points.length
  const durations: number[][] = []
  const distances: number[][] = []
  for (let i = 0; i < n; i++) {
    durations[i] = []
    distances[i] = []
    for (let j = 0; j < n; j++) {
      const miles = i === j ? 0 : distanceMiles(points[i], points[j])
      distances[i][j] = Math.round(miles * 10) / 10
      durations[i][j] = Math.round((miles / 30) * 60)
    }
  }
  return { durations, distances, approximate: true }
}

/**
 * Full N×N driving matrix via OSRM's `table` service (one request). Fetched once
 * per view so the client can recompute leg times instantly when the visit order
 * changes, without hitting the network on every drag. Falls back to a
 * straight-line matrix on any failure.
 */
export async function drivingMatrix(points: LatLng[]): Promise<DrivingMatrix> {
  if (points.length < 2) {
    return { durations: [[0]], distances: [[0]], approximate: true }
  }

  const coordPath = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `https://router.project-osrm.org/table/v1/driving/${coordPath}?annotations=duration,distance`

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return straightLineMatrix(points)
    const data = (await res.json()) as {
      code: string
      durations?: number[][] // seconds
      distances?: number[][] // metres
    }
    if (data.code !== 'Ok' || !data.durations) return straightLineMatrix(points)

    const durations = data.durations.map((row) => row.map((s) => Math.round((s ?? 0) / 60)))
    const distances = (data.distances ?? []).map((row) =>
      row.map((m) => Math.round((m ?? 0) / 1000 * KM_TO_MILES * 10) / 10),
    )
    // If OSRM omitted distances, approximate them from straight-line.
    const distancesFilled =
      distances.length === points.length ? distances : straightLineMatrix(points).distances

    return { durations, distances: distancesFilled, approximate: false }
  } catch {
    return straightLineMatrix(points)
  }
}

export interface TripOrderResult {
  /**
   * Optimal visiting order as 0-based indices into the `stops` argument (home
   * excluded). e.g. `[2, 0, 1]` = visit stops[2] first, then stops[0], stops[1].
   */
  order: number[]
  approximate: boolean
}

/**
 * Solve the visiting order (a TSP) that minimises driving time through
 * `home → stops… → home` using OSRM's `trip` service (free demo, no key, no live
 * traffic — typical road speeds only). Home is fixed as the first and last stop
 * (`source=first`, `roundtrip=true`). Returns `approximate: true` with the
 * unchanged order on any failure so callers can fall back to a matrix heuristic.
 */
export async function tripOrder(home: LatLng, stops: LatLng[]): Promise<TripOrderResult> {
  const identity = stops.map((_, i) => i)
  if (stops.length < 2) return { order: identity, approximate: true }

  const points = [home, ...stops]
  const coordPath = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `https://router.project-osrm.org/trip/v1/driving/${coordPath}?source=first&roundtrip=true&overview=false`

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { order: identity, approximate: true }
    const data = (await res.json()) as {
      code: string
      // waypoints[i].waypoint_index = position of input point i in the optimised tour
      waypoints?: Array<{ waypoint_index: number }>
    }
    if (data.code !== 'Ok' || !data.waypoints || data.waypoints.length !== points.length) {
      return { order: identity, approximate: true }
    }
    // Sort stop indices (input 1..n) by their optimised tour position.
    const ranked = stops
      .map((_, i) => ({ stopIndex: i, tourPos: data.waypoints![i + 1].waypoint_index }))
      .sort((a, b) => a.tourPos - b.tourPos)
    return { order: ranked.map((r) => r.stopIndex), approximate: false }
  } catch {
    return { order: identity, approximate: true }
  }
}

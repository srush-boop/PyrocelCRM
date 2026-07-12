'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  geocodePostcodes,
  geocodeSites,
  normalisePostcode,
  type LatLng,
} from '@/lib/geocode'
import { getExpectedDurations, expectedMinutesFor } from '@/lib/task-duration'
import { drivingMatrix, drivingLegs } from '@/lib/routing'
import type { Profile, WorkDayHours } from '@/lib/types/database'
import type {
  RouteEngineerOption,
  RouteMapData,
  RouteMapStop,
  RouteStopService,
} from './types'

async function requireOfficeOrAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = (profile as Profile | null)?.role
  if (!profile || role === 'engineer') {
    return { ok: false as const, error: 'Not authorised' }
  }
  return { ok: true as const, supabase, profile: profile as Profile }
}

function toEngineerOption(row: {
  id: string
  full_name: string | null
  email?: string | null
  home_postcode: string | null
  home_latitude: number | null
  home_longitude: number | null
  work_day_hours: WorkDayHours | null
}): RouteEngineerOption {
  return {
    id: row.id,
    name: row.full_name || row.email || 'Engineer',
    homePostcode: row.home_postcode,
    homeLatitude: row.home_latitude,
    homeLongitude: row.home_longitude,
    workDayHours: row.work_day_hours ?? null,
  }
}

interface RawRouteService {
  id: string
  site_id: string
  service_type_id: string | null
  frequency_unit: string | null
  frequency_value: number | null
  active: boolean | null
  service_type: { name: string | null } | { name: string | null }[] | null
  site_system: { name: string | null } | { name: string | null }[] | null
  site:
    | {
        id: string
        name: string | null
        postcode: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
        route_position: number | null
      }
    | {
        id: string
        name: string | null
        postcode: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
        route_position: number | null
      }[]
    | null
}

function rel<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Load everything the route map planner needs for a given CDO selection. Safe to
 * call from the server component (page) and from the client (CDO/engineer change).
 * Geocodes + caches any missing site/home coordinates, and builds the driving
 * matrix over [home, ...located stops] so the client can recompute ETAs on
 * reorder without further network calls.
 */
export async function getRouteMapData(
  routeId: string,
  engineerId?: string | null,
): Promise<{ data: RouteMapData | null; error: string | null }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { data: null, error: auth.error }
  const { supabase } = auth

  const { data: route } = await supabase
    .from('routes')
    .select('id, name, color, assigned_engineer_id')
    .eq('id', routeId)
    .single()
  if (!route) return { data: null, error: 'Route not found' }

  // Engineer roster for the CDO picker.
  const { data: engRows } = await supabase
    .from('profiles')
    .select('id, full_name, email, home_postcode, home_latitude, home_longitude, home_geocoded_at, work_day_hours')
    .eq('role', 'engineer')
    .eq('status', 'active')
    .order('full_name')

  const engineers = ((engRows || []) as unknown as Parameters<typeof toEngineerOption>[0][]).map(
    toEngineerOption,
  )

  const selectedId = engineerId ?? route.assigned_engineer_id ?? null
  let engineer = selectedId ? engineers.find((e) => e.id === selectedId) ?? null : null

  // On-route services (service-level membership), grouped by site.
  const { data: svcRows } = await supabase
    .from('site_services')
    .select(
      `id, site_id, service_type_id, frequency_unit, frequency_value, active,
       service_type:service_types(name),
       site_system:site_systems(name),
       site:sites(id, name, postcode, address, latitude, longitude, route_position)`,
    )
    .eq('route_id', routeId)

  const durations = await getExpectedDurations(supabase)

  const services = ((svcRows || []) as unknown as RawRouteService[]).filter(
    (s) => s.active !== false,
  )

  // Group services by site.
  const stopMap = new Map<string, RouteMapStop>()
  for (const svc of services) {
    const site = rel(svc.site)
    if (!site) continue
    const est = expectedMinutesFor(durations, { serviceTypeId: svc.service_type_id })
    const systemName = rel(svc.site_system)?.name ?? null
    const serviceName = rel(svc.service_type)?.name ?? 'Service'
    const label = systemName ? `${systemName} · ${serviceName}` : serviceName
    const svcRow: RouteStopService = {
      id: svc.id,
      label,
      minutes: est.minutes,
      learned: est.learned,
      sampleSize: est.sampleSize,
      frequencyUnit: svc.frequency_unit,
      frequencyValue: svc.frequency_value,
    }
    const existing = stopMap.get(site.id)
    if (existing) {
      existing.services.push(svcRow)
      existing.onSiteMinutes += est.minutes
    } else {
      stopMap.set(site.id, {
        siteId: site.id,
        name: site.name || 'Site',
        postcode: site.postcode,
        latitude: site.latitude,
        longitude: site.longitude,
        routePosition: site.route_position,
        onSiteMinutes: est.minutes,
        services: [svcRow],
        hasLocation: site.latitude != null && site.longitude != null,
      })
    }
  }

  // Backfill + cache missing site coordinates.
  const rawSites = services
    .map((s) => rel(s.site))
    .filter((s): s is NonNullable<ReturnType<typeof rel>> => Boolean(s))
  const needGeocode = Array.from(stopMap.values()).filter(
    (st) => !st.hasLocation && st.postcode,
  )
  if (needGeocode.length > 0) {
    const geo = await geocodeSites(
      needGeocode.map((st) => {
        const raw = rawSites.find((r) => r.id === st.siteId)
        return { id: st.siteId, address: raw?.address ?? null, postcode: st.postcode }
      }),
    )
    if (geo.size > 0) {
      const admin = createAdminClient()
      const updates: { id: string; lat: number; lng: number }[] = []
      for (const [siteId, hit] of geo) {
        updates.push({ id: siteId, lat: hit.latitude, lng: hit.longitude })
        const st = stopMap.get(siteId)
        if (st) {
          st.latitude = hit.latitude
          st.longitude = hit.longitude
          st.hasLocation = true
        }
      }
      await Promise.all(
        updates.map((u) =>
          admin
            .from('sites')
            .update({ latitude: u.lat, longitude: u.lng, geocoded_at: new Date().toISOString() })
            .eq('id', u.id),
        ),
      )
    }
  }

  // Backfill engineer home coords from postcode where missing.
  if (engineer && engineer.homeLatitude == null && engineer.homePostcode) {
    const geo = await geocodePostcodes([engineer.homePostcode])
    const hit = geo.get(normalisePostcode(engineer.homePostcode))
    if (hit) {
      engineer = { ...engineer, homeLatitude: hit.latitude, homeLongitude: hit.longitude }
      const admin = createAdminClient()
      await admin
        .from('profiles')
        .update({
          home_latitude: hit.latitude,
          home_longitude: hit.longitude,
          home_geocoded_at: new Date().toISOString(),
        })
        .eq('id', engineer.id)
    }
  }

  // Order stops by saved route_position (nulls last), then name.
  const stops = Array.from(stopMap.values()).sort((a, b) => {
    const pa = a.routePosition ?? Number.MAX_SAFE_INTEGER
    const pb = b.routePosition ?? Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb
    return a.name.localeCompare(b.name)
  })

  // Build the driving matrix over [home, ...located stops] when we have a home.
  const located = stops.filter((s) => s.hasLocation)
  let matrix: RouteMapData['matrix'] = null
  const locatedStopIds = located.map((s) => s.siteId)
  const home: LatLng | null =
    engineer && engineer.homeLatitude != null && engineer.homeLongitude != null
      ? { latitude: engineer.homeLatitude, longitude: engineer.homeLongitude }
      : null

  if (home && located.length > 0) {
    const points: LatLng[] = [
      home,
      ...located.map((s) => ({ latitude: s.latitude as number, longitude: s.longitude as number })),
    ]
    const m = await drivingMatrix(points)
    matrix = { durations: m.durations, distances: m.distances, approximate: m.approximate }
  }

  return {
    data: {
      routeId: route.id,
      routeName: route.name,
      routeColor: (route as { color: string | null }).color ?? null,
      assignedEngineerId: route.assigned_engineer_id ?? null,
      engineer,
      stops,
      locatedStopIds,
      matrix,
      engineers,
    },
    error: null,
  }
}

/**
 * Persist a new visit order for the route's sites (mirrors the planner dialog's
 * reorder). `orderedSiteIds` is the sites in the desired order.
 */
export async function saveRouteOrder(
  routeId: string,
  orderedSiteIds: string[],
): Promise<{ error: string | null }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { error: auth.error }
  const { supabase } = auth

  // Update each site's position. RLS lets office/admin update sites.
  const results = await Promise.all(
    orderedSiteIds.map((siteId, index) =>
      supabase.from('sites').update({ route_position: index + 1 }).eq('id', siteId),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePath(`/dashboard/routes/${routeId}`)
  return { error: null }
}

/**
 * Best-effort driving polyline for the CURRENT order (home → stops… → home).
 * Called (debounced) after a reorder to refresh the drawn road path; ETAs
 * themselves are recomputed instantly client-side from the matrix. Falls back to
 * an approximate straight-line geometry via `drivingLegs`.
 */
export async function getRoutePolyline(
  points: { latitude: number; longitude: number }[],
): Promise<{ coordinates: [number, number][]; approximate: boolean }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok || points.length < 2) return { coordinates: [], approximate: true }
  const result = await drivingLegs(points)
  return { coordinates: result.coordinates, approximate: result.approximate }
}

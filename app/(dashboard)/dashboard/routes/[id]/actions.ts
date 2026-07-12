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
import { drivingMatrix, drivingLegs, tripOrder } from '@/lib/routing'
import type { Profile, WorkDayHours } from '@/lib/types/database'
import type {
  RouteEngineerOption,
  RouteMapData,
  RouteMapStop,
  RouteStopService,
  RouteActualsData,
  RouteActualVisit,
  RouteWeekOption,
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
  type RawSite = {
    id: string
    address: string | null
  }
  const rawSites: RawSite[] = []
  for (const s of services) {
    const site = rel(s.site)
    if (site) rawSites.push({ id: site.id, address: site.address })
  }
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

/**
 * Optimise the visiting order via OSRM's `trip` (TSP) solver, anchored at the
 * CDO's home. Returns the optimal order as 0-based indices into `stops` (the
 * located stops in current matrix order). `approximate: true` signals OSRM was
 * unavailable and the client should fall back to its matrix heuristic.
 */
export async function optimizeRouteOrder(
  home: { latitude: number; longitude: number },
  stops: { latitude: number; longitude: number }[],
): Promise<{ order: number[]; approximate: boolean }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { order: stops.map((_, i) => i), approximate: true }
  return tripOrder(home, stops)
}

/* ------------------------------------------------------------------ */
/* Phase 3 — completion analytics (actual vs planned)                 */
/* ------------------------------------------------------------------ */

/** Monday (local) that starts the ISO week containing `d`, as yyyy-mm-dd. */
function weekStartOf(d: Date): string {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function fmtDayMon(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000)
}

function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function minuteOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

interface RawActualTask {
  id: string
  site_id: string
  started_at: string | null
  completed_at: string | null
  assigned_engineer_id: string | null
  site_service: { service_type_id: string | null } | { service_type_id: string | null }[] | null
}

/**
 * Actual-vs-planned completion analytics for a route. Reads the route's
 * COMPLETED tasks (linked via `sites.route_id`) with real `started_at` /
 * `completed_at` timestamps, derives the actual visit order (by check-in),
 * actual on-site durations and same-day inter-site gaps (drive + idle), and
 * builds the actual driven-order polyline. Supports a single past week or an
 * average across all weeks with data.
 */
export async function getRouteActuals(
  routeId: string,
  options?: { weekStart?: string | null; mode?: 'week' | 'average' },
): Promise<{ data: RouteActualsData | null; error: string | null }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { data: null, error: auth.error }
  const { supabase } = auth

  const { data: route } = await supabase
    .from('routes')
    .select('id, assigned_engineer_id')
    .eq('id', routeId)
    .single()
  if (!route) return { data: null, error: 'Route not found' }

  // Sites on the route + planned position and coords.
  const { data: siteRows } = await supabase
    .from('sites')
    .select('id, name, postcode, latitude, longitude, route_position')
    .eq('route_id', routeId)

  type SiteRow = {
    id: string
    name: string | null
    postcode: string | null
    latitude: number | null
    longitude: number | null
    route_position: number | null
  }
  const sites = (siteRows || []) as SiteRow[]
  const siteMap = new Map(sites.map((s) => [s.id, s]))
  const siteIds = sites.map((s) => s.id)

  const empty: RouteActualsData = {
    routeId,
    weeks: [],
    mode: 'week',
    selectedWeek: null,
    averagedWeeks: 0,
    visits: [],
    summary: {
      visitCount: 0,
      onSiteMinutes: 0,
      gapMinutes: 0,
      dayLengthMinutes: 0,
      firstArrival: null,
      lastDeparture: null,
      plannedOnSiteMinutes: 0,
      outOfOrderCount: 0,
    },
    home: null,
    polyline: [],
    polylineApproximate: true,
  }
  if (siteIds.length === 0) return { data: empty, error: null }

  // Completed tasks with real timestamps on those sites.
  const { data: taskRows } = await supabase
    .from('tasks')
    .select(
      `id, site_id, started_at, completed_at, assigned_engineer_id,
       site_service:site_services(service_type_id)`,
    )
    .in('site_id', siteIds)
    .eq('status', 'completed')
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null)
    .order('started_at', { ascending: true })

  const tasks = ((taskRows || []) as unknown as RawActualTask[]).filter(
    (t) => t.started_at && t.completed_at,
  )
  if (tasks.length === 0) return { data: empty, error: null }

  // Engineer name lookup.
  const engIds = Array.from(
    new Set(tasks.map((t) => t.assigned_engineer_id).filter((x): x is string => Boolean(x))),
  )
  const engNames = new Map<string, string>()
  if (engIds.length > 0) {
    const { data: engRows } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', engIds)
    for (const e of (engRows || []) as { id: string; full_name: string | null; email: string | null }[]) {
      engNames.set(e.id, e.full_name || e.email || 'Engineer')
    }
  }

  const durations = await getExpectedDurations(supabase)
  const plannedFor = (t: RawActualTask): number =>
    expectedMinutesFor(durations, {
      serviceTypeId: rel(t.site_service)?.service_type_id ?? null,
    }).minutes

  // Group tasks into weeks.
  const byWeek = new Map<string, RawActualTask[]>()
  for (const t of tasks) {
    const wk = weekStartOf(new Date(t.started_at as string))
    const list = byWeek.get(wk) ?? []
    list.push(t)
    byWeek.set(wk, list)
  }
  const weeks: RouteWeekOption[] = Array.from(byWeek.entries())
    .map(([weekStart, list]) => {
      const [y, m, d] = weekStart.split('-').map(Number)
      const end = new Date(y, m - 1, d + 6)
      const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      const days = new Set(list.map((t) => localDateKey(t.started_at as string)))
      return {
        weekStart,
        label: `${fmtDayMon(weekStart)} – ${fmtDayMon(endIso)} ${end.getFullYear()}`,
        taskCount: list.length,
        dayCount: days.size,
      }
    })
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))

  const mode: 'week' | 'average' = options?.mode === 'average' ? 'average' : 'week'
  const selectedWeek =
    mode === 'week' ? options?.weekStart ?? weeks[0]?.weekStart ?? null : null

  // Engineer home for the map anchor.
  let home: { latitude: number; longitude: number } | null = null
  if (route.assigned_engineer_id) {
    const { data: eng } = await supabase
      .from('profiles')
      .select('home_latitude, home_longitude')
      .eq('id', route.assigned_engineer_id)
      .single()
    const e = eng as { home_latitude: number | null; home_longitude: number | null } | null
    if (e?.home_latitude != null && e?.home_longitude != null) {
      home = { latitude: e.home_latitude, longitude: e.home_longitude }
    }
  }

  const buildVisit = (
    t: RawActualTask,
    index: number,
    next: RawActualTask | null,
  ): RouteActualVisit => {
    const site = siteMap.get(t.site_id)
    const arrival = t.started_at as string
    const departure = t.completed_at as string
    // Only count a gap when the next visit is the same calendar day (no overnight).
    const gap =
      next && localDateKey(next.started_at as string) === localDateKey(departure)
        ? Math.max(0, minutesBetween(departure, next.started_at as string))
        : null
    return {
      siteId: t.site_id,
      siteName: site?.name || 'Site',
      postcode: site?.postcode ?? null,
      latitude: site?.latitude ?? null,
      longitude: site?.longitude ?? null,
      plannedPosition: site?.route_position ?? null,
      actualPosition: index + 1,
      arrival,
      departure,
      onSiteMinutes: Math.max(0, minutesBetween(arrival, departure)),
      plannedMinutes: plannedFor(t),
      gapToNextMinutes: gap,
      engineerName: t.assigned_engineer_id ? engNames.get(t.assigned_engineer_id) ?? null : null,
    }
  }

  let visits: RouteActualVisit[] = []
  let averagedWeeks = 0

  if (mode === 'week' && selectedWeek) {
    const list = (byWeek.get(selectedWeek) ?? []).sort((a, b) =>
      (a.started_at as string) < (b.started_at as string) ? -1 : 1,
    )
    visits = list.map((t, i) => buildVisit(t, i, list[i + 1] ?? null))
  } else if (mode === 'average') {
    averagedWeeks = weeks.length
    // Average on-site minutes + arrival time-of-day per site across all weeks.
    type Agg = { onSite: number[]; planned: number; arrivalMin: number[]; site: SiteRow | undefined; eng: string | null }
    const agg = new Map<string, Agg>()
    for (const t of tasks) {
      const a = agg.get(t.site_id) ?? {
        onSite: [],
        planned: plannedFor(t),
        arrivalMin: [],
        site: siteMap.get(t.site_id),
        eng: t.assigned_engineer_id ? engNames.get(t.assigned_engineer_id) ?? null : null,
      }
      a.onSite.push(Math.max(0, minutesBetween(t.started_at as string, t.completed_at as string)))
      a.arrivalMin.push(minuteOfDay(t.started_at as string))
      agg.set(t.site_id, a)
    }
    const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0)
    const ordered = Array.from(agg.entries())
      .map(([siteId, a]) => ({ siteId, a, avgArrival: mean(a.arrivalMin) }))
      .sort((x, y) => x.avgArrival - y.avgArrival)
    visits = ordered.map(({ siteId, a, avgArrival }, i) => {
      const hh = String(Math.floor(avgArrival / 60)).padStart(2, '0')
      const mm = String(avgArrival % 60).padStart(2, '0')
      return {
        siteId,
        siteName: a.site?.name || 'Site',
        postcode: a.site?.postcode ?? null,
        latitude: a.site?.latitude ?? null,
        longitude: a.site?.longitude ?? null,
        plannedPosition: a.site?.route_position ?? null,
        actualPosition: i + 1,
        // Encode avg arrival time-of-day as an ISO on a nominal date for display.
        arrival: `1970-01-01T${hh}:${mm}:00`,
        departure: `1970-01-01T${hh}:${mm}:00`,
        onSiteMinutes: mean(a.onSite),
        plannedMinutes: a.planned,
        gapToNextMinutes: null,
        engineerName: a.eng,
      }
    })
  }

  // Summary.
  const onSiteMinutes = visits.reduce((s, v) => s + v.onSiteMinutes, 0)
  const gapMinutes = visits.reduce((s, v) => s + (v.gapToNextMinutes ?? 0), 0)
  const plannedOnSiteMinutes = visits.reduce((s, v) => s + v.plannedMinutes, 0)

  // Out-of-order: compare actual sequence vs planned position ordering.
  let outOfOrderCount = 0
  const withPlanned = visits.filter((v) => v.plannedPosition != null)
  for (let i = 1; i < withPlanned.length; i++) {
    if ((withPlanned[i].plannedPosition as number) < (withPlanned[i - 1].plannedPosition as number)) {
      outOfOrderCount++
    }
  }

  // Day length: sum per-day (last departure − first arrival). For averages, use
  // the mean per-week working span.
  let dayLengthMinutes = 0
  let firstArrival: string | null = null
  let lastDeparture: string | null = null
  if (mode === 'week' && selectedWeek) {
    const byDay = new Map<string, RouteActualVisit[]>()
    for (const v of visits) {
      const k = localDateKey(v.arrival)
      const l = byDay.get(k) ?? []
      l.push(v)
      byDay.set(k, l)
    }
    for (const dayVisits of byDay.values()) {
      const sorted = dayVisits.slice().sort((a, b) => (a.arrival < b.arrival ? -1 : 1))
      dayLengthMinutes += minutesBetween(sorted[0].arrival, sorted[sorted.length - 1].departure)
    }
    if (byDay.size === 1) {
      const only = Array.from(byDay.values())[0].slice().sort((a, b) => (a.arrival < b.arrival ? -1 : 1))
      firstArrival = only[0].arrival
      lastDeparture = only[only.length - 1].departure
    }
  } else if (mode === 'average') {
    dayLengthMinutes = averagedWeeks > 0 ? Math.round((onSiteMinutes + gapMinutes) / 1) : 0
  }

  // Actual driven-order polyline through located visits (home → visits → home).
  const locatedVisits = visits.filter((v) => v.latitude != null && v.longitude != null)
  let polyline: [number, number][] = []
  let polylineApproximate = true
  if (locatedVisits.length > 0) {
    const pts: LatLng[] = []
    if (home) pts.push(home)
    for (const v of locatedVisits) pts.push({ latitude: v.latitude as number, longitude: v.longitude as number })
    if (home) pts.push(home)
    if (pts.length >= 2) {
      const legs = await drivingLegs(pts)
      polyline = legs.coordinates
      polylineApproximate = legs.approximate
    }
  }

  return {
    data: {
      routeId,
      weeks,
      mode,
      selectedWeek,
      averagedWeeks,
      visits,
      summary: {
        visitCount: visits.length,
        onSiteMinutes,
        gapMinutes,
        dayLengthMinutes,
        firstArrival,
        lastDeparture,
        plannedOnSiteMinutes,
        outOfOrderCount,
      },
      home,
      polyline,
      polylineApproximate,
    },
    error: null,
  }
}

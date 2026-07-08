'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePostcodes, distanceMiles, normalisePostcode, type LatLng } from '@/lib/geocode'
import { getExpectedDurations, expectedMinutesFor } from '@/lib/task-duration'
import type { Profile } from '@/lib/types/database'
import type {
  MapCall,
  MapEngineer,
  MapSite,
  CallsMapData,
  RouteStop,
  EngineerRoute,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Time-only label like "09:30" from a timestamp or "HH:MM[:SS]" string. */
function timeLabel(value: string | null): string | null {
  if (!value) return null
  // Booked times may be stored as time strings ("09:30:00") or timestamps.
  const m = value.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

async function requireOfficeOrAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = (profile as Profile | null)?.role
  if (!profile || (role !== 'admin' && role !== 'office')) {
    return { ok: false as const, error: 'Not authorised' }
  }
  return { ok: true as const, supabase, profile: profile as Profile }
}

/**
 * Geocode any postcodes we don't have coordinates for and persist the result
 * (best-effort) so we only pay the lookup once. Returns a map of
 * normalisedPostcode -> LatLng for the freshly geocoded entries.
 */
async function backfillGeocode(postcodes: string[]): Promise<Map<string, LatLng>> {
  const geocoded = await geocodePostcodes(postcodes)
  return geocoded
}

// ---------------------------------------------------------------------------
// Main data loader
// ---------------------------------------------------------------------------

/**
 * Loads everything the calls map needs in one round-trip:
 *  - open, unbooked, non-route calls (with coords + learned durations)
 *  - engineers positioned from their latest activity (+ home anchor)
 *  - the site list for the search/select control
 *
 * "Unbooked" = no firm diary slot (`booked_start_time` null) OR no assigned
 * engineer, AND the underlying service is not assigned to a route (routes are a
 * separate prescriptive planning flow and are intentionally excluded).
 */
export async function getCallsMapData(
  input: { branchId?: string | null } = {},
): Promise<{ ok: boolean; data?: CallsMapData; error?: string }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase } = auth

  const durations = await getExpectedDurations(supabase)

  // --- Open calls -----------------------------------------------------------
  const { data: taskRows, error: taskErr } = await supabase
    .from('tasks')
    .select(
      `id, status, scheduled_date, booked_start_time, assigned_engineer_id, visit_type_id,
       booked_duration_minutes,
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
       visit_type:service_visit_types(name),
       site_service:site_services(
         route_id, service_type_id,
         service_type:service_types(id, name, system_type:system_types(name)),
         site:sites(id, name, postcode, latitude, longitude, branch_id, client:clients(id, name))
       )`,
    )
    .in('status', ['pending', 'in_progress'])

  if (taskErr) return { ok: false, error: taskErr.message }

  type TaskRow = {
    id: string
    status: string
    scheduled_date: string | null
    booked_start_time: string | null
    assigned_engineer_id: string | null
    visit_type_id: string | null
    booked_duration_minutes: number | null
    assigned_engineer: { id: string; full_name: string | null } | null
    visit_type: { name: string } | null
    site_service: {
      route_id: string | null
      service_type_id: string | null
      service_type: { id: string; name: string; system_type: { name: string } | null } | null
      site: {
        id: string
        name: string
        postcode: string | null
        latitude: number | null
        longitude: number | null
        branch_id: string | null
        client: { id: string; name: string } | null
      } | null
    } | null
  }

  const rows = (taskRows || []) as unknown as TaskRow[]

  // Apply the unbooked + no-route + branch filters.
  const filtered = rows.filter((r) => {
    const ss = r.site_service
    if (!ss || !ss.site) return false
    if (ss.route_id) return false // on a route → excluded (prescriptive flow)
    const unbooked = r.booked_start_time == null || r.assigned_engineer_id == null
    if (!unbooked) return false
    if (input.branchId && ss.site.branch_id !== input.branchId) return false
    return true
  })

  // Geocode any sites still missing coordinates, and persist back.
  const sitesNeedingGeocode = new Map<string, string>()
  for (const r of filtered) {
    const site = r.site_service!.site!
    if ((site.latitude == null || site.longitude == null) && site.postcode) {
      sitesNeedingGeocode.set(site.id, site.postcode)
    }
  }
  if (sitesNeedingGeocode.size > 0) {
    const geocoded = await backfillGeocode(Array.from(sitesNeedingGeocode.values()))
    const admin = createAdminClient()
    const updates: Array<{ id: string; lat: number; lng: number }> = []
    for (const [siteId, postcode] of sitesNeedingGeocode) {
      const hit = geocoded.get(normalisePostcode(postcode))
      if (hit) updates.push({ id: siteId, lat: hit.latitude, lng: hit.longitude })
    }
    await Promise.all(
      updates.map((u) =>
        admin
          .from('sites')
          .update({ latitude: u.lat, longitude: u.lng, geocoded_at: new Date().toISOString() })
          .eq('id', u.id),
      ),
    )
    const map = new Map(updates.map((u) => [u.id, u]))
    for (const r of filtered) {
      const site = r.site_service!.site!
      const u = map.get(site.id)
      if (u) {
        site.latitude = u.lat
        site.longitude = u.lng
      }
    }
  }

  const today = todayDateOnly()
  const calls: MapCall[] = []
  for (const r of filtered) {
    const ss = r.site_service!
    const site = ss.site!
    if (site.latitude == null || site.longitude == null) continue

    let urgency: MapCall['urgency']
    if (!r.scheduled_date) {
      urgency = 'unscheduled'
    } else if (r.scheduled_date < today) {
      urgency = 'overdue'
    } else if (r.scheduled_date === today) {
      urgency = 'due-soon'
    } else {
      urgency = 'scheduled'
    }

    calls.push({
      taskId: r.id,
      status: r.status,
      scheduledDate: r.scheduled_date,
      bookedStartTime: r.booked_start_time,
      assignedEngineerId: r.assigned_engineer_id,
      assignedEngineerName: r.assigned_engineer?.full_name ?? null,
      serviceTypeId: ss.service_type_id,
      serviceTypeName: ss.service_type?.name ?? null,
      systemTypeName: ss.service_type?.system_type?.name ?? null,
      visitTypeName: r.visit_type?.name ?? null,
      siteId: site.id,
      siteName: site.name,
      postcode: site.postcode,
      clientName: site.client?.name ?? null,
      latitude: site.latitude,
      longitude: site.longitude,
      urgency,
      expected: expectedMinutesFor(durations, {
        visitTypeId: r.visit_type_id,
        serviceTypeId: ss.service_type_id,
        bookedDurationMinutes: r.booked_duration_minutes,
      }),
    })
  }

  // --- Engineers (positioned from latest activity) --------------------------
  const { data: engRows } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, branch_id, home_postcode, home_latitude, home_longitude')
    .eq('role', 'engineer')
    .eq('status', 'active')

  const engineersRaw = (engRows || []) as Array<
    Pick<
      Profile,
      'id' | 'full_name' | 'role' | 'status' | 'branch_id' | 'home_postcode' | 'home_latitude' | 'home_longitude'
    >
  >
  const engineerList = input.branchId
    ? engineersRaw.filter((e) => e.branch_id === input.branchId || e.branch_id == null)
    : engineersRaw
  const engineerIds = engineerList.map((e) => e.id)

  // Latest activity: in-progress calls (most recent started_at) take priority,
  // else a call completed today (most recent completed_at).
  const activityBySite = new Map<
    string,
    { siteId: string; siteName: string; lat: number | null; lng: number | null; when: string; kind: 'in_progress' | 'completed' }
  >()

  if (engineerIds.length > 0) {
    const { data: actRows } = await supabase
      .from('tasks')
      .select(
        `id, assigned_engineer_id, status, started_at, completed_at,
         site_service:site_services(site:sites(id, name, latitude, longitude))`,
      )
      .in('assigned_engineer_id', engineerIds)
      .or(`status.eq.in_progress,completed_at.gte.${startOfTodayISO()}`)
      .order('started_at', { ascending: false })

    type ActRow = {
      assigned_engineer_id: string | null
      status: string
      started_at: string | null
      completed_at: string | null
      site_service: { site: { id: string; name: string; latitude: number | null; longitude: number | null } | null } | null
    }
    for (const raw of (actRows || []) as unknown as ActRow[]) {
      const engId = raw.assigned_engineer_id
      const site = raw.site_service?.site
      if (!engId || !site) continue
      const isInProgress = raw.status === 'in_progress'
      const when = (isInProgress ? raw.started_at : raw.completed_at) || raw.completed_at || raw.started_at
      if (!when) continue
      const existing = activityBySite.get(engId)
      // Prefer in-progress over completed; otherwise the most recent timestamp.
      const better =
        !existing ||
        (isInProgress && existing.kind !== 'in_progress') ||
        (isInProgress === (existing.kind === 'in_progress') && when > existing.when)
      if (better) {
        activityBySite.set(engId, {
          siteId: site.id,
          siteName: site.name,
          lat: site.latitude,
          lng: site.longitude,
          when,
          kind: isInProgress ? 'in_progress' : 'completed',
        })
      }
    }
  }

  // Count booked calls today per engineer (for the panel hint).
  const bookedTodayCount = new Map<string, number>()
  if (engineerIds.length > 0) {
    const { data: bookedRows } = await supabase
      .from('tasks')
      .select('assigned_engineer_id')
      .in('assigned_engineer_id', engineerIds)
      .eq('scheduled_date', today)
    for (const b of bookedRows || []) {
      const id = (b as { assigned_engineer_id: string | null }).assigned_engineer_id
      if (id) bookedTodayCount.set(id, (bookedTodayCount.get(id) ?? 0) + 1)
    }
  }

  // Backfill engineer home geocoding where a postcode exists but coords don't.
  const engHomeNeeding = engineerList.filter(
    (e) => e.home_postcode && (e.home_latitude == null || e.home_longitude == null),
  )
  const homeCoords = new Map<string, LatLng>()
  if (engHomeNeeding.length > 0) {
    const geocoded = await backfillGeocode(engHomeNeeding.map((e) => e.home_postcode!))
    const admin = createAdminClient()
    for (const e of engHomeNeeding) {
      const hit = geocoded.get(normalisePostcode(e.home_postcode!))
      if (hit) {
        homeCoords.set(e.id, hit)
        await admin
          .from('profiles')
          .update({
            home_latitude: hit.latitude,
            home_longitude: hit.longitude,
            home_geocoded_at: new Date().toISOString(),
          })
          .eq('id', e.id)
      }
    }
  }

  const engineers: MapEngineer[] = engineerList.map((e) => {
    const act = activityBySite.get(e.id)
    const home = homeCoords.get(e.id)
    const homeLat = e.home_latitude ?? home?.latitude ?? null
    const homeLng = e.home_longitude ?? home?.longitude ?? null
    let lastSeenLabel: string | null = null
    if (act) {
      const t = new Date(act.when)
      const hh = String(t.getHours()).padStart(2, '0')
      const mm = String(t.getMinutes()).padStart(2, '0')
      lastSeenLabel =
        act.kind === 'in_progress'
          ? `On site at ${act.siteName} (since ${hh}:${mm})`
          : `Last at ${act.siteName} (${hh}:${mm})`
    }
    return {
      id: e.id,
      name: e.full_name ?? 'Engineer',
      latitude: act?.lat ?? null,
      longitude: act?.lng ?? null,
      lastSeenLabel,
      homeLatitude: homeLat,
      homeLongitude: homeLng,
      homePostcode: e.home_postcode ?? null,
      bookedTodayCount: bookedTodayCount.get(e.id) ?? 0,
    }
  })

  // --- Site list for the search/select control ------------------------------
  let siteQuery = supabase
    .from('sites')
    .select('id, name, postcode, latitude, longitude, branch_id')
    .not('latitude', 'is', null)
    .order('name')
  if (input.branchId) siteQuery = siteQuery.eq('branch_id', input.branchId)
  const { data: siteRows } = await siteQuery
  const sites: MapSite[] = (siteRows || [])
    .filter((s) => (s as MapSite).latitude != null && (s as MapSite).longitude != null)
    .map((s) => {
      const row = s as { id: string; name: string; postcode: string | null; latitude: number; longitude: number }
      return {
        id: row.id,
        name: row.name,
        postcode: row.postcode,
        latitude: row.latitude,
        longitude: row.longitude,
      }
    })

  return { ok: true, data: { calls, engineers, sites } }
}

// ---------------------------------------------------------------------------
// Engineer route preview (home → booked calls → home)
// ---------------------------------------------------------------------------

/**
 * Returns a selected engineer's booked calls for a day as an ordered route,
 * anchored at their home postcode (start and finish) when known. Distances are
 * straight-line (haversine) — this is a planning aid, not turn-by-turn routing.
 */
export async function getEngineerRoute(
  engineerId: string,
  date?: string,
): Promise<{ ok: boolean; route?: EngineerRoute; error?: string }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase } = auth

  const day = date || todayDateOnly()

  const { data: eng } = await supabase
    .from('profiles')
    .select('id, full_name, home_postcode, home_latitude, home_longitude')
    .eq('id', engineerId)
    .single()
  if (!eng) return { ok: false, error: 'Engineer not found' }
  const engineer = eng as Pick<
    Profile,
    'id' | 'full_name' | 'home_postcode' | 'home_latitude' | 'home_longitude'
  >

  const { data: taskRows, error } = await supabase
    .from('tasks')
    .select(
      `id, scheduled_date, booked_start_time,
       site_service:site_services(site:sites(id, name, postcode, latitude, longitude))`,
    )
    .eq('assigned_engineer_id', engineerId)
    .eq('scheduled_date', day)
  if (error) return { ok: false, error: error.message }

  type RouteTaskRow = {
    booked_start_time: string | null
    site_service: { site: { id: string; name: string; postcode: string | null; latitude: number | null; longitude: number | null } | null } | null
  }
  const bookedCalls = ((taskRows || []) as unknown as RouteTaskRow[])
    .filter((r) => r.site_service?.site?.latitude != null && r.site_service?.site?.longitude != null)
    .sort((a, b) => {
      const at = a.booked_start_time || '99:99'
      const bt = b.booked_start_time || '99:99'
      return at.localeCompare(bt)
    })

  // Resolve home coords (geocode + persist if needed).
  let homeLat = engineer.home_latitude ?? null
  let homeLng = engineer.home_longitude ?? null
  if ((homeLat == null || homeLng == null) && engineer.home_postcode) {
    const geocoded = await geocodePostcodes([engineer.home_postcode])
    const hit = geocoded.get(normalisePostcode(engineer.home_postcode))
    if (hit) {
      homeLat = hit.latitude
      homeLng = hit.longitude
      const admin = createAdminClient()
      await admin
        .from('profiles')
        .update({
          home_latitude: hit.latitude,
          home_longitude: hit.longitude,
          home_geocoded_at: new Date().toISOString(),
        })
        .eq('id', engineerId)
    }
  }
  const hasHome = homeLat != null && homeLng != null

  const stops: RouteStop[] = []
  let prev: LatLng | null = null
  let total = 0

  const pushStop = (stop: Omit<RouteStop, 'legMiles'>, coord: LatLng) => {
    const legMiles = prev ? Math.round(distanceMiles(prev, coord) * 10) / 10 : 0
    total += legMiles
    stops.push({ ...stop, legMiles })
    prev = coord
  }

  if (hasHome) {
    const home: LatLng = { latitude: homeLat!, longitude: homeLng! }
    pushStop({ kind: 'home', label: 'Home', siteName: null, latitude: home.latitude, longitude: home.longitude, bookedStartTime: null }, home)
  }

  for (const call of bookedCalls) {
    const site = call.site_service!.site!
    const coord: LatLng = { latitude: site.latitude!, longitude: site.longitude! }
    pushStop(
      {
        kind: 'call',
        label: timeLabel(call.booked_start_time) || 'Call',
        siteName: site.name,
        latitude: coord.latitude,
        longitude: coord.longitude,
        bookedStartTime: call.booked_start_time,
      },
      coord,
    )
  }

  if (hasHome && bookedCalls.length > 0) {
    const home: LatLng = { latitude: homeLat!, longitude: homeLng! }
    pushStop({ kind: 'home', label: 'Home', siteName: null, latitude: home.latitude, longitude: home.longitude, bookedStartTime: null }, home)
  }

  return {
    ok: true,
    route: {
      engineerId,
      engineerName: engineer.full_name ?? 'Engineer',
      date: day,
      stops,
      totalMiles: Math.round(total * 10) / 10,
      hasHome,
    },
  }
}

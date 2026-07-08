'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePostcodes, geocodeSites, distanceMiles, normalisePostcode, type LatLng } from '@/lib/geocode'
import { getExpectedDurations, expectedMinutesFor } from '@/lib/task-duration'
import { drivingRoute } from '@/lib/routing'
import { disciplineForSystemType } from '@/lib/disciplines'
import { computeRespondBy, notifyEmergencyAssignment } from '@/lib/dispatch'
import { ANNUAL_LEAVE_TYPE_ID } from '@/lib/constants/leave'
import type { Profile, Discipline } from '@/lib/types/database'
import type {
  MapCall,
  MapEngineer,
  MapSite,
  CallsMapData,
  RouteStop,
  EngineerRoute,
  DispatchCandidate,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfTodayISO(): string {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Time-only label like "09:30" from a timestamp or "HH:MM[:SS]" string. */
function timeLabel(value: string | null): string | null {
  if (!value) return null
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
  return { ok: true as const, supabase, profile: profile as Profile, userId: user.id }
}

async function backfillGeocode(postcodes: string[]): Promise<Map<string, LatLng>> {
  return geocodePostcodes(postcodes)
}

// Shape used to describe an engineer's inferred current position (site of their
// latest activity today).
interface EngineerPosition {
  siteId: string
  siteName: string
  lat: number | null
  lng: number | null
  when: string
  kind: 'in_progress' | 'completed'
}

/**
 * Infer each engineer's current position from their latest activity today:
 * an in-progress call (most recent started_at) takes priority, otherwise a call
 * completed today (most recent completed_at).
 */
async function getEngineerPositions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  engineerIds: string[],
): Promise<Map<string, EngineerPosition>> {
  const out = new Map<string, EngineerPosition>()
  if (engineerIds.length === 0) return out

  const { data: actRows } = await supabase
    .from('tasks')
    .select(
      `id, assigned_engineer_id, status, started_at, completed_at,
       site_service:site_services(site:sites(id, name, latitude, longitude)),
       direct_site:sites!tasks_site_id_fkey(id, name, latitude, longitude)`,
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
    direct_site: { id: string; name: string; latitude: number | null; longitude: number | null } | null
  }

  for (const raw of (actRows || []) as unknown as ActRow[]) {
    const engId = raw.assigned_engineer_id
    const site = raw.direct_site ?? raw.site_service?.site ?? null
    if (!engId || !site) continue
    const isInProgress = raw.status === 'in_progress'
    const when = (isInProgress ? raw.started_at : raw.completed_at) || raw.completed_at || raw.started_at
    if (!when) continue
    const existing = out.get(engId)
    const better =
      !existing ||
      (isInProgress && existing.kind !== 'in_progress') ||
      (isInProgress === (existing.kind === 'in_progress') && when > existing.when)
    if (better) {
      out.set(engId, {
        siteId: site.id,
        siteName: site.name,
        lat: site.latitude,
        lng: site.longitude,
        when,
        kind: isInProgress ? 'in_progress' : 'completed',
      })
    }
  }
  return out
}

/**
 * Returns a map of engineerId -> leave reason for anyone on APPROVED annual
 * leave that overlaps today (including partial-day leave — any overlap counts).
 */
async function getOnLeaveToday(engineerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (engineerIds.length === 0) return out
  const admin = createAdminClient()
  const { data } = await admin
    .from('calendar_entries')
    .select('user_id, start_at, end_at')
    .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
    .eq('approval_status', 'approved')
    .in('user_id', engineerIds)
    .lte('start_at', endOfTodayISO())
    .gte('end_at', startOfTodayISO())
  for (const r of (data || []) as { user_id: string }[]) {
    out.set(r.user_id, 'On annual leave today')
  }
  return out
}

// ---------------------------------------------------------------------------
// Main data loader
// ---------------------------------------------------------------------------

/**
 * Loads everything the calls map needs in one round-trip:
 *  - open, unbooked, non-route calls — recurring PPM (via site_service) AND
 *    reactive / emergency calls (anchored directly to a site).
 *  - engineers positioned from their latest activity (+ home anchor, discipline,
 *    department/role and today's leave status).
 *  - the site list for the search/select control.
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
       booked_duration_minutes, is_emergency, respond_by, site_id, service_type_id, system_type_id,
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
       visit_type:service_visit_types(name),
        direct_site:sites!tasks_site_id_fkey(id, name, address, postcode, latitude, longitude, branch_id, client:clients(id, name)),
       direct_service_type:service_types!tasks_service_type_id_fkey(id, name, system_type:system_types(name)),
       direct_system_type:system_types!tasks_system_type_id_fkey(name),
       site_service:site_services(
         route_id, service_type_id,
         service_type:service_types(id, name, system_type:system_types(name)),
      site:sites(id, name, address, postcode, latitude, longitude, branch_id, client:clients(id, name))
      )`,
    )
    .in('status', ['pending', 'in_progress'])

  if (taskErr) return { ok: false, error: taskErr.message }

  type SiteEmbed = {
    id: string
    name: string
    address: string | null
    postcode: string | null
    latitude: number | null
    longitude: number | null
    branch_id: string | null
    client: { id: string; name: string } | null
  }
  type ServiceTypeEmbed = { id: string; name: string; system_type: { name: string } | null } | null
  type TaskRow = {
    id: string
    status: string
    scheduled_date: string | null
    booked_start_time: string | null
    assigned_engineer_id: string | null
    visit_type_id: string | null
    booked_duration_minutes: number | null
    is_emergency: boolean | null
    respond_by: string | null
    site_id: string | null
    service_type_id: string | null
    system_type_id: string | null
    assigned_engineer: { id: string; full_name: string | null } | null
    visit_type: { name: string } | null
    direct_site: SiteEmbed | null
    direct_service_type: ServiceTypeEmbed
    direct_system_type: { name: string } | null
    site_service: {
      route_id: string | null
      service_type_id: string | null
      service_type: ServiceTypeEmbed
      site: SiteEmbed | null
    } | null
  }

  const rows = (taskRows || []) as unknown as TaskRow[]

  // Normalise each row to a resolved site + service type, applying the
  // unbooked + no-route + branch filters. Reactive/emergency calls resolve via
  // the direct site; recurring calls via their site_service.
  interface Resolved {
    row: TaskRow
    site: SiteEmbed
    serviceType: ServiceTypeEmbed
    systemTypeName: string | null
  }
  const resolved: Resolved[] = []
  for (const r of rows) {
    const ss = r.site_service
    if (ss?.route_id) continue // on a route → prescriptive flow, excluded
    const site = r.direct_site ?? ss?.site ?? null
    if (!site) continue
    const unbooked = r.booked_start_time == null || r.assigned_engineer_id == null
    if (!unbooked) continue
    if (input.branchId && site.branch_id !== input.branchId) continue
    const serviceType = r.direct_service_type ?? ss?.service_type ?? null
    const systemTypeName =
      serviceType?.system_type?.name ?? r.direct_system_type?.name ?? null
    resolved.push({ row: r, site, serviceType, systemTypeName })
  }

  // Geocode any sites still missing coordinates (using street address +
  // postcode for accurate marker placement), and persist back.
  const sitesNeedingGeocode = new Map<
    string,
    { address: string | null; postcode: string | null }
  >()
  for (const { site } of resolved) {
    if ((site.latitude == null || site.longitude == null) && (site.address || site.postcode)) {
      sitesNeedingGeocode.set(site.id, { address: site.address, postcode: site.postcode })
    }
  }
  if (sitesNeedingGeocode.size > 0) {
    const geocoded = await geocodeSites(
      Array.from(sitesNeedingGeocode, ([id, loc]) => ({ id, ...loc })),
    )
    const admin = createAdminClient()
    const updates: Array<{ id: string; lat: number; lng: number }> = []
    for (const siteId of sitesNeedingGeocode.keys()) {
      const hit = geocoded.get(siteId)
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
    for (const { site } of resolved) {
      const u = map.get(site.id)
      if (u) {
        site.latitude = u.lat
        site.longitude = u.lng
      }
    }
  }

  const today = todayDateOnly()
  const calls: MapCall[] = []
  for (const { row: r, site, serviceType, systemTypeName } of resolved) {
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
      serviceTypeId: r.service_type_id ?? serviceType?.id ?? null,
      serviceTypeName: serviceType?.name ?? null,
      systemTypeName,
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
        serviceTypeId: r.service_type_id ?? serviceType?.id ?? null,
        bookedDurationMinutes: r.booked_duration_minutes,
      }),
      isEmergency: r.is_emergency ?? false,
      respondBy: r.respond_by,
      callTypeName: serviceType?.name ?? null,
      requiredDiscipline: disciplineForSystemType(systemTypeName),
    })
  }

  // --- Engineers (positioned from latest activity) --------------------------
  const { data: engRows } = await supabase
    .from('profiles')
    .select(
      `id, full_name, role, status, branch_id, discipline, home_postcode, home_latitude, home_longitude,
       role_ref:roles!profiles_role_id_fkey(name),
       department:departments!profiles_department_id_fkey(name)`,
    )
    .eq('role', 'engineer')
    .eq('status', 'active')

  type EngRow = Pick<
    Profile,
    'id' | 'full_name' | 'role' | 'status' | 'branch_id' | 'discipline' | 'home_postcode' | 'home_latitude' | 'home_longitude'
  > & {
    role_ref: { name: string } | null
    department: { name: string } | null
  }

  const engineersRaw = (engRows || []) as unknown as EngRow[]
  const engineerList = input.branchId
    ? engineersRaw.filter((e) => e.branch_id === input.branchId || e.branch_id == null)
    : engineersRaw
  const engineerIds = engineerList.map((e) => e.id)

  const [positions, onLeave] = await Promise.all([
    getEngineerPositions(supabase, engineerIds),
    getOnLeaveToday(engineerIds),
  ])

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
    const act = positions.get(e.id)
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
      discipline: e.discipline ?? null,
      roleLabel: e.role_ref?.name ?? null,
      departmentName: e.department?.name ?? null,
      onLeave: onLeave.has(e.id),
      leaveReason: onLeave.get(e.id) ?? null,
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
 * anchored at their home postcode (start and finish) when known. Per-stop leg
 * distances are straight-line; the drawn geometry and total time use real
 * driving directions (OSRM) with a straight-line fallback.
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
       site_service:site_services(site:sites(id, name, postcode, latitude, longitude)),
       direct_site:sites!tasks_site_id_fkey(id, name, postcode, latitude, longitude)`,
    )
    .eq('assigned_engineer_id', engineerId)
    .eq('scheduled_date', day)
  if (error) return { ok: false, error: error.message }

  type RouteSite = { id: string; name: string; postcode: string | null; latitude: number | null; longitude: number | null }
  type RouteTaskRow = {
    booked_start_time: string | null
    site_service: { site: RouteSite | null } | null
    direct_site: RouteSite | null
  }
  const bookedCalls = ((taskRows || []) as unknown as RouteTaskRow[])
    .map((r) => ({ booked_start_time: r.booked_start_time, site: r.direct_site ?? r.site_service?.site ?? null }))
    .filter((r) => r.site?.latitude != null && r.site?.longitude != null)
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
  const coords: LatLng[] = []
  let prev: LatLng | null = null
  let total = 0

  const pushStop = (stop: Omit<RouteStop, 'legMiles'>, coord: LatLng) => {
    const legMiles = prev ? Math.round(distanceMiles(prev, coord) * 10) / 10 : 0
    total += legMiles
    stops.push({ ...stop, legMiles })
    coords.push(coord)
    prev = coord
  }

  if (hasHome) {
    const home: LatLng = { latitude: homeLat!, longitude: homeLng! }
    pushStop({ kind: 'home', label: 'Home', siteName: null, latitude: home.latitude, longitude: home.longitude, bookedStartTime: null }, home)
  }

  for (const call of bookedCalls) {
    const site = call.site!
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

  // Real driving geometry/time across the ordered stops (best-effort).
  let geometry: [number, number][] = []
  let drivingMinutes: number | null = null
  let approximate = true
  if (coords.length > 1) {
    const dr = await drivingRoute(coords)
    geometry = dr.coordinates
    drivingMinutes = dr.minutes
    approximate = dr.approximate
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
      geometry,
      drivingMinutes,
      approximate,
    },
  }
}

// ---------------------------------------------------------------------------
// Dispatch: find & assign the best-placed skilled, available engineer
// ---------------------------------------------------------------------------

/**
 * Rank engineers to attend a specific call. Only engineers within ~10 miles
 * (straight-line prefilter) who are NOT on approved leave today are considered.
 * Each candidate gets a real driving route/ETA from their current position (or
 * home when idle). Sorted by skill match (discipline vs the call's required
 * discipline) then driving time.
 */
export async function getDispatchCandidates(input: {
  callLat: number
  callLng: number
  systemTypeName?: string | null
  branchId?: string | null
  radiusMiles?: number
}): Promise<{ ok: boolean; candidates?: DispatchCandidate[]; requiredDiscipline?: Discipline | null; error?: string }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase } = auth

  const radius = input.radiusMiles ?? 10
  const call: LatLng = { latitude: input.callLat, longitude: input.callLng }
  const requiredDiscipline = disciplineForSystemType(input.systemTypeName)

  const { data: engRows } = await supabase
    .from('profiles')
    .select(
      `id, full_name, branch_id, discipline, home_latitude, home_longitude,
       role_ref:roles!profiles_role_id_fkey(name),
       department:departments!profiles_department_id_fkey(name)`,
    )
    .eq('role', 'engineer')
    .eq('status', 'active')

  type EngRow = {
    id: string
    full_name: string | null
    branch_id: string | null
    discipline: Discipline | null
    home_latitude: number | null
    home_longitude: number | null
    role_ref: { name: string } | null
    department: { name: string } | null
  }
  const engineers = ((engRows || []) as unknown as EngRow[]).filter(
    (e) => !input.branchId || e.branch_id === input.branchId || e.branch_id == null,
  )
  const engineerIds = engineers.map((e) => e.id)

  const [positions, onLeave, bookedCounts] = await Promise.all([
    getEngineerPositions(supabase, engineerIds),
    getOnLeaveToday(engineerIds),
    (async () => {
      const map = new Map<string, number>()
      if (engineerIds.length === 0) return map
      const { data } = await supabase
        .from('tasks')
        .select('assigned_engineer_id')
        .in('assigned_engineer_id', engineerIds)
        .eq('scheduled_date', todayDateOnly())
      for (const b of data || []) {
        const id = (b as { assigned_engineer_id: string | null }).assigned_engineer_id
        if (id) map.set(id, (map.get(id) ?? 0) + 1)
      }
      return map
    })(),
  ])

  // Prefilter by straight-line distance and leave status.
  interface Prefiltered {
    eng: EngRow
    origin: LatLng
    originKind: 'current' | 'home'
    straightMiles: number
    lastSeenLabel: string | null
  }
  const prefiltered: Prefiltered[] = []
  for (const eng of engineers) {
    if (onLeave.has(eng.id)) continue
    const pos = positions.get(eng.id)
    let origin: LatLng | null = null
    let originKind: 'current' | 'home' = 'current'
    let lastSeenLabel: string | null = null
    if (pos && pos.lat != null && pos.lng != null) {
      origin = { latitude: pos.lat, longitude: pos.lng }
      originKind = 'current'
      const t = new Date(pos.when)
      const hh = String(t.getHours()).padStart(2, '0')
      const mm = String(t.getMinutes()).padStart(2, '0')
      lastSeenLabel =
        pos.kind === 'in_progress'
          ? `On site at ${pos.siteName} (since ${hh}:${mm})`
          : `Last at ${pos.siteName} (${hh}:${mm})`
    } else if (eng.home_latitude != null && eng.home_longitude != null) {
      origin = { latitude: eng.home_latitude, longitude: eng.home_longitude }
      originKind = 'home'
      lastSeenLabel = 'From home'
    }
    if (!origin) continue
    const straightMiles = distanceMiles(origin, call)
    if (straightMiles > radius) continue
    prefiltered.push({ eng, origin, originKind, straightMiles, lastSeenLabel })
  }

  // Real driving routes for the in-radius set (bounded; OSRM demo is rate-limited).
  const candidates: DispatchCandidate[] = await Promise.all(
    prefiltered.map(async (p) => {
      const dr = await drivingRoute([p.origin, call])
      const skillMatch = requiredDiscipline == null || p.eng.discipline === requiredDiscipline
      return {
        engineerId: p.eng.id,
        engineerName: p.eng.full_name ?? 'Engineer',
        discipline: p.eng.discipline,
        roleLabel: p.eng.role_ref?.name ?? null,
        departmentName: p.eng.department?.name ?? null,
        distanceMiles: Math.round(p.straightMiles * 10) / 10,
        drivingMiles: dr.miles,
        drivingMinutes: dr.minutes,
        approximate: dr.approximate,
        skillMatch,
        originKind: p.originKind,
        geometry: dr.coordinates,
        lastSeenLabel: p.lastSeenLabel,
        bookedTodayCount: bookedCounts.get(p.eng.id) ?? 0,
      }
    }),
  )

  // Sort: skilled first, then shortest driving time, then fewest booked today.
  candidates.sort((a, b) => {
    if (a.skillMatch !== b.skillMatch) return a.skillMatch ? -1 : 1
    if (a.drivingMinutes !== b.drivingMinutes) return a.drivingMinutes - b.drivingMinutes
    return a.bookedTodayCount - b.bookedTodayCount
  })

  return { ok: true, candidates, requiredDiscipline }
}

/**
 * Assign an engineer to a call. Stamps `assigned_at` and, when the call is an
 * emergency, fires a prominent notification to the engineer.
 */
export async function assignCall(
  taskId: string,
  engineerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOfficeOrAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { data: task } = await supabase
    .from('tasks')
    .select(
      `id, is_emergency, respond_by,
       direct_site:sites!tasks_site_id_fkey(name),
       direct_service_type:service_types!tasks_service_type_id_fkey(name),
       site_service:site_services(site:sites(name), service_type:service_types(name))`,
    )
    .eq('id', taskId)
    .single()

  if (!task) return { ok: false, error: 'Call not found.' }
  const t = task as unknown as {
    is_emergency: boolean | null
    respond_by: string | null
    direct_site: { name: string } | null
    direct_service_type: { name: string } | null
    site_service: { site: { name: string } | null; service_type: { name: string } | null } | null
  }

  const { error } = await supabase
    .from('tasks')
    .update({ assigned_engineer_id: engineerId, assigned_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) return { ok: false, error: error.message }

  if (t.is_emergency) {
    try {
      await notifyEmergencyAssignment({
        taskId,
        engineerId,
        siteName: t.direct_site?.name ?? t.site_service?.site?.name ?? null,
        callTypeName: t.direct_service_type?.name ?? t.site_service?.service_type?.name ?? null,
        respondBy: t.respond_by,
        actorId: userId,
      })
    } catch (err) {
      console.log('[v0] assignCall notify failed:', (err as Error).message)
    }
  }

  revalidatePath('/dashboard/schedule/map')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

// Re-export the KPI deadline helper for callers that build respond_by values.
export { computeRespondBy }

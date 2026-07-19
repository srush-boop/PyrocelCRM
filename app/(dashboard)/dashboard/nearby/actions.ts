'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePostcodes, distanceMiles, type LatLng } from '@/lib/geocode'
import { notifyUsers } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'
import { isWorkerTypeVisibleToEngineer } from '@/lib/engineer-visibility'
import type { Discipline, WorkerType } from '@/lib/types/database'

/**
 * An engineer requests a part from a specific stock location. The owner of
 * that location (the assigned engineer) receives a notification; if the
 * location has no assigned engineer, office/admin are notified instead.
 */
export async function requestPart(input: {
  partId: string
  locationId: string
  quantity: number
  message?: string
}): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: requester } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()
  if (!requester || (requester as { role: string }).role === 'client') {
    return { ok: false, error: 'Not authorised' }
  }

  // Load part + location details for the notification body.
  const [{ data: part }, { data: location }] = await Promise.all([
    supabase.from('parts').select('id, name').eq('id', input.partId).single(),
    supabase
      .from('stock_locations')
      .select('id, name, engineer_id')
      .eq('id', input.locationId)
      .single(),
  ])
  if (!part || !location) return { ok: false, error: 'Part or location not found' }

  const { data: created, error: insertError } = await supabase
    .from('part_requests')
    .insert({
      part_id: input.partId,
      location_id: input.locationId,
      requested_by: user.id,
      quantity: input.quantity,
      message: input.message?.trim() || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) return { ok: false, error: insertError.message }

  // Notify the location owner; fall back to office/admin if no owner.
  const admin = createAdminClient()
  const ownerEngineerId = (location as { engineer_id: string | null }).engineer_id
  const recipientIds = new Set<string>()

  if (ownerEngineerId && ownerEngineerId !== user.id) {
    recipientIds.add(ownerEngineerId)
  } else {
    const { data: officeAdmins } = await admin
      .from('profiles')
      .select('id')
      .in('role', ['office', 'admin'])
    for (const p of officeAdmins || []) recipientIds.add(p.id as string)
  }
  recipientIds.delete(user.id)

  const requesterName = (requester as { full_name: string | null }).full_name || 'An engineer'
  await notifyUsers({
    userIds: Array.from(recipientIds),
    title: 'Part request received',
    body: `${requesterName} is requesting ${input.quantity}× ${(part as { name: string }).name} from ${(location as { name: string }).name}.`,
    url: '/dashboard/stock',
    category: 'part_request',
    data: { partRequestId: created.id, locationId: input.locationId },
    createdBy: user.id,
  })

  revalidatePath('/dashboard/nearby')
  return { ok: true, requestId: created.id }
}

/**
 * Update the current engineer's live location sharing preference and optionally
 * store their current GPS coordinates.
 */
export async function updateLocationSharing(input: {
  enabled: boolean
  latitude?: number
  longitude?: number
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const update: Record<string, unknown> = {
    location_sharing_enabled: input.enabled,
  }
  if (input.enabled && input.latitude != null && input.longitude != null) {
    update.location_lat = input.latitude
    update.location_lng = input.longitude
    update.location_updated_at = new Date().toISOString()
  } else if (!input.enabled) {
    // Clear coordinates when sharing is disabled for privacy.
    update.location_lat = null
    update.location_lng = null
    update.location_updated_at = null
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true }
}

export interface NearbyCall {
  taskId: string
  status: string
  scheduledDate: string | null
  serviceTypeId: string | null
  serviceTypeName: string | null
  systemTypeName: string | null
  siteId: string
  siteName: string
  postcode: string | null
  address: string | null
  clientName: string | null
  assignedEngineerId: string | null
  assignedEngineerName: string | null
  distanceMiles: number
  /** A pending transfer request by the current engineer for this task, if any. */
  pendingRequestId: string | null
}

interface FindNearbyInput {
  latitude: number
  longitude: number
  radiusMiles: number
  serviceTypeId?: string | null
}

/**
 * Finds incomplete calls (pending/in_progress), assigned or not, within the
 * given radius of the engineer's current location, ordered by distance.
 * Geocodes any site postcodes that aren't cached yet (via postcodes.io) and
 * stores the result back on the site row for next time.
 */
export async function findNearbyCalls(
  input: FindNearbyInput
): Promise<{ ok: boolean; calls?: NearbyCall[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const origin: LatLng = { latitude: input.latitude, longitude: input.longitude }

  // Requesting engineer's discipline drives CDO isolation of suggestions.
  const { data: me } = await supabase
    .from('profiles')
    .select('discipline')
    .eq('id', user.id)
    .single()
  const myDiscipline = (me as { discipline: Discipline | null } | null)?.discipline ?? null

  // Pull incomplete calls with their site + service + client + assignee.
  let query = supabase
    .from('tasks')
    .select(
      `id, status, scheduled_date, assigned_engineer_id,
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
       site_service:site_services(
         service_type_id, worker_type,
         service_type:service_types(id, name, default_worker_type, system_type:system_types(name)),
         site:sites(id, name, postcode, address, latitude, longitude, geocoded_at,
           client:clients(id, name))
       )`
    )
    .in('status', ['pending', 'in_progress'])

  if (input.serviceTypeId) {
    // Filter by service type at the related table level.
    query = query.eq('site_service.service_type_id', input.serviceTypeId)
  }

  const { data: tasks, error } = await query
  if (error) return { ok: false, error: error.message }

  type Row = {
    id: string
    status: string
    scheduled_date: string | null
    assigned_engineer_id: string | null
    assigned_engineer: { id: string; full_name: string | null } | null
    site_service: {
      service_type_id: string | null
      worker_type: string | null
      service_type: {
        id: string
        name: string
        default_worker_type: string | null
        system_type: { name: string } | null
      } | null
      site: {
        id: string
        name: string
        postcode: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
        geocoded_at: string | null
        client: { id: string; name: string } | null
      } | null
    } | null
  }

  const rows = (tasks || []) as unknown as Row[]

  // When filtering by service type, the embedded filter can still return tasks
  // whose site_service is null; drop those defensively. Also apply CDO isolation
  // + sub-contract hiding based on the requesting engineer's discipline.
  const usable = rows.filter((r) => {
    if (!r.site_service) return false
    if (input.serviceTypeId && r.site_service.service_type_id !== input.serviceTypeId) return false
    const wt = (r.site_service.worker_type ??
      r.site_service.service_type?.default_worker_type ??
      'engineer') as WorkerType
    return isWorkerTypeVisibleToEngineer(wt, myDiscipline)
  })

  // Geocode any sites missing coordinates.
  const needGeocode = new Map<string, string>() // siteId -> postcode
  for (const r of usable) {
    const site = r.site_service?.site
    if (!site) continue
    if ((site.latitude == null || site.longitude == null) && site.postcode) {
      needGeocode.set(site.id, site.postcode)
    }
  }

  if (needGeocode.size > 0) {
    const geocoded = await geocodePostcodes(Array.from(needGeocode.values()))
    const admin = createAdminClient()
    const updates: Array<{ id: string; lat: number; lng: number }> = []
    const { normalisePostcode } = await import('@/lib/geocode')
    for (const [siteId, postcode] of needGeocode) {
      const hit = geocoded.get(normalisePostcode(postcode))
      if (hit) updates.push({ id: siteId, lat: hit.latitude, lng: hit.longitude })
    }
    // Persist back to sites (best-effort) and patch our in-memory rows.
    await Promise.all(
      updates.map((u) =>
        admin
          .from('sites')
          .update({ latitude: u.lat, longitude: u.lng, geocoded_at: new Date().toISOString() })
          .eq('id', u.id)
      )
    )
    const updateMap = new Map(updates.map((u) => [u.id, u]))
    for (const r of usable) {
      const site = r.site_service?.site
      if (site && updateMap.has(site.id)) {
        const u = updateMap.get(site.id)!
        site.latitude = u.lat
        site.longitude = u.lng
      }
    }
  }

  // Existing pending requests by this engineer, to mark already-requested calls.
  const taskIds = usable.map((r) => r.id)
  const pendingByTask = new Map<string, string>()
  if (taskIds.length > 0) {
    const { data: reqs } = await supabase
      .from('task_transfer_requests')
      .select('id, task_id')
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .in('task_id', taskIds)
    for (const req of reqs || []) {
      pendingByTask.set(req.task_id as string, req.id as string)
    }
  }

  const calls: NearbyCall[] = []
  for (const r of usable) {
    const site = r.site_service?.site
    if (!site || site.latitude == null || site.longitude == null) continue
    const dist = distanceMiles(origin, {
      latitude: site.latitude,
      longitude: site.longitude,
    })
    if (dist > input.radiusMiles) continue
    calls.push({
      taskId: r.id,
      status: r.status,
      scheduledDate: r.scheduled_date,
      serviceTypeId: r.site_service?.service_type_id ?? null,
      serviceTypeName: r.site_service?.service_type?.name ?? null,
      systemTypeName: r.site_service?.service_type?.system_type?.name ?? null,
      siteId: site.id,
      siteName: site.name,
      postcode: site.postcode,
      address: site.address,
      clientName: site.client?.name ?? null,
      assignedEngineerId: r.assigned_engineer_id,
      assignedEngineerName: r.assigned_engineer?.full_name ?? null,
      distanceMiles: Math.round(dist * 10) / 10,
      pendingRequestId: pendingByTask.get(r.id) ?? null,
    })
  }

  calls.sort((a, b) => a.distanceMiles - b.distanceMiles)
  return { ok: true, calls }
}

// ── Post-completion "nearby overdue calls" prompt ───────────────────────────

export interface NearbyOverdueCall {
  taskId: string
  status: string
  scheduledDate: string | null
  respondBy: string | null
  /** 'overdue' = past its date/deadline, 'due_soon' = within the next 48h. */
  urgency: 'overdue' | 'due_soon'
  serviceTypeName: string | null
  systemTypeName: string | null
  siteId: string
  siteName: string
  postcode: string | null
  address: string | null
  clientName: string | null
  assignedEngineerId: string | null
  assignedEngineerName: string | null
  distanceMiles: number
}

/**
 * After an engineer completes an inspection, surface nearby calls at OTHER sites
 * that are overdue or due soon so they can take ownership while they're in the
 * area — avoiding a second engineer being sent out later.
 *
 * The origin is the just-completed task's own site. Excludes:
 *  - calls already assigned to the current engineer (their own work),
 *  - calls that require booking (site- or service-level `booking_required`),
 *  - services delivered by CDOs (worker_type 'cdo'), which are route-planned.
 */
export async function findNearbyOverdueCalls(input: {
  fromTaskId: string
  radiusMiles?: number
}): Promise<{ ok: boolean; calls?: NearbyOverdueCall[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const radiusMiles = input.radiusMiles ?? 15

  // Requesting engineer's discipline drives CDO isolation of suggestions.
  const { data: me } = await supabase
    .from('profiles')
    .select('discipline')
    .eq('id', user.id)
    .single()
  const myDiscipline = (me as { discipline: Discipline | null } | null)?.discipline ?? null

  // Resolve the completed task's site as the search origin.
  const { data: fromTask } = await supabase
    .from('tasks')
    .select(`id, site_service:site_services(site:sites(id, postcode, latitude, longitude))`)
    .eq('id', input.fromTaskId)
    .single()

  const fromSite = (
    fromTask as unknown as {
      site_service?: { site?: { id: string; postcode: string | null; latitude: number | null; longitude: number | null } | null } | null
    } | null
  )?.site_service?.site
  if (!fromSite) return { ok: false, error: 'Origin site not found' }

  // Determine origin coordinates, geocoding from postcode if necessary.
  let origin: LatLng | null =
    fromSite.latitude != null && fromSite.longitude != null
      ? { latitude: fromSite.latitude, longitude: fromSite.longitude }
      : null
  if (!origin && fromSite.postcode) {
    const geocoded = await geocodePostcodes([fromSite.postcode])
    const { normalisePostcode } = await import('@/lib/geocode')
    const hit = geocoded.get(normalisePostcode(fromSite.postcode))
    if (hit) origin = { latitude: hit.latitude, longitude: hit.longitude }
  }
  if (!origin) return { ok: true, calls: [] }

  // Time window for "overdue / due soon", computed up-front so we can push the
  // date filter down to the database rather than pulling every open call.
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const soonCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const soonCutoffIso = soonCutoff.toISOString()

  // Pull incomplete calls with site + service (incl. worker type + booking flags).
  // A call can only be overdue/due-soon if its scheduled_date is on/before today
  // OR its respond_by deadline is within the next 48h — so filter to exactly
  // those rows server-side. This avoids dragging back the (potentially huge) set
  // of future-dated recurring calls just to discard them in JS, which was adding
  // a multi-second delay before the engineer was returned to their Calls list.
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      `id, status, scheduled_date, respond_by, assigned_engineer_id,
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
       site_service:site_services(
         worker_type, booking_required,
         service_type:service_types(id, name, default_worker_type, system_type:system_types(name)),
         site:sites(id, name, postcode, address, latitude, longitude, booking_required,
           client:clients(id, name))
       )`
    )
    .in('status', ['pending', 'in_progress'])
    .or(`scheduled_date.lte.${todayStr},respond_by.lte.${soonCutoffIso}`)
    .limit(200)

  if (error) return { ok: false, error: error.message }

  type Row = {
    id: string
    status: string
    scheduled_date: string | null
    respond_by: string | null
    assigned_engineer_id: string | null
    assigned_engineer: { id: string; full_name: string | null } | null
    site_service: {
      worker_type: string | null
      booking_required: boolean | null
      service_type: {
        id: string
        name: string
        default_worker_type: string | null
        system_type: { name: string } | null
      } | null
      site: {
        id: string
        name: string
        postcode: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
        booking_required: boolean | null
        client: { id: string; name: string } | null
      } | null
    } | null
  }

  const rows = (tasks || []) as unknown as Row[]

  const calls: NearbyOverdueCall[] = []
  for (const r of rows) {
    const ss = r.site_service
    const site = ss?.site
    if (!ss || !site) continue

    // Skip the engineer's own calls — the point is spotting OTHERS' nearby work.
    if (r.assigned_engineer_id === user.id) continue
    // Never surface the just-completed task itself.
    if (r.id === input.fromTaskId) continue

    // CDO isolation + hide sub-contracted work, per the requesting engineer's
    // discipline: non-CDO engineers skip CDO (route-planned) work, CDO engineers
    // only see CDO work, and sub-contracted work is never suggested.
    const workerType = (ss.worker_type ?? ss.service_type?.default_worker_type ?? 'engineer') as WorkerType
    if (!isWorkerTypeVisibleToEngineer(workerType, myDiscipline)) continue

    // Exclude anything that requires booking (site- or service-level).
    if (ss.booking_required === true || site.booking_required === true) continue

    if (site.latitude == null || site.longitude == null) continue
    const dist = distanceMiles(origin, { latitude: site.latitude, longitude: site.longitude })
    if (dist > radiusMiles) continue

    // Classify urgency: overdue (past date/deadline) or due soon (next 48h).
    const overdueByDate = r.scheduled_date != null && r.scheduled_date < todayStr
    const overdueByDeadline = r.respond_by != null && new Date(r.respond_by) < now
    const dueSoonByDate = r.scheduled_date != null && r.scheduled_date <= todayStr && !overdueByDate
    const dueSoonByDeadline =
      r.respond_by != null && new Date(r.respond_by) <= soonCutoff && !overdueByDeadline

    let urgency: 'overdue' | 'due_soon' | null = null
    if (overdueByDate || overdueByDeadline) urgency = 'overdue'
    else if (dueSoonByDate || dueSoonByDeadline) urgency = 'due_soon'
    if (!urgency) continue

    calls.push({
      taskId: r.id,
      status: r.status,
      scheduledDate: r.scheduled_date,
      respondBy: r.respond_by,
      urgency,
      serviceTypeName: ss.service_type?.name ?? null,
      systemTypeName: ss.service_type?.system_type?.name ?? null,
      siteId: site.id,
      siteName: site.name,
      postcode: site.postcode,
      address: site.address,
      clientName: site.client?.name ?? null,
      assignedEngineerId: r.assigned_engineer_id,
      assignedEngineerName: r.assigned_engineer?.full_name ?? null,
      distanceMiles: Math.round(dist * 10) / 10,
    })
  }

  // Overdue first, then by distance.
  calls.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === 'overdue' ? -1 : 1
    return a.distanceMiles - b.distanceMiles
  })

  return { ok: true, calls }
}

/**
 * Directly self-assign a nearby call to the current engineer (they are already
 * on-site nearby). Notifies office/admin and the previous assignee, if any, so
 * everyone is aware and a second engineer isn't dispatched.
 */
export async function claimNearbyCall(input: {
  taskId: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: requester } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()
  if (!requester || (requester as { role: string }).role !== 'engineer') {
    return { ok: false, error: 'Only engineers can take a call' }
  }

  // Load the task with its current assignee + site name.
  const { data: task } = await supabase
    .from('tasks')
    .select(`id, status, assigned_engineer_id, site_service:site_services(site:sites(name))`)
    .eq('id', input.taskId)
    .single()
  if (!task) return { ok: false, error: 'Call not found' }
  if (task.status === 'completed' || task.status === 'cancelled') {
    return { ok: false, error: 'This call is no longer active' }
  }
  if (task.assigned_engineer_id === user.id) {
    return { ok: false, error: 'This call is already assigned to you' }
  }

  const previousEngineerId = task.assigned_engineer_id as string | null

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('tasks')
    .update({ assigned_engineer_id: user.id, updated_at: new Date().toISOString() })
    .eq('id', input.taskId)
  if (updateError) return { ok: false, error: updateError.message }

  const siteName =
    (task as unknown as { site_service?: { site?: { name?: string } } }).site_service?.site?.name ??
    'a nearby site'
  const engineerName = (requester as { full_name: string | null }).full_name || 'An engineer'

  // Notify office/admin plus any previous assignee.
  const { data: officeAdmins } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['office', 'admin'])
  const recipientIds = new Set<string>((officeAdmins || []).map((p) => p.id as string))
  if (previousEngineerId) recipientIds.add(previousEngineerId)
  recipientIds.delete(user.id)

  if (recipientIds.size > 0) {
    await notifyUsers({
      userIds: Array.from(recipientIds),
      title: 'Nearby call taken',
      body: `${engineerName} has taken ownership of the call at ${siteName} while on-site nearby.`,
      url: '/dashboard/schedule',
      category: 'transfer',
      data: { taskId: input.taskId },
      createdBy: user.id,
    })
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/nearby')
  return { ok: true }
}

/**
 * An engineer requests transfer of a nearby call. If unassigned, office/admin
 * are notified to action it. If assigned to another engineer, BOTH that
 * engineer and office are notified — either can approve.
 */
export async function requestTransfer(input: {
  taskId: string
  message?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: requester } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()
  if (!requester) return { ok: false, error: 'Profile not found' }

  // Load the task with site name + current assignee.
  const { data: task } = await supabase
    .from('tasks')
    .select(
      `id, status, assigned_engineer_id,
       site_service:site_services(site:sites(name))`
    )
    .eq('id', input.taskId)
    .single()
  if (!task) return { ok: false, error: 'Call not found' }
  if (task.assigned_engineer_id === user.id) {
    return { ok: false, error: 'This call is already assigned to you' }
  }

  const currentEngineerId = task.assigned_engineer_id as string | null

  // Create the request (unique partial index guards against duplicates).
  const { data: created, error: insertError } = await supabase
    .from('task_transfer_requests')
    .insert({
      task_id: input.taskId,
      requested_by: user.id,
      current_engineer_id: currentEngineerId,
      message: input.message || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return { ok: false, error: 'You already have a pending request for this call' }
    }
    return { ok: false, error: insertError.message }
  }

  // Resolve site name for the notification body.
  const siteName =
    (task as unknown as { site_service?: { site?: { name?: string } } }).site_service?.site
      ?.name ?? 'a nearby site'
  const requesterName = requester.full_name || 'An engineer'

  // Notify office/admin always; notify the assigned engineer too (if any).
  const admin = createAdminClient()
  const { data: officeAdmins } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['office', 'admin'])
  const recipientIds = new Set<string>((officeAdmins || []).map((p) => p.id as string))
  if (currentEngineerId) recipientIds.add(currentEngineerId)
  recipientIds.delete(user.id)

  await notifyUsers({
    userIds: Array.from(recipientIds),
    title: 'Call transfer requested',
    body: `${requesterName} has requested to take the call at ${siteName}.`,
    url: '/dashboard/transfers',
    category: 'transfer',
    data: { transferRequestId: created.id, taskId: input.taskId },
    createdBy: user.id,
  })

  revalidatePath('/dashboard/nearby')
  revalidatePath('/dashboard/transfers')
  return { ok: true }
}

/**
 * Approve or decline a transfer request. Allowed for office/admin OR the
 * currently-assigned engineer (per the approved decision: either can approve).
 */
export async function resolveTransfer(input: {
  requestId: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'Profile not found' }

  const { data: req } = await supabase
    .from('task_transfer_requests')
    .select('id, task_id, requested_by, current_engineer_id, status')
    .eq('id', input.requestId)
    .single()
  if (!req) return { ok: false, error: 'Request not found' }
  if (req.status !== 'pending') {
    return { ok: false, error: 'This request has already been resolved' }
  }

  const isOfficeOrAdmin = profile.role === 'office' || profile.role === 'admin'
  const isAssignedEngineer = req.current_engineer_id === user.id
  if (!isOfficeOrAdmin && !isAssignedEngineer) {
    return { ok: false, error: 'You are not allowed to action this request' }
  }

  const admin = createAdminClient()

  // Mark this request resolved.
  await admin
    .from('task_transfer_requests')
    .update({
      status: input.approve ? 'approved' : 'declined',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', input.requestId)

  if (input.approve) {
    // Reassign the call to the requesting engineer.
    await admin
      .from('tasks')
      .update({ assigned_engineer_id: req.requested_by })
      .eq('id', req.task_id)

    // Auto-decline any other pending requests for the same task.
    await admin
      .from('task_transfer_requests')
      .update({ status: 'cancelled', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('task_id', req.task_id)
      .eq('status', 'pending')
  }

  // Notify the requester of the outcome.
  await notifyUsers({
    userIds: [req.requested_by as string],
    title: input.approve ? 'Transfer approved' : 'Transfer declined',
    body: input.approve
      ? 'Your requested call has been transferred to you.'
      : 'Your call transfer request was declined.',
    url: input.approve ? '/dashboard/schedule' : '/dashboard/nearby',
    category: 'transfer',
    data: { taskId: req.task_id },
    createdBy: user.id,
  })

  revalidatePath('/dashboard/nearby')
  revalidatePath('/dashboard/transfers')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

/** Cancel a pending request the engineer made. */
export async function cancelTransfer(input: {
  requestId: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('task_transfer_requests')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', input.requestId)
    .eq('requested_by', user.id)
    .eq('status', 'pending')

  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/nearby')
  return { ok: true }
}

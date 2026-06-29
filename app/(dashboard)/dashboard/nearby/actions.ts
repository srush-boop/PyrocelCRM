'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePostcodes, distanceMiles, type LatLng } from '@/lib/geocode'
import { notifyUsers } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'

export interface NearbyCall {
  taskId: string
  status: string
  scheduledDate: string | null
  serviceTypeId: string | null
  serviceTypeName: string | null
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

  // Pull incomplete calls with their site + service + client + assignee.
  let query = supabase
    .from('tasks')
    .select(
      `id, status, scheduled_date, assigned_engineer_id,
       assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
       site_service:site_services(
         service_type_id,
         service_type:service_types(id, name),
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
      service_type: { id: string; name: string } | null
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
  // whose site_service is null; drop those defensively.
  const usable = rows.filter((r) => {
    if (input.serviceTypeId) {
      return r.site_service && r.site_service.service_type_id === input.serviceTypeId
    }
    return r.site_service
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

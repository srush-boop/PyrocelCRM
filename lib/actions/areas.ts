'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { AREA_COLORS, normalisePrefix } from '@/lib/areas/postcodes'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes(profile.role)) {
    return { error: 'Only office or admin users can plan areas' as const }
  }
  return { supabase }
}

export interface AreaActionResult {
  ok: boolean
  error?: string
  prefix?: string
  /** Name of the area the prefix was moved from, when it already belonged elsewhere. */
  movedFrom?: string | null
}

/** Put a postcode prefix into an area. A prefix already owned by another area is moved. */
export async function assignPostcodeToArea(areaId: string, rawPrefix: string): Promise<AreaActionResult> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const prefix = normalisePrefix(rawPrefix)
  if (!prefix) {
    return { ok: false, error: 'Enter postcode letters (NE), a district (NE2) or a sector (NE2 4)' }
  }

  const { data: existing } = await supabase
    .from('area_postcodes')
    .select('id, area_id, area:areas(name)')
    .eq('prefix', prefix)
    .maybeSingle()

  if (existing?.area_id === areaId) return { ok: true, prefix }

  if (existing) {
    const { error } = await supabase.from('area_postcodes').update({ area_id: areaId }).eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('area_postcodes').insert({ area_id: areaId, prefix })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/dashboard/areas')
  const prev = existing?.area as { name: string } | { name: string }[] | null | undefined
  const movedFrom = existing ? (Array.isArray(prev) ? prev[0]?.name : prev?.name) ?? null : null
  return { ok: true, prefix, movedFrom }
}

export async function removeAreaPostcode(ruleId: string): Promise<AreaActionResult> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { error } = await auth.supabase.from('area_postcodes').delete().eq('id', ruleId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/areas')
  return { ok: true }
}

export interface ServiceAreaAssignment {
  serviceId: string
  areaId: string
}

/**
 * Move reviewed services into the areas their site postcodes now fall in, and
 * hand their pending calls to each area's engineer. Only engineer services with
 * no direct engineer or route are touched, since those outrank area assignment.
 */
export async function assignServicesToAreas(
  assignments: ServiceAreaAssignment[],
): Promise<{ ok: boolean; error?: string; updated?: number; skipped?: number }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth
  if (assignments.length === 0) return { ok: false, error: 'No services selected' }

  const byArea = new Map<string, string[]>()
  for (const a of assignments) byArea.set(a.areaId, [...(byArea.get(a.areaId) ?? []), a.serviceId])

  const { data: areas, error: areaErr } = await supabase
    .from('areas')
    .select('id, assigned_engineer_id')
    .in('id', [...byArea.keys()])
  if (areaErr) return { ok: false, error: areaErr.message }
  const engineerByArea = new Map((areas ?? []).map((a) => [a.id, a.assigned_engineer_id as string | null]))

  let updated = 0
  for (const [areaId, ids] of byArea) {
    if (!engineerByArea.has(areaId)) continue
    const { data: moved, error } = await supabase
      .from('site_services')
      .update({ area_id: areaId })
      .in('id', ids)
      .in('worker_type', ['engineer'])
      .is('assigned_engineer_id', null)
      .is('route_id', null)
      .select('id')
    if (error) return { ok: false, error: error.message, updated }
    const movedIds = (moved ?? []).map((m) => m.id)
    updated += movedIds.length
    if (movedIds.length === 0) continue

    const { error: taskErr } = await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerByArea.get(areaId) ?? null })
      .in('site_service_id', movedIds)
      .eq('status', 'pending')
    if (taskErr) return { ok: false, error: taskErr.message, updated }
  }

  revalidatePath('/dashboard/areas')
  revalidatePath('/dashboard/schedule')
  return { ok: true, updated, skipped: assignments.length - updated }
}

export async function setAreaColor(areaId: string, color: string): Promise<AreaActionResult> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!(AREA_COLORS as readonly string[]).includes(color)) return { ok: false, error: 'Unknown colour' }
  const { error } = await auth.supabase.from('areas').update({ color }).eq('id', areaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/areas')
  return { ok: true }
}

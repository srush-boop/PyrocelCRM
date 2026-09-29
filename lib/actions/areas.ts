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

export async function setAreaColor(areaId: string, color: string): Promise<AreaActionResult> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!(AREA_COLORS as readonly string[]).includes(color)) return { ok: false, error: 'Unknown colour' }
  const { error } = await auth.supabase.from('areas').update({ color }).eq('id', areaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/areas')
  return { ok: true }
}

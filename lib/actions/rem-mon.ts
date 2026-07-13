'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RemMonFieldDef, RemMonLinkDef, RemMonEntry } from '@/lib/types/database'

type Result = { ok: boolean; error?: string }

// Master template (field/link defs) is admin configuration → office/admin only.
async function requireAdminOffice() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'Not authenticated' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase: null, error: 'Not authorised' as const }
  }
  return { supabase, error: null }
}

// Per-site entries are filled by internal users on site → engineers included.
async function requireInternal() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'Not authenticated' as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office', 'engineer'].includes(role)) {
    return { supabase: null, error: 'Not authorised' as const }
  }
  return { supabase, error: null }
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const SETTINGS_PATH = '/dashboard/sales/rem-mon'

// ---------- Field definitions (admin config) ----------

export async function saveRemMonFieldDef(input: {
  id?: string
  system_type_id: string
  label: string
  field_key: string
  field_type: RemMonFieldDef['field_type']
  options: string[]
  required: boolean
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id) return { ok: false, error: 'A system type is required' }
  if (!input.label.trim()) return { ok: false, error: 'A label is required' }

  const field_key = input.field_key.trim() || slugify(input.label)
  const payload = {
    system_type_id: input.system_type_id,
    label: input.label.trim(),
    field_key,
    field_type: input.field_type,
    options: input.field_type === 'select' ? input.options : [],
    required: input.required,
    position: input.position,
  }

  const query = input.id
    ? supabase.from('rem_mon_field_defs').update(payload).eq('id', input.id)
    : supabase.from('rem_mon_field_defs').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function deleteRemMonFieldDef(id: string): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('rem_mon_field_defs').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function reorderRemMonFieldDefs(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('rem_mon_field_defs')
      .update({ position: i })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// ---------- Link definitions (admin config) ----------

export async function saveRemMonLinkDef(input: {
  id?: string
  system_type_id: string
  label: string
  link_key: string
  target_kind: RemMonLinkDef['target_kind']
  in_app_target: RemMonLinkDef['in_app_target']
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id) return { ok: false, error: 'A system type is required' }
  if (!input.label.trim()) return { ok: false, error: 'A label is required' }

  const link_key = input.link_key.trim() || slugify(input.label)
  const payload = {
    system_type_id: input.system_type_id,
    label: input.label.trim(),
    link_key,
    target_kind: input.target_kind,
    in_app_target: input.target_kind === 'in_app' ? input.in_app_target : null,
    position: input.position,
  }

  const query = input.id
    ? supabase.from('rem_mon_link_defs').update(payload).eq('id', input.id)
    : supabase.from('rem_mon_link_defs').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function deleteRemMonLinkDef(id: string): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('rem_mon_link_defs').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

export async function reorderRemMonLinkDefs(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('rem_mon_link_defs')
      .update({ position: i })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}

// ---------- Per-site entries (internal users) ----------

export async function saveRemMonEntry(input: {
  id?: string
  site_system_id: string
  name: string
  field_values: RemMonEntry['field_values']
  link_values: RemMonEntry['link_values']
  sitePath?: string
}): Promise<Result> {
  const { supabase, error } = await requireInternal()
  if (!supabase) return { ok: false, error }
  if (!input.site_system_id) return { ok: false, error: 'A system is required' }
  if (!input.name.trim()) return { ok: false, error: 'A name is required' }

  if (input.id) {
    const { error: dbError } = await supabase
      .from('rem_mon_entries')
      .update({
        name: input.name.trim(),
        field_values: input.field_values,
        link_values: input.link_values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
    if (dbError) return { ok: false, error: dbError.message }
  } else {
    const { count } = await supabase
      .from('rem_mon_entries')
      .select('id', { count: 'exact', head: true })
      .eq('site_system_id', input.site_system_id)
    const { error: dbError } = await supabase.from('rem_mon_entries').insert({
      site_system_id: input.site_system_id,
      name: input.name.trim(),
      field_values: input.field_values,
      link_values: input.link_values,
      position: count ?? 0,
    })
    if (dbError) return { ok: false, error: dbError.message }
  }

  if (input.sitePath) revalidatePath(input.sitePath)
  return { ok: true }
}

export async function deleteRemMonEntry(id: string, sitePath?: string): Promise<Result> {
  const { supabase, error } = await requireInternal()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('rem_mon_entries').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  if (sitePath) revalidatePath(sitePath)
  return { ok: true }
}

/**
 * Ensure the REM-MON site system is backed by a (non-recurring) Remote
 * Monitoring site_service, so the existing "Add charge"/billing plumbing works.
 * Idempotent: no-ops when a service already exists. Never seeds tasks/visits.
 * Returns the resolved site_service id (or null when it couldn't be resolved).
 */
export async function ensureRemMonService(
  siteSystemId: string,
  sitePath?: string,
): Promise<{ ok: boolean; error?: string; serviceId?: string | null }> {
  const { supabase, error } = await requireInternal()
  if (!supabase) return { ok: false, error }

  // Load the system and confirm it is the Remote Monitoring system by code.
  const { data: sys, error: sysError } = await supabase
    .from('site_systems')
    .select('id, site_id, system_type_id, system_type:system_types(id, code)')
    .eq('id', siteSystemId)
    .single()
  if (sysError || !sys) return { ok: false, error: sysError?.message ?? 'System not found' }
  const systemType = (sys as { system_type?: { code?: string } | null }).system_type
  if (!systemType || systemType.code !== 'REM-MON') {
    return { ok: false, error: 'Not a Remote Monitoring system' }
  }
  const siteId = (sys as { site_id: string }).site_id
  const systemTypeId = (sys as { system_type_id: string }).system_type_id

  // Find the non-recurring Remote Monitoring service type for this system.
  const { data: st } = await supabase
    .from('service_types')
    .select('id')
    .eq('system_type_id', systemTypeId)
    .eq('is_recurring', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const serviceTypeId = (st as { id?: string } | null)?.id
  if (!serviceTypeId) return { ok: true, serviceId: null }

  // Already attached to this system?
  const { data: existing } = await supabase
    .from('site_services')
    .select('id')
    .eq('site_system_id', siteSystemId)
    .eq('service_type_id', serviceTypeId)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return { ok: true, serviceId: existing.id }

  // Attach without a next_service_date and without seeding tasks (no visits).
  const { data: inserted, error: insError } = await supabase
    .from('site_services')
    .insert({
      site_id: siteId,
      service_type_id: serviceTypeId,
      site_system_id: siteSystemId,
      next_service_date: null,
      active: true,
    })
    .select('id')
    .single()
  if (insError) return { ok: false, error: insError.message }

  if (sitePath) revalidatePath(sitePath)
  return { ok: true, serviceId: (inserted as { id: string }).id }
}

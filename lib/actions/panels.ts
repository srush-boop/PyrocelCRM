'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PanelFieldDef, SystemPanel } from '@/lib/types/database'

type Result = { ok: boolean; error?: string }

// Panel field definitions are admin configuration → office/admin only.
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

// Panel instances are filled by internal users on site → engineers included.
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

// ---------- Panel field definitions (admin config) ----------

export async function savePanelFieldDef(input: {
  id?: string
  system_type_id: string
  label: string
  field_key: string
  field_type: PanelFieldDef['field_type']
  options: string[]
  required: boolean
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id) return { ok: false, error: 'A system type is required' }
  if (!input.label.trim()) return { ok: false, error: 'A label is required' }

  // Derive a stable snake_case key from the label when not supplied.
  const field_key =
    input.field_key.trim() ||
    input.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

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
    ? supabase.from('panel_field_defs').update(payload).eq('id', input.id)
    : supabase.from('panel_field_defs').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/panel-fields')
  return { ok: true }
}

export async function deletePanelFieldDef(id: string): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('panel_field_defs').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/panel-fields')
  return { ok: true }
}

export async function reorderPanelFieldDefs(orderedIds: string[]): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error: dbError } = await supabase
      .from('panel_field_defs')
      .update({ position: i })
      .eq('id', orderedIds[i])
    if (dbError) return { ok: false, error: dbError.message }
  }
  revalidatePath('/dashboard/sales/panel-fields')
  return { ok: true }
}

// ---------- Panel instances (filled by internal users) ----------

export async function savePanel(input: {
  id?: string
  site_system_id: string
  name: string
  field_values: SystemPanel['field_values']
  sitePath?: string
}): Promise<Result> {
  const { supabase, error } = await requireInternal()
  if (!supabase) return { ok: false, error }
  if (!input.site_system_id) return { ok: false, error: 'A system is required' }
  if (!input.name.trim()) return { ok: false, error: 'A panel name is required' }

  if (input.id) {
    const { error: dbError } = await supabase
      .from('system_panels')
      .update({
        name: input.name.trim(),
        field_values: input.field_values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
    if (dbError) return { ok: false, error: dbError.message }
  } else {
    // Append to the end of the existing panels for this system.
    const { count } = await supabase
      .from('system_panels')
      .select('id', { count: 'exact', head: true })
      .eq('site_system_id', input.site_system_id)
    const { error: dbError } = await supabase.from('system_panels').insert({
      site_system_id: input.site_system_id,
      name: input.name.trim(),
      field_values: input.field_values,
      position: count ?? 0,
    })
    if (dbError) return { ok: false, error: dbError.message }
  }

  if (input.sitePath) revalidatePath(input.sitePath)
  return { ok: true }
}

export async function deletePanel(id: string, sitePath?: string): Promise<Result> {
  const { supabase, error } = await requireInternal()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('system_panels').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  if (sitePath) revalidatePath(sitePath)
  return { ok: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok: boolean; error?: string }

async function requireStaff() {
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

// ---------- System types ----------
export async function saveSystemType(input: {
  id?: string
  name: string
  code: string
  description: string
  color: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    name: input.name,
    code: input.code.trim().toUpperCase() || null,
    description: input.description || null,
    color: input.color || null,
  }

  const query = input.id
    ? supabase.from('system_types').update(payload).eq('id', input.id)
    : supabase.from('system_types').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/system-types')
  revalidatePath('/dashboard/service-types')
  return { ok: true }
}

export async function deleteSystemType(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('system_types').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/system-types')
  revalidatePath('/dashboard/service-types')
  return { ok: true }
}

// ---------- Asset types (PPM calculator library) ----------
export async function saveAssetType(input: {
  id?: string
  system_type_id: string | null
  name: string
  description: string
  default_minutes: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    system_type_id: input.system_type_id || null,
    name: input.name.trim(),
    description: input.description || null,
    default_minutes: Number.isFinite(input.default_minutes) ? input.default_minutes : 0,
  }

  const query = input.id
    ? supabase.from('asset_types').update(payload).eq('id', input.id)
    : supabase.from('asset_types').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/asset-types')
  return { ok: true }
}

export async function deleteAssetType(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('asset_types').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/asset-types')
  return { ok: true }
}

// ---------- Spec templates ----------
export async function saveSpecTemplate(input: {
  id?: string
  system_type_id: string
  work_type: string
  specification: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    system_type_id: input.system_type_id,
    work_type: input.work_type,
    specification: input.specification || null,
  }

  // Upsert on (system_type_id, work_type) so there is one template per combo.
  const { error: dbError } = await supabase
    .from('system_spec_templates')
    .upsert(payload, { onConflict: 'system_type_id,work_type' })

  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true }
}

export async function deleteSpecTemplate(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('system_spec_templates').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/spec-templates')
  return { ok: true }
}

// ---------- Work-type fields ----------
export async function saveWorkTypeField(input: {
  id?: string
  work_type: string
  system_type_id: string
  label: string
  field_key: string
  field_type: 'text' | 'number' | 'select' | 'boolean'
  options: string[]
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  if (!input.system_type_id) return { ok: false, error: 'A system type is required' }

  const payload = {
    work_type: input.work_type,
    system_type_id: input.system_type_id,
    label: input.label,
    field_key: input.field_key,
    field_type: input.field_type,
    options: input.options,
    position: input.position,
  }

  const query = input.id
    ? supabase.from('work_type_fields').update(payload).eq('id', input.id)
    : supabase.from('work_type_fields').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/work-type-fields')
  return { ok: true }
}

export async function deleteWorkTypeField(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('work_type_fields').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/work-type-fields')
  return { ok: true }
}

// ---------- Design categories ----------
export async function saveDesignCategory(input: {
  id?: string
  name: string
  overview: string
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = { name: input.name, overview: input.overview || null }

  const query = input.id
    ? supabase.from('quote_design_categories').update(payload).eq('id', input.id)
    : supabase.from('quote_design_categories').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/design-categories')
  return { ok: true }
}

export async function deleteDesignCategory(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('quote_design_categories').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/design-categories')
  return { ok: true }
}

// ---------- System x work-type set margins ----------
export async function saveSystemWorkTypeMargin(input: {
  system_type_id: string
  work_type: string
  margin_percent: number | null
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.system_type_id || !input.work_type) {
    return { ok: false, error: 'System type and work type are required' }
  }

  // A null/blank margin clears the entry so it falls back to the default.
  if (input.margin_percent === null || !Number.isFinite(input.margin_percent)) {
    const { error: delError } = await supabase
      .from('system_work_type_margins')
      .delete()
      .eq('system_type_id', input.system_type_id)
      .eq('work_type', input.work_type)
    if (delError) return { ok: false, error: delError.message }
    revalidatePath('/dashboard/sales/margins')
    return { ok: true }
  }

  const { error: dbError } = await supabase.from('system_work_type_margins').upsert(
    {
      system_type_id: input.system_type_id,
      work_type: input.work_type,
      margin_percent: input.margin_percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'system_type_id,work_type' },
  )
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/margins')
  return { ok: true }
}

// ---------- Work-type settings (design/survey toggle) ----------
export async function saveWorkTypeSetting(input: {
  work_type: string
  requires_design: boolean
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.work_type) return { ok: false, error: 'Work type is required' }

  const { error: dbError } = await supabase.from('work_type_settings').upsert(
    {
      work_type: input.work_type,
      requires_design: input.requires_design,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'work_type' },
  )
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/sales/margins')
  return { ok: true }
}

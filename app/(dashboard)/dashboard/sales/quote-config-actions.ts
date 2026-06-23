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
  label: string
  field_key: string
  field_type: 'text' | 'number' | 'select' | 'boolean'
  options: string[]
  position: number
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }

  const payload = {
    work_type: input.work_type,
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

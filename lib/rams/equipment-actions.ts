'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import type { RamsEquipmentItem, RamsMasterTemplate } from './types'

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

async function requireApprover() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) throw new Error('Not authenticated')
  if (profile.role !== 'admin' && profile.role !== 'office') {
    throw new Error('Not authorised')
  }
  return { user, profile }
}

const ADMIN_PATH = '/dashboard/rams/admin/equipment'

// ---------------------------------------------------------------------------
// Equipment library CRUD
// ---------------------------------------------------------------------------

export async function loadEquipmentAdminData(): Promise<{
  equipment: RamsEquipmentItem[]
  systemTemplates: RamsMasterTemplate[]
}> {
  const supabase = await createClient()
  const [equipRes, templatesRes] = await Promise.all([
    supabase.from('rams_equipment_library').select('*').order('category').order('name'),
    supabase
      .from('rams_master_templates')
      .select('*')
      .eq('template_type', 'system')
      .eq('is_active', true)
      .order('name'),
  ])
  return {
    equipment: (equipRes.data as RamsEquipmentItem[]) ?? [],
    systemTemplates: (templatesRes.data as RamsMasterTemplate[]) ?? [],
  }
}

export async function saveEquipment(values: {
  id?: string
  name: string
  category: string
  is_active?: boolean
}): Promise<ActionResult> {
  try {
    await requireApprover()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const name = values.name.trim()
  if (!name) return { success: false, error: 'Name is required' }
  const category = values.category.trim() || 'General'
  const supabase = await createClient()

  if (values.id) {
    const { error } = await supabase
      .from('rams_equipment_library')
      .update({
        name,
        category,
        is_active: values.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', values.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('rams_equipment_library')
      .insert({ name, category })
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'That equipment already exists' }
      }
      return { success: false, error: error.message }
    }
  }
  revalidatePath(ADMIN_PATH)
  return { success: true }
}

export async function deleteEquipment(id: string): Promise<ActionResult> {
  try {
    await requireApprover()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('rams_equipment_library').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath(ADMIN_PATH)
  return { success: true }
}

// ---------------------------------------------------------------------------
// System-type default equipment mapping
//
// The mapping lives directly on the system template's `default_equipment`
// column (a single source of truth also used by the wizard). This updates that
// list for a given system template.
// ---------------------------------------------------------------------------

export async function updateSystemEquipment(
  systemTemplateId: string,
  equipment: string[],
): Promise<ActionResult> {
  try {
    await requireApprover()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  const cleaned = Array.from(
    new Set(equipment.map((e) => e.trim()).filter(Boolean)),
  )
  const supabase = await createClient()
  const { error } = await supabase
    .from('rams_master_templates')
    .update({ default_equipment: cleaned, updated_at: new Date().toISOString() })
    .eq('id', systemTemplateId)
    .eq('template_type', 'system')
  if (error) return { success: false, error: error.message }
  revalidatePath(ADMIN_PATH)
  return { success: true }
}

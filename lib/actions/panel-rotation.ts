'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok: boolean; error?: string }

// Rotation config is office/admin only (site/service setup).
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

// Toggle whether a system spreads Annual load across visits per panel.
export async function setPanelRotationEnabled(input: {
  site_system_id: string
  enabled: boolean
  sitePath?: string
}): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  if (!input.site_system_id) return { ok: false, error: 'A system is required' }

  const { error: dbError } = await supabase
    .from('site_systems')
    .update({ panel_rotation_enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq('id', input.site_system_id)
  if (dbError) return { ok: false, error: dbError.message }

  if (input.sitePath) revalidatePath(input.sitePath)
  return { ok: true }
}

// One grid cell: panel × scheduled visit occurrence → applied checklist level.
export type PanelRotationCell = {
  panel_id: string
  visit_type_id: string
  applied_visit_type_id: string
}

// Replace the full rotation grid for a system in one call (delete-then-insert so
// removed panels/visit types don't leave orphans).
export async function savePanelRotation(input: {
  site_system_id: string
  cells: PanelRotationCell[]
  sitePath?: string
}): Promise<Result> {
  const { supabase, error } = await requireAdminOffice()
  if (!supabase) return { ok: false, error }
  if (!input.site_system_id) return { ok: false, error: 'A system is required' }

  const { error: delError } = await supabase
    .from('panel_visit_assignments')
    .delete()
    .eq('site_system_id', input.site_system_id)
  if (delError) return { ok: false, error: delError.message }

  if (input.cells.length > 0) {
    const rows = input.cells.map((c) => ({
      site_system_id: input.site_system_id,
      panel_id: c.panel_id,
      visit_type_id: c.visit_type_id,
      applied_visit_type_id: c.applied_visit_type_id,
    }))
    const { error: insError } = await supabase.from('panel_visit_assignments').insert(rows)
    if (insError) return { ok: false, error: insError.message }
  }

  if (input.sitePath) revalidatePath(input.sitePath)
  return { ok: true }
}

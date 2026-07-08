'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Server actions for managing a user's vehicle stock location from the Users
// page. A vehicle is a `stock_locations` row with `engineer_id` set and the
// internal `kind='van'` value. Admin-only: the Users page is already gated to
// admins, and these re-check the caller's role as a backstop.

export interface EngineerVehicle {
  id: string
  name: string
  is_active: boolean
  branch_id: string | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return { supabase, ok: (profile as { role: string } | null)?.role === 'admin' }
}

/** List the vehicle/stock locations linked to a given user. */
export async function getEngineerVehicles(userId: string): Promise<EngineerVehicle[]> {
  const { supabase, ok } = await requireAdmin()
  if (!ok) return []
  const { data } = await supabase
    .from('stock_locations')
    .select('id, name, is_active, branch_id')
    .eq('engineer_id', userId)
    .order('created_at')
  return (data as EngineerVehicle[]) ?? []
}

/**
 * Create a new vehicle stock location for a user, or update an existing one's
 * name / active state. Links it via `engineer_id` so parts used on that user's
 * calls auto-deduct from it.
 */
export async function upsertEngineerVehicle(input: {
  userId: string
  locationId?: string
  name: string
  branchId?: string | null
  isActive?: boolean
}): Promise<{ error?: string }> {
  const { supabase, ok } = await requireAdmin()
  if (!ok) return { error: 'Not authorised' }

  const name = input.name.trim()
  if (!name) return { error: 'Please enter a vehicle name.' }

  if (input.locationId) {
    const { error } = await supabase
      .from('stock_locations')
      .update({ name, is_active: input.isActive ?? true })
      .eq('id', input.locationId)
      .eq('engineer_id', input.userId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('stock_locations').insert({
      name,
      kind: 'van',
      engineer_id: input.userId,
      branch_id: input.branchId ?? null,
      is_active: input.isActive ?? true,
    })
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/engineers')
  return {}
}

/** Toggle a vehicle location's active state. */
export async function setEngineerVehicleActive(
  locationId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const { supabase, ok } = await requireAdmin()
  if (!ok) return { error: 'Not authorised' }
  const { error } = await supabase
    .from('stock_locations')
    .update({ is_active: isActive })
    .eq('id', locationId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/engineers')
  return {}
}

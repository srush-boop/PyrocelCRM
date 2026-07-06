'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: boolean; error?: string }

// Admin guard specific to system references (stricter than the office-level
// document store permissions).
async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const, error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { supabase, ok: false as const, error: 'Only admins can manage system references.' }
  }
  return { supabase, ok: true as const, error: null }
}

// Update a system reference's description and/or assigned system.
export async function updateSystemReference(args: {
  id: string
  description: string | null
  system_type_id: string | null
}): Promise<Result> {
  const { supabase, ok, error } = await requireAdmin()
  if (!ok) return { ok: false, error: error ?? 'Not authorised.' }

  if (!args.system_type_id) {
    return { ok: false, error: 'Please choose a system.' }
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({
      description: args.description?.trim() || null,
      system_type_id: args.system_type_id,
    })
    .eq('id', args.id)
    .eq('owner_type', 'system_reference')

  if (updateError) {
    console.log('[v0] updateSystemReference error:', updateError.message)
    return { ok: false, error: 'Could not update the reference.' }
  }

  revalidatePath('/dashboard/documents')
  return { ok: true }
}

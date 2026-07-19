'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Level = 'client' | 'site' | 'system' | 'service'

const TABLE: Record<Level, string> = {
  client: 'clients',
  site: 'sites',
  system: 'site_systems',
  service: 'site_services',
}

/**
 * Set (or clear) the customer PO on a client / site / system / service row.
 * Staff-only via RLS on the underlying tables. Empty string clears the PO.
 */
export async function setCustomerPo(
  level: Level,
  id: string,
  poNumber: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from(TABLE[level])
    .update({ po_number: poNumber.trim() || null })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/sites', 'page')
  return { error: null }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { searchPartLocations, type PartLocationResult } from '@/lib/stock'

// Server action backing the part locator search. Restricted to signed-in staff
// (clients have no business searching stock).
export async function findPartLocations(query: string): Promise<PartLocationResult[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as { role: string }).role === 'client') return []

  return searchPartLocations(query)
}

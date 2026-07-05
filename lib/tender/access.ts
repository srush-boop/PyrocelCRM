import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'

/**
 * Guards Tender AI pages: requires a signed-in admin or office user. Redirects
 * to login (unauthenticated) or the dashboard (insufficient role). Returns the
 * caller's profile for use in the page.
 */
export async function requireTenderAccess(): Promise<Profile> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const role = (profile as Profile | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    redirect('/dashboard')
  }

  return profile as Profile
}

/**
 * API-route variant: returns the user id when the caller is admin/office, or
 * null otherwise (the route should respond 401/403).
 */
export async function getTenderApiUser(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) return null
  return { id: user.id }
}

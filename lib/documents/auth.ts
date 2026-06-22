import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

export type DocAuth = {
  ok: boolean
  status: number
  profile: Profile | null
  canManage: boolean
}

/**
 * Resolve the current user's document-store permissions.
 * - Any staff member (admin/office/engineer) may read.
 * - Only admin & office may manage (upload, create folders, rename, delete).
 */
export async function getDocumentAuth(): Promise<DocAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, profile: null, canManage: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const role = (profile as Profile | null)?.role
  const isStaff = role === 'admin' || role === 'office' || role === 'engineer'
  const canManage = role === 'admin' || role === 'office'

  if (!isStaff) {
    return { ok: false, status: 403, profile: (profile as Profile) ?? null, canManage: false }
  }

  return { ok: true, status: 200, profile: profile as Profile, canManage }
}

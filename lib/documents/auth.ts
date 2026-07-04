import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

export type DocAuth = {
  ok: boolean
  status: number
  profile: Profile | null
  canManage: boolean
  // Engineers can contribute to the shared per-site engineer folder
  // (owner_type 'site_engineer') even though they cannot manage other stores.
  canManageEngineer: boolean
}

/**
 * Resolve the current user's document-store permissions.
 * - Any staff member (admin/office/engineer) may read.
 * - Only admin & office may manage the client/site/service stores.
 * - All staff (incl. engineers) may manage the shared engineer folder.
 */
export async function getDocumentAuth(): Promise<DocAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, profile: null, canManage: false, canManageEngineer: false }
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
    return {
      ok: false,
      status: 403,
      profile: (profile as Profile) ?? null,
      canManage: false,
      canManageEngineer: false,
    }
  }

  return { ok: true, status: 200, profile: profile as Profile, canManage, canManageEngineer: true }
}

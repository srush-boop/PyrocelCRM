import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, Asset, AssetCategory, AssetCheckSchedule } from '@/lib/types/database'
import { AssetsIndex } from '@/components/dashboard/assets/assets-index'

export const metadata = {
  title: 'Assets',
  description: 'Company asset register, checks and assignments',
}

export default async function AssetsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', user.id)
    .single()

  const profile = profileData as Pick<Profile, 'id' | 'role' | 'full_name' | 'email'> | null
  if (!profile || profile.role === 'client') redirect('/dashboard')

  const isManager = ['admin', 'office'].includes(profile.role)

  // Assets: managers see everything; engineers see only what's assigned to them.
  let assetsQuery = supabase
    .from('assets')
    .select(
      '*, category:asset_categories(*), holder:profiles!assets_assigned_to_fkey(id, full_name, email)',
    )
    .order('name', { ascending: true })
  if (!isManager) assetsQuery = assetsQuery.eq('assigned_to', user.id)

  // Active schedules for the checks-due widget (joined to their asset).
  let schedulesQuery = supabase
    .from('asset_check_schedules')
    .select('*, asset:assets(id, urn, name, status, assigned_to)')
    .eq('active', true)
    .not('next_due_date', 'is', null)
    .order('next_due_date', { ascending: true })
  if (!isManager) {
    // Engineers only see schedules for assets assigned to them.
    // (RLS also enforces this.)
    schedulesQuery = schedulesQuery
  }

  const [{ data: assetsData }, { data: schedulesData }, { data: categoriesData }, { data: staffData }] =
    await Promise.all([
      assetsQuery,
      schedulesQuery,
      supabase.from('asset_categories').select('*').order('sort_order', { ascending: true }),
      isManager
        ? supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('role', ['admin', 'office', 'engineer'])
            .eq('status', 'active')
            .order('full_name', { ascending: true })
        : Promise.resolve({ data: [] as Pick<Profile, 'id' | 'full_name' | 'email'>[] }),
    ])

  const assets = (assetsData || []) as Asset[]
  const schedules = (schedulesData || []) as (AssetCheckSchedule & {
    asset: { id: string; urn: string; name: string; status: string; assigned_to: string | null } | null
  })[]
  const categories = (categoriesData || []) as AssetCategory[]
  const staff = (staffData || []) as Pick<Profile, 'id' | 'full_name' | 'email'>[]

  return (
    <AssetsIndex
      assets={assets}
      schedules={schedules}
      categories={categories}
      staff={staff}
      isManager={isManager}
    />
  )
}

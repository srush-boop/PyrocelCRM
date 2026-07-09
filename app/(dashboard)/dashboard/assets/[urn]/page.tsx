import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AssetDetail } from '@/components/dashboard/assets/asset-detail'
import type {
  Asset,
  AssetCheckSchedule,
  AssetCheck,
  AssetAssignment,
  AssetCategory,
  Profile,
} from '@/lib/types/database'

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ urn: string }>
}) {
  const { urn } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const isManager = profile?.role === 'admin' || profile?.role === 'office'

  const { data: asset } = await supabase
    .from('assets')
    .select(
      `*,
       category:asset_categories(*),
       holder:profiles!assets_assigned_to_fkey(id, full_name, email)`,
    )
    .eq('urn', urn)
    .maybeSingle()

  if (!asset) notFound()

  // Engineers may only view assets assigned to them.
  if (!isManager && asset.assigned_to !== user.id) {
    redirect('/dashboard/assets')
  }

  const [{ data: schedules }, { data: checks }, { data: assignments }, { data: staff }, { data: categories }] =
    await Promise.all([
      supabase
        .from('asset_check_schedules')
        .select('*')
        .eq('asset_id', asset.id)
        .order('next_due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('asset_checks')
        .select('*, schedule:asset_check_schedules(id, name), performer:profiles!asset_checks_performed_by_fkey(id, full_name)')
        .eq('asset_id', asset.id)
        .order('check_date', { ascending: false }),
      supabase
        .from('asset_assignments')
        .select(
          '*, holder:profiles!asset_assignments_assigned_to_fkey(id, full_name), assigner:profiles!asset_assignments_assigned_by_fkey(id, full_name)',
        )
        .eq('asset_id', asset.id)
        .order('assigned_at', { ascending: false }),
      isManager
        ? supabase.from('profiles').select('id, full_name, email').order('full_name')
        : Promise.resolve({ data: [] as Pick<Profile, 'id' | 'full_name' | 'email'>[] }),
      isManager
        ? supabase.from('asset_categories').select('*').order('sort_order')
        : Promise.resolve({ data: [] as AssetCategory[] }),
    ])

  return (
    <AssetDetail
      asset={asset as Asset}
      schedules={(schedules as AssetCheckSchedule[]) ?? []}
      checks={(checks as AssetCheck[]) ?? []}
      assignments={(assignments as AssetAssignment[]) ?? []}
      staff={(staff as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
      categories={(categories as AssetCategory[]) ?? []}
      isManager={isManager}
      currentUserId={user.id}
    />
  )
}

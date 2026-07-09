import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Asset, Profile } from '@/lib/types/database'
import { AssetLabelSheet } from '@/components/dashboard/assets/asset-label-sheet'

interface PageProps {
  searchParams: Promise<{ ids?: string; category?: string }>
}

export default async function AssetLabelsPage({ searchParams }: PageProps) {
  const { ids, category } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (!role || !['admin', 'office'].includes(role)) redirect('/dashboard/assets')

  let query = supabase
    .from('assets')
    .select('*, category:asset_categories(name)')
    .eq('status', 'active')

  if (ids) query = query.in('id', ids.split(',').filter(Boolean))
  if (category) query = query.eq('category_id', category)

  const { data } = await query.order('name', { ascending: true })
  const assets = (data || []) as Asset[]

  return <AssetLabelSheet assets={assets} />
}

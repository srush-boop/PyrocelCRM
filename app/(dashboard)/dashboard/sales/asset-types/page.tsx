import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AssetTypesManager } from '@/components/dashboard/sales/asset-types-manager'
import type { Profile, AssetType, SystemType } from '@/lib/types/database'

export const metadata = { title: 'Asset Types | Pyrocel' }

export default async function AssetTypesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: assetTypes }, { data: systemTypes }] = await Promise.all([
    supabase.from('asset_types').select('*').order('position').order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Asset Types</h1>
        <p className="text-muted-foreground">
          The assets you test on each system, with a default test time. These feed the PPM
          service-contract calculator in the quote builder.
        </p>
      </div>
      <AssetTypesManager
        assetTypes={(assetTypes ?? []) as AssetType[]}
        systemTypes={(systemTypes ?? []) as SystemType[]}
      />
    </div>
  )
}

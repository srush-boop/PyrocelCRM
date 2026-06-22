import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AreasTable } from '@/components/dashboard/areas/areas-table'
import { AddAreaDialog } from '@/components/dashboard/areas/add-area-dialog'
import type { Area, Profile } from '@/lib/types/database'

export default async function AreasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const [areasResult, workersResult, areaServicesResult] = await Promise.all([
    supabase
      .from('areas')
      .select(`*, assigned_engineer:profiles(*)`)
      .order('name'),
    supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
    supabase.from('site_services').select('area_id').not('area_id', 'is', null),
  ])

  const areas = (areasResult.data || []) as (Area & { assigned_engineer: Profile | null })[]
  const workers = (workersResult.data || []) as Profile[]

  // Count services per area.
  const areaServices = (areaServicesResult.data || []) as { area_id: string }[]
  const countByArea = areaServices.reduce<Record<string, number>>((acc, row) => {
    acc[row.area_id] = (acc[row.area_id] || 0) + 1
    return acc
  }, {})

  const areasWithCounts = areas.map((area) => ({
    ...area,
    serviceCount: countByArea[area.id] || 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Areas</h1>
          <p className="text-muted-foreground">
            Manage operational areas and the workers who cover non-route services
          </p>
        </div>
        <AddAreaDialog workers={workers} />
      </div>

      <AreasTable areas={areasWithCounts} workers={workers} />
    </div>
  )
}

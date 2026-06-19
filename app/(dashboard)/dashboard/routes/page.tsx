import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RoutesTable } from '@/components/dashboard/routes/routes-table'
import { AddRouteDialog } from '@/components/dashboard/routes/add-route-dialog'
import type { PlannerSite } from '@/components/dashboard/routes/route-planner-dialog'
import type { Profile, Route } from '@/lib/types/database'

export default async function RoutesPage() {
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

  const [routesResult, engineersResult, sitesResult] = await Promise.all([
    supabase
      .from('routes')
      .select(`
        *,
        assigned_engineer:profiles(*)
      `)
      .order('name'),
    supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
    supabase.from('sites').select('id, name, route_id, route_position'),
  ])

  const routes = (routesResult.data || []) as (Route & { assigned_engineer: Profile | null })[]
  const engineers = (engineersResult.data || []) as Profile[]
  const sites = (sitesResult.data || []) as PlannerSite[]

  // Count sites per route
  const routesWithSiteCounts = routes.map((route) => ({
    ...route,
    siteCount: sites.filter((site) => site.route_id === route.id).length,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Routes</h1>
          <p className="text-muted-foreground">
            Manage geographic routes and engineer assignments
          </p>
        </div>
        <AddRouteDialog engineers={engineers} />
      </div>

      <RoutesTable routes={routesWithSiteCounts} engineers={engineers} sites={sites} />
    </div>
  )
}

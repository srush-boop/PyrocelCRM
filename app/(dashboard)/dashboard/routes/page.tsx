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
    supabase
      .from('sites')
      .select(`
        id, name, route_id, route_position,
        services:site_services(
          id, route_id,
          service_type:service_types(name)
        )
      `),
  ])

  const routes = (routesResult.data || []) as (Route & { assigned_engineer: Profile | null })[]
  const engineers = (engineersResult.data || []) as Profile[]

  type ServiceTypeRel = { name: string } | { name: string }[] | null
  type RawSite = {
    id: string
    name: string
    route_id: string | null
    route_position: number | null
    services: { id: string; route_id: string | null; service_type: ServiceTypeRel }[] | null
  }

  const serviceTypeName = (rel: ServiceTypeRel): string =>
    (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? 'Service'

  // Normalise into the planner shape: each site carries its services so routing
  // can be managed per service rather than per site.
  const sites: PlannerSite[] = ((sitesResult.data || []) as unknown as RawSite[]).map((site) => ({
    id: site.id,
    name: site.name,
    route_id: site.route_id,
    route_position: site.route_position,
    services: (site.services || []).map((svc) => ({
      id: svc.id,
      route_id: svc.route_id,
      name: serviceTypeName(svc.service_type),
    })),
  }))

  // A site is "on" a route when at least one of its services is on that route.
  const routesWithSiteCounts = routes.map((route) => ({
    ...route,
    siteCount: sites.filter((site) => site.services.some((svc) => svc.route_id === route.id)).length,
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

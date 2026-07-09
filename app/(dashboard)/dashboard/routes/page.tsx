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
          id, route_id, worker_type, active,
          service_type:service_types(name),
          site_system:site_systems(name)
        )
      `),
  ])

  const routes = (routesResult.data || []) as (Route & { assigned_engineer: Profile | null })[]
  const engineers = (engineersResult.data || []) as Profile[]

  type NameRel = { name: string } | { name: string }[] | null
  type RawService = {
    id: string
    route_id: string | null
    worker_type: string | null
    active: boolean | null
    service_type: NameRel
    site_system: NameRel
  }
  type RawSite = {
    id: string
    name: string
    route_id: string | null
    route_position: number | null
    services: RawService[] | null
  }

  const relName = (rel: NameRel, fallback: string): string =>
    (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? fallback

  // Normalise into the planner shape: each site carries its services so routing
  // can be managed per service (grouped by system). Only CDO-performed services
  // are eligible to be added to a route, so filter to `worker_type === 'cdo'`
  // (still include a service already on a route so it can be removed).
  const sites: PlannerSite[] = ((sitesResult.data || []) as unknown as RawSite[])
    .map((site) => ({
      id: site.id,
      name: site.name,
      route_id: site.route_id,
      route_position: site.route_position,
      services: (site.services || [])
        .filter((svc) => svc.active !== false && (svc.worker_type === 'cdo' || svc.route_id))
        .map((svc) => ({
          id: svc.id,
          route_id: svc.route_id,
          name: relName(svc.service_type, 'Service'),
          system: relName(svc.site_system, 'General'),
        })),
    }))
    // Drop sites with no eligible services so they don't clutter the planner.
    .filter((site) => site.services.length > 0)

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
            Assign sites, systems and CDO-performed services to routes and manage engineer assignments
          </p>
        </div>
        <AddRouteDialog engineers={engineers} />
      </div>

      <RoutesTable routes={routesWithSiteCounts} engineers={engineers} sites={sites} />
    </div>
  )
}

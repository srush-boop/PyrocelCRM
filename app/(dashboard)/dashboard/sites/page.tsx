import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SitesTable } from '@/components/dashboard/sites/sites-table'
import { AddSiteDialog } from '@/components/dashboard/sites/add-site-dialog'
import type { Profile, Site, Route, Client } from '@/lib/types/database'

export default async function SitesPage() {
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

  const [sitesResult, routesResult, clientsResult] = await Promise.all([
    supabase
      .from('sites')
      .select(`
        *,
        route:routes(*),
        client:clients(*)
      `)
      .order('name'),
    supabase.from('routes').select('*').order('name'),
    supabase.from('clients').select('*').order('name'),
  ])

  const sites = (sitesResult.data || []) as (Site & { route: Route | null; client: Client | null })[]
  const routes = (routesResult.data || []) as Route[]
  const clients = (clientsResult.data || []) as Client[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sites</h1>
          <p className="text-muted-foreground">
            Manage client sites and their service schedules
          </p>
        </div>
        <AddSiteDialog routes={routes} clients={clients} />
      </div>

      <SitesTable sites={sites} routes={routes} clients={clients} />
    </div>
  )
}

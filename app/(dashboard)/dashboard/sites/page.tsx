import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SitesTable } from '@/components/dashboard/sites/sites-table'
import { AddSiteDialog } from '@/components/dashboard/sites/add-site-dialog'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import type {
  Profile,
  Site,
  Route,
  Client,
  Branch,
  PropertyType,
  SystemType,
  ServiceType,
  ChargeTemplate,
} from '@/lib/types/database'

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
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

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)

  let sitesQuery = supabase
    .from('sites')
    .select(`
      *,
      route:routes(*),
      client:clients(*),
      branch:branches(*)
    `)
    .order('name')

  if (scope.activeBranchId) {
    sitesQuery = sitesQuery.eq('branch_id', scope.activeBranchId)
  }

  const [
    sitesResult,
    routesResult,
    clientsResult,
    propertyTypesResult,
    systemTypesResult,
    serviceTypesResult,
    chargeTemplatesResult,
  ] = await Promise.all([
    sitesQuery,
    supabase.from('routes').select('*').order('name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('property_types').select('*').eq('active', true).order('name'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('service_types').select('*').order('name'),
    supabase.from('charge_templates').select('*').eq('active', true).order('name'),
  ])

  const sites = (sitesResult.data || []) as (Site & {
    route: Route | null
    client: Client | null
    branch: Branch | null
  })[]
  const routes = (routesResult.data || []) as Route[]
  const clients = (clientsResult.data || []) as Client[]
  const propertyTypes = (propertyTypesResult.data || []) as PropertyType[]
  const systemTypes = (systemTypesResult.data || []) as SystemType[]
  const serviceTypes = (serviceTypesResult.data || []) as ServiceType[]
  const chargeTemplates = (chargeTemplatesResult.data || []) as ChargeTemplate[]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sites</h1>
          <p className="text-muted-foreground">
            Manage client sites and their service schedules
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          <AddSiteDialog
            clients={clients}
            branches={scope.branches}
            propertyTypes={propertyTypes}
            systemTypes={systemTypes}
            serviceTypes={serviceTypes}
            chargeTemplates={chargeTemplates}
          />
        </div>
      </div>

      <SitesTable
        sites={sites}
        routes={routes}
        clients={clients}
        branches={scope.branches}
        propertyTypes={propertyTypes}
        systemTypes={systemTypes}
      />
    </div>
  )
}

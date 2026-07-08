import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBranchScope } from '@/lib/branches'
import { getCallsMapData } from './actions'
import { CallsMap } from '@/components/dashboard/schedule/calls-map'
import type { Profile, ServiceType, SystemType, Site } from '@/lib/types/database'

export const metadata = {
  title: 'Calls Map | Pyrocel',
  description:
    'Plot open unbooked calls and engineer activity to dispatch efficiently.',
}

export default async function CallsMapPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)
  const res = await getCallsMapData({ branchId: scope.activeBranchId })

  // Data for the "Book Call" dialog (reactive / emergency calls logged from the map).
  const [serviceTypesRes, systemTypesRes, sitesRes, engineersRes, clientsRes] = await Promise.all([
    supabase.from('service_types').select('*, system_type:system_types(*)').order('name'),
    supabase.from('system_types').select('*').order('name'),
    supabase.from('sites').select('*').order('name'),
    supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
    supabase.from('clients').select('id, name').order('name'),
  ])
  const reactiveServiceTypes = ((serviceTypesRes.data || []) as ServiceType[]).filter(
    (st) => st.is_recurring === false && (st.status || 'live') !== 'dead',
  )
  const systemTypes = (systemTypesRes.data || []) as SystemType[]
  const bookingSites = (sitesRes.data || []) as Site[]
  const engineers = (engineersRes.data || []) as Profile[]
  const clients = (clientsRes.data || []) as { id: string; name: string }[]

  return (
    <CallsMap
      initialData={res.ok && res.data ? res.data : { calls: [], engineers: [], sites: [] }}
      branches={scope.branches}
      activeBranchId={scope.activeBranchId}
      canSwitchBranch={scope.canSwitch}
      loadError={res.ok ? null : res.error ?? 'Failed to load map data'}
      reactiveServiceTypes={reactiveServiceTypes}
      systemTypes={systemTypes}
      bookingSites={bookingSites}
      bookingEngineers={engineers}
      clients={clients}
    />
  )
}

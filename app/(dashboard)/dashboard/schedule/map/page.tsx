import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBranchScope } from '@/lib/branches'
import { geocodePostcodes } from '@/lib/geocode'
import { getCallsMapData } from './actions'
import { CallsMap } from '@/components/dashboard/schedule/calls-map'
import type { Branch, Profile, ServiceType, SystemType, Site } from '@/lib/types/database'

// Pull the trailing UK postcode out of a free-form branch address so we can
// geocode it (branches store only a text address, no coordinates).
function extractPostcode(address: string | null): string | null {
  if (!address) return null
  const match = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)
  return match ? match[1] : null
}

export const metadata = {
  title: 'Calls Map | Pyrocel',
  description:
    'Plot open unbooked calls and engineer activity to dispatch efficiently.',
}

export default async function CallsMapPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; dispatch?: string }>
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

  const { branch, dispatch } = await searchParams
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

  // When a single branch is selected, geocode its address so the map can zoom to
  // a ~20-mile area around it (a helpful default view, no radius drawn).
  let branchCenter: { latitude: number; longitude: number } | null = null
  if (scope.activeBranchId) {
    const activeBranch = (scope.branches as Branch[]).find((b) => b.id === scope.activeBranchId)
    const postcode = extractPostcode(activeBranch?.address ?? null)
    if (postcode) {
      const geo = await geocodePostcodes([postcode])
      branchCenter = geo.values().next().value ?? null
    }
  }

  return (
    <CallsMap
      initialData={res.ok && res.data ? res.data : { calls: [], engineers: [], sites: [] }}
      branches={scope.branches}
      activeBranchId={scope.activeBranchId}
      branchCenter={branchCenter}
      canSwitchBranch={scope.canSwitch}
      loadError={res.ok ? null : res.error ?? 'Failed to load map data'}
      reactiveServiceTypes={reactiveServiceTypes}
      systemTypes={systemTypes}
      bookingSites={bookingSites}
      bookingEngineers={engineers}
      clients={clients}
      autoDispatchTaskId={dispatch ?? null}
    />
  )
}

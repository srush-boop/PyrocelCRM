import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NearbyCalls } from '@/components/dashboard/nearby/nearby-calls'
import { isWorkerTypeVisibleToEngineer } from '@/lib/engineer-visibility'
import type { ServiceType, WorkerType, Discipline } from '@/lib/types/database'

export default async function NearbyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, discipline')
    .eq('id', user.id)
    .single()

  // Nearby calls is an engineer tool, but office/admin may use it too.
  if (!profile || profile.role === 'client') redirect('/dashboard')

  const discipline = (profile as { discipline: Discipline | null }).discipline ?? null

  const { data: serviceTypes } = await supabase
    .from('service_types')
    .select('id, name, default_worker_type')
    .order('name')

  // Only offer service-type filter options the search could actually return for
  // this user. The nearby search hides CDO (route-planned) work from non-CDO
  // engineers and sub-contracted work from everyone, so listing those service
  // types would only ever yield "no calls found". We mirror that exact rule
  // (via default_worker_type) so the dropdown never offers a dead-end filter.
  const visibleServiceTypes = ((serviceTypes || []) as Array<{
    id: string
    name: string
    default_worker_type: WorkerType | null
  }>).filter((st) =>
    isWorkerTypeVisibleToEngineer(st.default_worker_type ?? 'engineer', discipline),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nearby Calls</h1>
        <p className="text-muted-foreground">
          Use your location to find incomplete calls near you and request a transfer.
        </p>
      </div>
      <NearbyCalls serviceTypes={visibleServiceTypes as ServiceType[]} />
    </div>
  )
}

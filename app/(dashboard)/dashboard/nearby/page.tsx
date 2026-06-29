import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NearbyCalls } from '@/components/dashboard/nearby/nearby-calls'
import type { ServiceType } from '@/lib/types/database'

export default async function NearbyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()

  // Nearby calls is an engineer tool, but office/admin may use it too.
  if (!profile || profile.role === 'client') redirect('/dashboard')

  const { data: serviceTypes } = await supabase
    .from('service_types')
    .select('id, name')
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nearby Calls</h1>
        <p className="text-muted-foreground">
          Use your location to find incomplete calls near you and request a transfer.
        </p>
      </div>
      <NearbyCalls serviceTypes={(serviceTypes || []) as ServiceType[]} />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile, EmergencyLight } from '@/lib/types/database'
import { EmergencyLightsIndex } from '@/components/dashboard/emergency-lights/emergency-lights-index'

export default async function EmergencyLightsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const { data } = await supabase
    .from('emergency_lights')
    .select('*, site:sites(id, name)')
    .order('updated_at', { ascending: false })

  const emergencyLights = (data || []) as (EmergencyLight & {
    site: { id: string; name: string } | null
  })[]

  return <EmergencyLightsIndex emergencyLights={emergencyLights} />
}

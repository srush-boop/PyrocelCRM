import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { LoneWorkerMonitor } from '@/components/dashboard/lone-worker/lone-worker-monitor'
import { getMonitorData } from './actions'

export const dynamic = 'force-dynamic'

export default async function LoneWorkerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  const initialData = await getMonitorData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lone Worker Monitoring</h1>
        <p className="text-muted-foreground">
          Live safety status of staff on a lone-worker shift. Warnings and emergencies appear here
          the moment a check-in is missed.
        </p>
      </div>
      <LoneWorkerMonitor initialData={initialData} />
    </div>
  )
}

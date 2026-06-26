import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SystemTypesManager } from '@/components/dashboard/sales/system-types-manager'
import type { Profile, SystemType } from '@/lib/types/database'

export const metadata = { title: 'System Types | Pyrocel' }

export default async function SystemTypesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: systemTypes }, { data: serviceRows }] = await Promise.all([
    supabase.from('system_types').select('*').order('name'),
    supabase.from('service_types').select('system_type_id'),
  ])

  // Count live service types under each system type for the table.
  const serviceCounts: Record<string, number> = {}
  for (const row of (serviceRows ?? []) as { system_type_id: string | null }[]) {
    if (row.system_type_id) {
      serviceCounts[row.system_type_id] = (serviceCounts[row.system_type_id] ?? 0) + 1
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">System Types</h1>
        <p className="text-muted-foreground">
          Top-level systems (e.g. Fire Alarm, CCTV). Service types sit underneath a system type, and
          the code identifies the system in quotes and quote-bank analytics.
        </p>
      </div>
      <SystemTypesManager
        systemTypes={(systemTypes ?? []) as SystemType[]}
        serviceCounts={serviceCounts}
      />
    </div>
  )
}

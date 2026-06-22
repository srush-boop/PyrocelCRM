import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchKpiData } from '@/lib/kpi-data'
import { KpiDashboard } from '@/components/dashboard/kpis/kpi-dashboard'

export const metadata = {
  title: 'Performance KPIs | Pyrocel',
  description: 'Service compliance against regulatory and contractual targets.',
}

export default async function PortalKpisPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // RLS scopes these rows to the signed-in client's own sites, so the KPIs
  // here only ever reflect their own services.
  const { tasks, tolerances } = await fetchKpiData(supabase)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground text-pretty">
          How your services are performing against the regulatory standard and the tighter
          targets we hold ourselves to.
        </p>
      </div>
      <KpiDashboard tasks={tasks} tolerances={tolerances} />
    </div>
  )
}

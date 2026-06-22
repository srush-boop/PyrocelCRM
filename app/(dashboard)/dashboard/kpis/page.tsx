import { createClient } from '@/lib/supabase/server'
import { fetchKpiData } from '@/lib/kpi-data'
import { KpiDashboard } from '@/components/dashboard/kpis/kpi-dashboard'

export const metadata = {
  title: 'Performance KPIs | Pyrocel',
  description: 'Regulatory and client compliance performance across all services.',
}

export default async function KpisPage() {
  const supabase = await createClient()
  const { tasks, tolerances } = await fetchKpiData(supabase)

  // Distinct clients present in the data, for the filter.
  const clientMap = new Map<string, string>()
  for (const t of tasks) {
    if (t.clientId && t.clientName) clientMap.set(t.clientId, t.clientName)
  }
  const clients = Array.from(clientMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance KPIs</h1>
        <p className="text-muted-foreground">
          Compliance against regulatory and client tolerances across all services.
        </p>
      </div>
      <KpiDashboard tasks={tasks} tolerances={tolerances} clients={clients} showClientFilter />
    </div>
  )
}

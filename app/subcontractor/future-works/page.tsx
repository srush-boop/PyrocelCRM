import { Card, CardContent } from '@/components/ui/card'
import { getSubcontractorContext, getFutureWorks } from '@/lib/subcontractor/portal-data'
import { PortalCallCard } from '@/components/subcontractor/portal-call-card'
import type { PortalCall } from '@/lib/subcontractor/portal-data'

// Group future calls by calendar month for an at-a-glance planning view.
function groupByMonth(calls: PortalCall[]): { key: string; label: string; calls: PortalCall[] }[] {
  const groups = new Map<string, { label: string; calls: PortalCall[] }>()
  for (const call of calls) {
    if (!call.scheduledDate) continue
    const d = new Date(call.scheduledDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (!groups.has(key)) groups.set(key, { label, calls: [] })
    groups.get(key)!.calls.push(call)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, g]) => ({ key, label: g.label, calls: g.calls }))
}

export default async function FutureWorksPage() {
  const ctx = await getSubcontractorContext()
  const calls = await getFutureWorks(ctx)
  const months = groupByMonth(calls)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Future works</h1>
        <p className="text-muted-foreground">
          Upcoming calls for services allocated to your company, grouped by month.
        </p>
      </div>

      {months.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            There are no upcoming works scheduled.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {months.map((month) => (
            <section key={month.key} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {month.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {month.calls.length}
                </span>
              </h2>
              <div className="grid gap-3">
                {month.calls.map((call) => (
                  <PortalCallCard key={call.id} call={call} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

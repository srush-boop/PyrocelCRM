import { redirect } from 'next/navigation'
import { requireLabourCostViewer } from '@/lib/auth/labour-costs'
import { getLabourDashboard } from '@/lib/billing/labour-dashboard-data'
import { LabourCostsView } from '@/components/dashboard/labour-costs/labour-costs-view'

export const dynamic = 'force-dynamic'

/** Default look-back window (days) when no date range is supplied. */
const DEFAULT_WINDOW_DAYS = 90

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Labour-cost dashboard: profitability of completed calls (labour cost vs.
// resolved revenue) with cross-cutting breakdowns and productive-time analysis.
// Hard-gated: only the owner and explicitly-granted users may load it at all —
// cost data never reaches anyone else.
export default async function LabourCostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    engineer?: string
    service?: string
    department?: string
    role?: string
    branch?: string
    client?: string
    site?: string
    from?: string
    to?: string
  }>
}) {
  const access = await requireLabourCostViewer()
  if (!access) redirect('/dashboard')

  const sp = await searchParams

  const today = new Date()
  const defaultFrom = new Date(today)
  defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_WINDOW_DAYS)

  const from = sp.from || isoDate(defaultFrom)
  const to = sp.to || isoDate(today)

  const filters = {
    engineerId: sp.engineer || null,
    serviceTypeId: sp.service || null,
    departmentId: sp.department || null,
    roleId: sp.role || null,
    branchId: sp.branch || null,
    clientId: sp.client || null,
    siteId: sp.site || null,
    from,
    to,
  }

  const data = await getLabourDashboard(filters)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Labour costs</h1>
        <p className="text-muted-foreground">
          Profitability of completed calls — labour cost against resolved revenue — with breakdowns
          by engineer, service, department, branch and role. Figures are ex-VAT and confidential.
        </p>
      </div>

      <LabourCostsView data={data} filters={filters} />
    </div>
  )
}

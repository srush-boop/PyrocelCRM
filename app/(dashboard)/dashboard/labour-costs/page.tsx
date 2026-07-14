import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Calculator } from 'lucide-react'
import { requireLabourCostViewer } from '@/lib/auth/labour-costs'
import { requireQueryToolsUser } from '@/lib/auth/query-tools'
import { getLabourDashboard } from '@/lib/billing/labour-dashboard-data'
import { LabourCostsView } from '@/components/dashboard/labour-costs/labour-costs-view'
import { Button } from '@/components/ui/button'

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

  // A labour-cost viewer may or may not also have query-tools access; only show
  // the calculator link to those who do.
  const canUseCalculator = await requireQueryToolsUser()

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Labour costs</h1>
          <p className="text-muted-foreground">
            Profitability of completed calls — labour cost against resolved revenue — with
            breakdowns by engineer, service, department, branch and role. Figures are ex-VAT and
            confidential.
          </p>
        </div>
        {canUseCalculator && (
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/dashboard/labour-costs/user-cost-calculator">
              <Calculator className="mr-2 h-4 w-4" />
              User cost calculator
            </Link>
          </Button>
        )}
      </div>

      <LabourCostsView data={data} filters={filters} />
    </div>
  )
}

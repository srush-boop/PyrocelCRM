import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireQueryToolsUser } from '@/lib/auth/query-tools'
import { UserCostCalculatorView } from '@/components/dashboard/labour-costs/user-cost-calculator-view'

export const dynamic = 'force-dynamic'

// User Cost Calculator: upload actual per-person costs for a date range, derive
// each user's hourly cost from their configured working days/hours, and write
// the result to their `cost_per_hour_pence`. Owner + granted users only.
export default async function UserCostCalculatorPage() {
  const access = await requireQueryToolsUser()
  if (!access) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/dashboard/labour-costs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to labour costs
        </Link>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">User cost calculator</h1>
          <p className="text-muted-foreground text-pretty">
            Upload a spreadsheet of each person&apos;s actual cost for a date range. We work out
            their hourly cost from the working days and hours configured on their profile, then push
            it into their cost/hour field.
          </p>
        </div>
      </div>

      <UserCostCalculatorView />
    </div>
  )
}

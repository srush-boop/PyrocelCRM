import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { PlanningTool } from '@/components/dashboard/schedule/planning-tool'
import { getBranchScope } from '@/lib/branches'
import { forecastCalls } from '@/lib/forecast'
import { toDateString } from '@/lib/scheduling'
import type { Profile } from '@/lib/types/database'

export default async function SchedulePlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/auth/login')

  const role = (profile as Profile).role
  // Planning is an office/admin forward-planning tool.
  if (role !== 'admin' && role !== 'office') redirect('/dashboard/schedule')

  const { from, to, branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)

  // Default range: today through the next 12 months.
  const today = new Date()
  const defaultFrom = toDateString(today)
  const defaultTo = toDateString(
    new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
  )
  const fromStr = from || defaultFrom
  const toStr = to || defaultTo

  const rows = await forecastCalls(fromStr, toStr, { branchId: scope.activeBranchId })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
            <Link href="/dashboard/schedule">
              <ArrowLeft className="h-4 w-4" />
              Back to Calls
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Call Planning</h1>
          <p className="text-muted-foreground">
            Forecast current and future calls across your services for planning ahead.
          </p>
        </div>
        <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
      </div>

      <PlanningTool rows={rows} from={fromStr} to={toStr} />
    </div>
  )
}

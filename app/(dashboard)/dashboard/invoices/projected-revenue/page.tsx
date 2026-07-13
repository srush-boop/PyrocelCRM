import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import {
  getProjectedRevenue,
  getProjectionFilterOptions,
} from '@/lib/actions/projected-revenue'
import { ProjectedRevenueView } from '@/components/dashboard/invoices/projected-revenue-view'

export const dynamic = 'force-dynamic'

// Projected revenue: the annualised run-rate of every live recurring charge for
// the forthcoming 12 months, broken down by branch and service type. Office/admin.
export default async function ProjectedRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; service?: string }>
}) {
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
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  const sp = await searchParams
  const systemTypeId = sp.system || null
  const serviceTypeId = sp.service || null

  const [data, options] = await Promise.all([
    getProjectedRevenue({ systemTypeId, serviceTypeId }),
    getProjectionFilterOptions(),
  ])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
          <Link href="/dashboard/invoices">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Projected revenue</h1>
        <p className="text-muted-foreground">
          Annualised run-rate of all live recurring charges for the forthcoming 12 months, broken
          down by branch and service type. Figures are ex-VAT and assume each charge runs the full
          year.
        </p>
      </div>

      <ProjectedRevenueView
        data={data}
        options={options}
        systemTypeId={systemTypeId}
        serviceTypeId={serviceTypeId}
      />
    </div>
  )
}

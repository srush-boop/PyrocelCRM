import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { PurchaseOrdersTable } from '@/components/dashboard/purchasing/purchase-orders-table'
import { getBranchScope } from '@/lib/branches'
import { getPurchaseOrders } from '@/lib/jobs/purchasing'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'Purchasing | Pyrocel',
  description: 'Purchase orders raised against jobs, grouped by supplier.',
}

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)
  const orders = await getPurchaseOrders(supabase, { branchId: scope.activeBranchId })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Purchasing</h1>
          <p className="text-muted-foreground">
            Purchase orders raised from jobs, grouped by supplier. Generate draft orders from a
            job&apos;s quoted parts, then send and receive them here.
          </p>
        </div>
        <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
      </div>

      <PurchaseOrdersTable orders={orders} />
    </div>
  )
}

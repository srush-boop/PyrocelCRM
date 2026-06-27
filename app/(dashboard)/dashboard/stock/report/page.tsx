import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStockMovements } from '@/lib/stock'
import { StockReport } from '@/components/dashboard/stock/stock-report'

export const metadata = {
  title: 'Stock Transfers Report',
}

export default async function StockReportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // The transfers report exposes stock values, so it is restricted to
  // managers. Engineers are redirected away.
  if (!profile || !['admin', 'office'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const movements = await getStockMovements(500)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
          Stock Transfers Report
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Summary of parts transferred, received and used on jobs. Filter by date, part, type or location.
        </p>
      </div>

      <StockReport movements={movements} />
    </div>
  )
}

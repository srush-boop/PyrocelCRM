import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getParts, getStockLocations, getJobOptions } from '@/lib/stock'
import { TransferStockForm } from '@/components/dashboard/stock/transfer-stock-form'

export const metadata = {
  title: 'Transfer Stock',
}

export default async function TransferStockPage({
  searchParams,
}: {
  searchParams: Promise<{ partId?: string; toLocationId?: string }>
}) {
  const { partId, toLocationId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'office', 'engineer'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const [parts, locations, jobs] = await Promise.all([
    getParts(),
    getStockLocations(),
    getJobOptions(),
  ])

  // Engineers default the "from" location to their own vehicle.
  const myVehicle =
    locations.find((l) => l.engineer_id === user.id) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
          Transfer Stock
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Move parts between locations, or book parts out to the job you used them on.
        </p>
      </div>

      <TransferStockForm
        parts={parts.filter((p) => p.is_active)}
        locations={locations}
        jobs={jobs}
        defaultFromLocationId={myVehicle?.id ?? null}
        canReceive={['admin', 'office'].includes(profile.role)}
        initialPartId={partId ?? null}
        initialToLocationId={toLocationId ?? null}
      />
    </div>
  )
}

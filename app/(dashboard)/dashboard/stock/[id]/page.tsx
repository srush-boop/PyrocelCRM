import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Profile, StockItem } from '@/lib/types/database'
import { getLocationWithItems, formatGBP } from '@/lib/stock'
import { LocationStockTable } from '@/components/dashboard/stock/location-stock-table'

export default async function StockLocationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  if (!profile || profile.role === 'client') {
    redirect('/dashboard')
  }
  const isManager = profile.role === 'admin' || profile.role === 'office'

  const { location, items } = await getLocationWithItems(id)
  if (!location) notFound()

  const heldValue = (items as StockItem[]).reduce(
    (sum, i) => sum + i.quantity * (i.part?.unit_cost ?? 0),
    0,
  )
  const lowCount = (items as StockItem[]).filter(
    (i) => i.min_level > 0 && i.quantity <= i.min_level,
  ).length

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/dashboard/stock">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to stock
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{location.name}</h1>
            <p className="text-muted-foreground">
              {location.engineer?.full_name
                ? `Engineer van · ${location.engineer.full_name}`
                : location.kind === 'warehouse'
                  ? 'Warehouse'
                  : 'Stock location'}{' '}
              · Held value {formatGBP(heldValue)}
              {lowCount > 0 ? ` · ${lowCount} low-stock` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/dashboard/stock/transfer?toLocationId=${location.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Transfer In
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <LocationStockTable
        items={items as StockItem[]}
        locationId={location.id}
        canManage={isManager}
      />
    </div>
  )
}

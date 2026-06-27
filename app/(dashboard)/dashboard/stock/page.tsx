import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Boxes, PoundSterling, AlertTriangle, Warehouse, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/types/database'
import {
  getStockLocationSummaries,
  getLowStockAlerts,
  getEngineerLocationIds,
  formatGBP,
} from '@/lib/stock'
import { LowStockAlerts } from '@/components/dashboard/stock/low-stock-alerts'
import { LocationsOverview } from '@/components/dashboard/stock/locations-overview'
import { PartLocator } from '@/components/dashboard/stock/part-locator'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
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

  const { branch } = await searchParams
  const scope = await getBranchScope(profile, branch)

  // Engineers only see low-stock alerts for the locations they own (their van);
  // managers see alerts across every location.
  const alertLocationIds = isManager
    ? undefined
    : await getEngineerLocationIds(profile.id)

  const [locations, lowStock] = await Promise.all([
    getStockLocationSummaries(scope.activeBranchId),
    getLowStockAlerts(alertLocationIds),
  ])

  const totalHeldValue = locations.reduce((sum, l) => sum + l.heldValue, 0)
  const totalQuantity = locations.reduce((sum, l) => sum + l.totalQuantity, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">
            Held stock across every location, with low-level alerts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && (
            <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
          )}
          <Button asChild>
            <Link href="/dashboard/stock/transfer">
              <Plus className="mr-2 h-4 w-4" />
              Transfer / Use Stock
            </Link>
          </Button>
          {isManager && (
            <Button asChild variant="outline">
              <Link href="/dashboard/stock/parts">Manage Parts</Link>
            </Button>
          )}
        </div>
      </div>

      <div
        className={`grid gap-4 sm:grid-cols-2 ${isManager ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
      >
        {isManager && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Held Value
              </CardTitle>
              <PoundSterling className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatGBP(totalHeldValue)}</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Locations
            </CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Items in Stock
            </CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuantity.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className={lowStock.length > 0 ? 'border-destructive/50' : undefined}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Low-stock Alerts
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${lowStock.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-destructive' : ''}`}
            >
              {lowStock.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <PartLocator />

      <LowStockAlerts alerts={lowStock} />

      <LocationsOverview locations={locations} showValue={isManager} />
    </div>
  )
}

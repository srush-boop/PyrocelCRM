import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RouteDetailTabs } from '@/components/dashboard/routes/route-detail-tabs'
import { getRouteMapData, getRouteActuals } from './actions'
import type { Profile } from '@/lib/types/database'

export default async function RouteMapPage({
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

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const [{ data, error }, { data: actuals }] = await Promise.all([
    getRouteMapData(id),
    getRouteActuals(id),
  ])
  if (error === 'Route not found') notFound()
  if (!data) redirect('/dashboard/routes')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/routes" aria-label="Back to routes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">{data.routeName}</h1>
          <p className="text-muted-foreground">
            Route map, visit order, working-hours day plan and completion analytics
          </p>
        </div>
      </div>

      <RouteDetailTabs
        mapData={data}
        actualsData={
          actuals ?? {
            routeId: id,
            weeks: [],
            mode: 'week',
            selectedWeek: null,
            averagedWeeks: 0,
            visits: [],
            summary: {
              visitCount: 0,
              onSiteMinutes: 0,
              gapMinutes: 0,
              dayLengthMinutes: 0,
              firstArrival: null,
              lastDeparture: null,
              plannedOnSiteMinutes: 0,
              outOfOrderCount: 0,
            },
            home: null,
            polyline: [],
            polylineApproximate: true,
          }
        }
      />
    </div>
  )
}

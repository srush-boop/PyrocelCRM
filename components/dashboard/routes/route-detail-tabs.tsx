'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Map as MapIcon, BarChart3 } from 'lucide-react'
import { RouteMapPlanner } from './route-map-planner'
import { RouteCompletionAnalytics } from './route-completion-analytics'
import type { RouteMapData, RouteActualsData } from '@/app/(dashboard)/dashboard/routes/[id]/types'

export function RouteDetailTabs({
  mapData,
  actualsData,
}: {
  mapData: RouteMapData
  actualsData: RouteActualsData
}) {
  return (
    <Tabs defaultValue="plan" className="space-y-6">
      <TabsList>
        <TabsTrigger value="plan" className="gap-2">
          <MapIcon className="h-4 w-4" />
          Plan
        </TabsTrigger>
        <TabsTrigger value="completion" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          Completion
        </TabsTrigger>
      </TabsList>

      <TabsContent value="plan">
        <RouteMapPlanner initialData={mapData} />
      </TabsContent>

      <TabsContent value="completion">
        <RouteCompletionAnalytics
          routeId={mapData.routeId}
          initial={actualsData}
          routeColor={mapData.routeColor}
        />
      </TabsContent>
    </Tabs>
  )
}

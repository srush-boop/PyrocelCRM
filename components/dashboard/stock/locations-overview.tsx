'use client'

import Link from 'next/link'
import { Warehouse, Truck, Package, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { StockLocationSummary, StockLocationKind } from '@/lib/types/database'
import { formatGBP } from '@/lib/utils'

interface LocationsOverviewProps {
  locations: StockLocationSummary[]
}

const kindIcon: Record<StockLocationKind, typeof Warehouse> = {
  warehouse: Warehouse,
  van: Truck,
  other: Package,
}

const kindLabel: Record<StockLocationKind, string> = {
  warehouse: 'Warehouse',
  van: 'Engineer van',
  other: 'Other',
}

export function LocationsOverview({ locations }: LocationsOverviewProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Stock Locations</h2>
      {locations.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No stock locations yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => {
            const Icon = kindIcon[loc.kind]
            return (
              <Link key={loc.id} href={`/dashboard/stock/${loc.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{loc.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{kindLabel[loc.kind]}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Held value</p>
                      <p className="text-xl font-bold">{formatGBP(loc.heldValue)}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {loc.itemCount} {loc.itemCount === 1 ? 'part' : 'parts'} · {loc.totalQuantity} units
                      </span>
                      {loc.lowStockCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {loc.lowStockCount} low
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

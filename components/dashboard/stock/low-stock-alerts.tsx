'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LowStockAlert } from '@/lib/types/database'

interface LowStockAlertsProps {
  alerts: LowStockAlert[]
}

export function LowStockAlerts({ alerts }: LowStockAlertsProps) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            Low-stock Alerts
          </CardTitle>
          <CardDescription>
            All stock profiles are above their minimum levels.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Low-stock Alerts
          <Badge variant="destructive">{alerts.length}</Badge>
        </CardTitle>
        <CardDescription>
          These stock profiles have reached or fallen below their minimum level.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.stock_item_id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {a.part_name}
                {a.sku ? (
                  <span className="ml-2 text-xs text-muted-foreground">{a.sku}</span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                at <Link href={`/dashboard/stock/${a.location_id}`} className="underline">{a.location_name}</Link>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm">
                  <span
                    className={`font-semibold ${a.quantity === 0 ? 'text-destructive' : ''}`}
                  >
                    {a.quantity}
                  </span>
                  <span className="text-muted-foreground"> / min {a.min_level} {a.unit}</span>
                </p>
                <Badge variant={a.quantity === 0 ? 'destructive' : 'secondary'} className="mt-1">
                  {a.quantity === 0 ? 'Out of stock' : 'Low'}
                </Badge>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/dashboard/stock/transfer?partId=${a.part_id}&toLocationId=${a.location_id}`}
                >
                  Restock
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

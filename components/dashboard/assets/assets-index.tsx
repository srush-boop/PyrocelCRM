'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Printer, Package } from 'lucide-react'
import { AssetSummaryCards } from './asset-summary-cards'
import { AssetChecksDueWidget, type ScheduleWithAsset } from './asset-checks-due-widget'
import { AssetRegister } from './asset-register'
import { AssetFormDialog } from './asset-form-dialog'
import { ScanAssetQrButton } from './scan-asset-qr-button'
import { dueStatus, type DueStatus } from '@/lib/assets'
import type { Asset, AssetCategory, Profile } from '@/lib/types/database'

interface AssetsIndexProps {
  assets: Asset[]
  schedules: ScheduleWithAsset[]
  categories: AssetCategory[]
  staff: Pick<Profile, 'id' | 'full_name' | 'email'>[]
  isManager: boolean
}

// Rank due statuses so the "worst" one wins for an asset with several schedules.
const RANK: Record<DueStatus, number> = { overdue: 3, due_soon: 2, ok: 1, none: 0 }

export function AssetsIndex({ assets, schedules, categories, staff, isManager }: AssetsIndexProps) {
  const [addOpen, setAddOpen] = useState(false)

  // Worst due-status per asset, from its active schedules.
  const dueByAsset = useMemo(() => {
    const map: Record<string, DueStatus> = {}
    for (const s of schedules) {
      if (!s.asset) continue
      const st = dueStatus(s.next_due_date)
      const current = map[s.asset.id] ?? 'none'
      if (RANK[st] > RANK[current]) map[s.asset.id] = st
    }
    return map
  }, [schedules])

  const { dueSoonCount, overdueCount } = useMemo(() => {
    let dueSoon = 0
    let overdue = 0
    for (const s of schedules) {
      if (!s.asset || s.asset.status !== 'active') continue
      const st = dueStatus(s.next_due_date)
      if (st === 'overdue') overdue++
      else if (st === 'due_soon') dueSoon++
    }
    return { dueSoonCount: dueSoon, overdueCount: overdue }
  }, [schedules])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'Company asset register, checks, calibration and assignments'
              : 'Assets assigned to you and their checks'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanAssetQrButton />
          {isManager && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/assets/labels">
                  <Printer className="mr-2 h-4 w-4" />
                  Print labels
                </Link>
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add asset
              </Button>
            </>
          )}
        </div>
      </div>

      <AssetSummaryCards assets={assets} dueSoonCount={dueSoonCount} overdueCount={overdueCount} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-5 w-5" />
                Register
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AssetRegister assets={assets} categories={categories} dueByAsset={dueByAsset} />
            </CardContent>
          </Card>
        </div>
        <div>
          <AssetChecksDueWidget schedules={schedules} />
        </div>
      </div>

      {isManager && (
        <AssetFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          categories={categories}
          staff={staff}
        />
      )}
    </div>
  )
}

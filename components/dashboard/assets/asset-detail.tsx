'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Pencil,
  QrCode,
  Wrench,
  CheckCircle2,
  ArrowLeftRight,
  Trash2,
  Plus,
  Package,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import {
  formatCurrency,
  dueStatus,
  DUE_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  CHECK_RESULT_LABELS,
  type DueStatus,
} from '@/lib/assets'
import type { AssetCheckResult } from '@/lib/types/database'

const DUE_BADGE_VARIANT: Record<DueStatus, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  ok: 'secondary',
  due_soon: 'default',
  overdue: 'destructive',
  none: 'outline',
}

const RESULT_BADGE_VARIANT: Record<AssetCheckResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'secondary',
  advisory: 'default',
  fail: 'destructive',
  na: 'outline',
}
import type {
  Asset,
  AssetCheckSchedule,
  AssetCheck,
  AssetAssignment,
  AssetCategory,
  Profile,
} from '@/lib/types/database'
import { AssetQrLabel } from './asset-qr-label'
import { CompleteCheckDialog } from './complete-check-dialog'
import { ScheduleFormDialog } from './schedule-form-dialog'
import { TransferAssetDialog } from './transfer-asset-dialog'
import { DisposeAssetDialog } from './dispose-asset-dialog'
import { AssetFormDialog } from './asset-form-dialog'

interface AssetDetailProps {
  asset: Asset
  schedules: AssetCheckSchedule[]
  checks: AssetCheck[]
  assignments: AssetAssignment[]
  staff: Pick<Profile, 'id' | 'full_name' | 'email'>[]
  categories: AssetCategory[]
  isManager: boolean
  currentUserId: string
}

export function AssetDetail({
  asset,
  schedules,
  checks,
  assignments,
  staff,
  categories,
  isManager,
  currentUserId,
}: AssetDetailProps) {
  const router = useRouter()
  const [showQr, setShowQr] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [disposeOpen, setDisposeOpen] = useState(false)
  const [scheduleEdit, setScheduleEdit] = useState<AssetCheckSchedule | null>(null)
  const [scheduleAddOpen, setScheduleAddOpen] = useState(false)
  const [checkSchedule, setCheckSchedule] = useState<AssetCheckSchedule | null>(null)

  const disposed = asset.status === 'disposed'
  const holderName = asset.holder?.full_name ?? null
  const canCheck = (s: AssetCheckSchedule) =>
    isManager || (s.responsible === 'holder' && asset.assigned_to === currentUserId)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/dashboard/assets"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to assets
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-balance">{asset.name}</h1>
            {disposed && <Badge variant="destructive">Disposed</Badge>}
            {asset.is_test_equipment && <Badge variant="secondary">Test equipment</Badge>}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{asset.urn}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowQr((v) => !v)}>
            <QrCode className="mr-2 h-4 w-4" /> QR code
          </Button>
          {isManager && !disposed && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDisposeOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Dispose
              </Button>
            </>
          )}
        </div>
      </div>

      {showQr && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <AssetQrLabel asset={asset} categoryName={asset.category?.name ?? null} />
            <p className="text-sm text-muted-foreground">
              Scan to open this asset. Print labels from the register.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Detail label="Category" value={asset.category?.name ?? '—'} />
          <Detail label="SAGE 50 reference" value={asset.sage_reference || '—'} mono />
          <Detail label="Value" value={formatCurrency(asset.value)} />
          <Detail
            label="Current holder"
            value={
              holderName ? (
                holderName
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  {asset.storage_location ? `Stored: ${asset.storage_location}` : 'Unassigned'}
                </span>
              )
            }
          />
          <Detail label="Manufacturer" value={asset.manufacturer || '—'} />
          <Detail label="Model" value={asset.model || '—'} />
          <Detail label="Serial number" value={asset.serial_number || '—'} mono />
          <Detail
            label="Purchase date"
            value={asset.purchase_date ? formatDateUK(asset.purchase_date) : '—'}
          />
          {disposed && (
            <>
              <Detail
                label="Disposed"
                value={asset.disposed_at ? formatDateUK(asset.disposed_at) : '—'}
              />
              <Detail label="Disposal reason" value={asset.disposal_reason || '—'} />
            </>
          )}
          {asset.description && (
            <div className="sm:col-span-2">
              <Detail label="Description" value={asset.description} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check schedules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Check schedules</CardTitle>
          {isManager && !disposed && (
            <Button size="sm" variant="outline" onClick={() => setScheduleAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add schedule
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {schedules.length === 0 && (
            <p className="text-sm text-muted-foreground">No recurring checks configured.</p>
          )}
          {schedules.map((s) => {
            const status = dueStatus(s.next_due_date)
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="outline">{CHECK_TYPE_LABELS[s.check_type]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Every {s.interval_months} month{s.interval_months === 1 ? '' : 's'} •{' '}
                    {s.responsible === 'holder' ? 'Done by holder' : 'Done by asset manager'}
                    {s.last_completed_date
                      ? ` • Last: ${formatDateUK(s.last_completed_date)}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={DUE_BADGE_VARIANT[status]}>
                    {s.next_due_date
                      ? `${DUE_STATUS_LABELS[status]}: ${formatDateUK(s.next_due_date)}`
                      : DUE_STATUS_LABELS[status]}
                  </Badge>
                  {!disposed && canCheck(s) && (
                    <Button size="sm" onClick={() => setCheckSchedule(s)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
                    </Button>
                  )}
                  {isManager && !disposed && (
                    <Button size="sm" variant="ghost" onClick={() => setScheduleEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Check history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.length === 0 && (
            <p className="text-sm text-muted-foreground">No checks recorded yet.</p>
          )}
          {checks.map((c) => {
            return (
              <div key={c.id} className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatDateUK(c.check_date)}</span>
                    <Badge variant={RESULT_BADGE_VARIANT[c.result]}>{CHECK_RESULT_LABELS[c.result]}</Badge>
                    {c.is_transfer_inspection && (
                      <Badge variant="outline">Transfer inspection</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.schedule?.name ? `${c.schedule.name} • ` : ''}
                    {c.performer?.full_name ?? 'Unknown'}
                    {c.calibration_due_date
                      ? ` • Calibration due ${formatDateUK(c.calibration_due_date)}`
                      : ''}
                  </p>
                  {c.notes && <p className="text-sm">{c.notes}</p>}
                </div>
                {c.certificate_url && (
                  <a
                    href={c.certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-primary underline"
                  >
                    Certificate
                  </a>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Assignment history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {assignments.length === 0 && (
            <p className="text-sm text-muted-foreground">No assignment history.</p>
          )}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
              <div>
                <p className="text-sm font-medium">
                  {a.holder?.full_name ?? a.storage_location ?? 'Unassigned / storage'}
                </p>
                <p className="text-xs text-muted-foreground">
                  From {formatDateUK(a.assigned_at)}
                  {a.returned_at ? ` to ${formatDateUK(a.returned_at)}` : ' (current)'}
                  {a.assigner?.full_name ? ` • by ${a.assigner.full_name}` : ''}
                </p>
                {a.notes && <p className="text-sm">{a.notes}</p>}
              </div>
              {!a.returned_at && <Badge variant="secondary">Current</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Test-equipment calibration records can be referenced in official documentation (e.g.
        BS 5839-1 commissioning) in a future update.
      </p>

      {/* Dialogs */}
      {checkSchedule && (
        <CompleteCheckDialog
          open={!!checkSchedule}
          onOpenChange={(o) => !o && setCheckSchedule(null)}
          schedule={checkSchedule}
          onDone={() => {
            setCheckSchedule(null)
            router.refresh()
          }}
        />
      )}
      {isManager && (
        <>
          <AssetFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            categories={categories}
            staff={staff}
            asset={asset}
          />
          <ScheduleFormDialog
            open={scheduleAddOpen}
            onOpenChange={setScheduleAddOpen}
            assetId={asset.id}
            onSaved={() => router.refresh()}
          />
          {scheduleEdit && (
            <ScheduleFormDialog
              open={!!scheduleEdit}
              onOpenChange={(o) => !o && setScheduleEdit(null)}
              assetId={asset.id}
              schedule={scheduleEdit}
              onSaved={() => {
                setScheduleEdit(null)
                router.refresh()
              }}
            />
          )}
          <TransferAssetDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            asset={asset}
            staff={staff}
            onDone={() => router.refresh()}
          />
          <DisposeAssetDialog
            open={disposeOpen}
            onOpenChange={setDisposeOpen}
            asset={asset}
            onDone={() => router.refresh()}
          />
        </>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  )
}

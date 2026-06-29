'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeftRight,
  Building2,
  Check,
  X,
  Clock,
  User,
  Loader2,
  MapPin,
} from 'lucide-react'
import { resolveTransfer } from '@/app/(dashboard)/dashboard/nearby/actions'

export interface TransferRow {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  message: string | null
  created_at: string
  requested_by: string
  current_engineer_id: string | null
  resolved_at: string | null
  requester: { id: string; full_name: string | null } | null
  current_engineer: { id: string; full_name: string | null } | null
  task: {
    id: string
    status: string
    scheduled_date: string | null
    site_service: {
      service_type: { name: string } | null
      site: { name: string; postcode: string | null; client: { name: string } | null } | null
    } | null
  } | null
}

const STATUS_VARIANTS: Record<TransferRow['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'default' },
  approved: { label: 'Approved', variant: 'secondary' },
  declined: { label: 'Declined', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

export function TransfersList({
  rows,
  currentUserId,
  canApproveAll,
}: {
  rows: TransferRow[]
  currentUserId: string
  canApproveAll: boolean
}) {
  const [items, setItems] = useState(rows)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function resolve(row: TransferRow, approve: boolean) {
    setPendingId(row.id)
    startTransition(async () => {
      const res = await resolveTransfer({ requestId: row.id, approve })
      setPendingId(null)
      if (!res.ok) {
        toast.error(res.error || 'Failed to update request')
        return
      }
      toast.success(approve ? 'Transfer approved' : 'Transfer declined')
      setItems((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, status: approve ? 'approved' : 'declined' } : r
        )
      )
    })
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No transfer requests yet.
        </CardContent>
      </Card>
    )
  }

  const pending = items.filter((r) => r.status === 'pending')
  const resolved = items.filter((r) => r.status !== 'pending')

  function renderRow(row: TransferRow) {
    const site = row.task?.site_service?.site
    const canAct =
      row.status === 'pending' && (canApproveAll || row.current_engineer_id === currentUserId)
    const statusInfo = STATUS_VARIANTS[row.status]
    return (
      <Card key={row.id}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{site?.name || 'Unknown site'}</span>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              {row.task?.site_service?.service_type?.name && (
                <Badge variant="outline">{row.task.site_service.service_type.name}</Badge>
              )}
            </div>
            {site?.client?.name && (
              <p className="text-sm text-muted-foreground">{site.client.name}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {site?.postcode && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {site.postcode}
                </span>
              )}
              <span className="flex items-center gap-1">
                <ArrowLeftRight className="h-3 w-3" />
                Requested by {row.requester?.full_name || 'engineer'}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {row.current_engineer?.full_name
                  ? `Currently: ${row.current_engineer.full_name}`
                  : 'Unassigned'}
              </span>
            </div>
            {row.message && (
              <p className="rounded-md bg-muted px-2 py-1 text-sm">{row.message}</p>
            )}
          </div>
          {canAct && (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolve(row, false)}
                disabled={isPending && pendingId === row.id}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => resolve(row, true)}
                disabled={isPending && pendingId === row.id}
                className="gap-1"
              >
                {isPending && pendingId === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            Pending ({pending.length})
          </h2>
          {pending.map(renderRow)}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">History</h2>
          {resolved.map(renderRow)}
        </div>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { CheckCircle, Search, Coins, Wrench, ExternalLink, Loader2 } from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { setChargeReview } from '@/lib/actions/charge-review'

export interface ChargeableCall {
  id: string
  referenceNumber: string
  completedAt: string | null
  chargeReviewStatus: 'none' | 'pending' | 'reviewed'
  chargeReason: string | null
  chargeReviewedAt: string | null
  siteName: string
  clientName: string
  serviceName: string
  engineerName: string
  reviewerName: string | null
  partsCount: number
  partsTotalPence: number
}

const REASON_LABELS: Record<string, string> = {
  service_default: 'Chargeable service',
  parts_added: 'Parts used',
  manual: 'Manual',
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

export function ChargeableCallsTable({ calls }: { calls: ChargeableCall[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'pending' | 'reviewed' | 'all'>('pending')

  const pendingCount = calls.filter((c) => c.chargeReviewStatus === 'pending').length
  const reviewedCount = calls.filter((c) => c.chargeReviewStatus === 'reviewed').length

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (tab === 'pending' && c.chargeReviewStatus !== 'pending') return false
      if (tab === 'reviewed' && c.chargeReviewStatus !== 'reviewed') return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${c.referenceNumber} ${c.siteName} ${c.clientName} ${c.serviceName} ${c.engineerName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [calls, tab, search])

  const runAction = (id: string, action: { kind: 'reviewed' } | { kind: 'reopen' }) => {
    setBusyId(id)
    startTransition(async () => {
      const { error } = await setChargeReview(id, action)
      setBusyId(null)
      if (error) {
        toast.error(error)
      } else {
        toast.success(action.kind === 'reviewed' ? 'Marked as reviewed' : 'Review re-opened')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Calls for review</CardTitle>
            <CardDescription>
              {filtered.length} {filtered.length === 1 ? 'call' : 'calls'}
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search calls..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="pt-2">
          <TabsList>
            <TabsTrigger value="pending">Awaiting review ({pendingCount})</TabsTrigger>
            <TabsTrigger value="reviewed">Reviewed ({reviewedCount})</TabsTrigger>
            <TabsTrigger value="all">All ({calls.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Coins className="h-8 w-8" />
            <p className="text-sm">No chargeable calls {tab === 'pending' ? 'awaiting review' : 'to show'}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Site / Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Parts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const rowBusy = busyId === c.id && isPending
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/tasks/${c.id}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {c.referenceNumber}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{c.siteName}</div>
                        {c.clientName && (
                          <div className="text-xs text-muted-foreground">{c.clientName}</div>
                        )}
                      </TableCell>
                      <TableCell>{c.serviceName}</TableCell>
                      <TableCell>{c.completedAt ? formatDateUK(c.completedAt) : '-'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          {c.chargeReason === 'parts_added' ? (
                            <Wrench className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <Coins className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          {c.chargeReason ? REASON_LABELS[c.chargeReason] ?? c.chargeReason : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.partsCount > 0 ? (
                          <span>
                            {c.partsCount}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {formatGBP(c.partsTotalPence)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.chargeReviewStatus === 'reviewed' ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            Awaiting review
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {rowBusy ? (
                          <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                        ) : c.chargeReviewStatus === 'reviewed' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction(c.id, { kind: 'reopen' })}
                          >
                            Re-open
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-2"
                            onClick={() => runAction(c.id, { kind: 'reviewed' })}
                          >
                            <CheckCircle className="h-4 w-4" />
                            Mark reviewed
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

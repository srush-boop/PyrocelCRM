'use client'

import { useState, useTransition } from 'react'
import {
  Package,
  Warehouse,
  Truck,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CalendarClock,
  BookmarkCheck,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { StockLocationKind } from '@/lib/types/database'
import type { UpcomingPartSummary } from '@/lib/stock'
import { reservePartForCalls } from '@/app/(dashboard)/dashboard/nearby/actions'

const kindIcon: Record<StockLocationKind, typeof Warehouse> = {
  warehouse: Warehouse,
  van: Truck,
  other: Package,
}

function fmtDate(d: string | null): string {
  if (!d) return 'Unscheduled'
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? d : format(parsed, 'EEE d MMM')
}

export function UpcomingPartsCard({ parts }: { parts: UpcomingPartSummary[] }) {
  // Which part row is expanded to show its reserve form.
  const [expanded, setExpanded] = useState<string | null>(null)
  // partId -> chosen location id.
  const [locationChoice, setLocationChoice] = useState<Record<string, string>>({})
  // partId -> chosen quantity (as string for the Select).
  const [qtyChoice, setQtyChoice] = useState<Record<string, string>>({})
  // partIds already reserved this session.
  const [reserved, setReserved] = useState<Set<string>>(new Set())
  const [pending, startReserve] = useTransition()

  function toggle(partId: string, defaultQty: number, firstLocation?: string) {
    setExpanded((prev) => {
      const next = prev === partId ? null : partId
      if (next) {
        setQtyChoice((q) => ({ ...q, [partId]: q[partId] ?? String(defaultQty) }))
        if (firstLocation) {
          setLocationChoice((l) => ({ ...l, [partId]: l[partId] ?? firstLocation }))
        }
      }
      return next
    })
  }

  function reserve(part: UpcomingPartSummary) {
    const locationId = locationChoice[part.part_id]
    if (!locationId) {
      toast.error('Choose a stock location to reserve from')
      return
    }
    const quantity = parseInt(qtyChoice[part.part_id] ?? '', 10) || part.totalQuantity
    const callReferences = part.calls
      .map((c) => c.reference)
      .filter((r): r is string => Boolean(r))

    startReserve(async () => {
      const res = await reservePartForCalls({
        partId: part.part_id,
        locationId,
        quantity,
        callReferences,
      })
      if (!res.ok) {
        toast.error(res.error || 'Could not reserve part')
        return
      }
      const loc = part.locations.find((l) => l.location_id === locationId)
      toast.success(
        `Reserved ${quantity} ${part.unit} of ${part.part_name}${
          loc ? ` from ${loc.location_name}` : ''
        }`,
      )
      setReserved((prev) => new Set(prev).add(part.part_id))
      setExpanded(null)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Parts for the next 2 weeks
        </CardTitle>
        <CardDescription>
          Parts required across your upcoming calls. Reserve them from a stock location
          ahead of the visit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {parts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No parts required</p>
            <p className="text-xs text-muted-foreground">
              None of your upcoming calls in the next 2 weeks have parts pre-loaded.
            </p>
          </div>
        )}
        {parts.map((part) => {
          const isOpen = expanded === part.part_id
          const isReserved = reserved.has(part.part_id)
          const hasLocations = part.locations.length > 0
          const firstLoc = part.locations[0]?.location_id
          const maxQty = hasLocations
            ? Math.max(...part.locations.map((l) => l.quantity))
            : part.totalQuantity
          const qtyCap = Math.max(part.totalQuantity, maxQty, 1)

          return (
            <div key={part.part_id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {part.part_name}
                    {part.sku ? (
                      <span className="ml-2 text-xs text-muted-foreground">{part.sku}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Need{' '}
                    <span className="font-medium text-foreground">
                      {part.totalQuantity} {part.unit}
                    </span>{' '}
                    across {part.calls.length} call{part.calls.length === 1 ? '' : 's'}
                  </p>
                </div>
                {isReserved ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-green-500/40 text-green-700 dark:text-green-400"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Reserved
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1"
                    onClick={() => toggle(part.part_id, part.totalQuantity, firstLoc)}
                    disabled={!hasLocations || pending}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {isOpen ? 'Cancel' : 'Reserve'}
                  </Button>
                )}
              </div>

              {/* Calls that need this part */}
              <ul className="mt-2 space-y-1">
                {part.calls.map((call) => (
                  <li
                    key={call.taskId}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    <span className="tabular-nums">{fmtDate(call.scheduledDate)}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{call.siteName}</span>
                    {call.reference && (
                      <Badge variant="secondary" className="ml-auto shrink-0 font-mono text-[10px]">
                        {call.reference}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>

              {!hasLocations && !isReserved && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Not currently held at any stock location.
                </p>
              )}

              {/* Reserve form */}
              {isOpen && hasLocations && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`loc-${part.part_id}`} className="text-xs">
                        Stock location
                      </Label>
                      <Select
                        value={locationChoice[part.part_id] ?? firstLoc}
                        onValueChange={(v) =>
                          setLocationChoice((l) => ({ ...l, [part.part_id]: v }))
                        }
                      >
                        <SelectTrigger id={`loc-${part.part_id}`} className="h-9">
                          <SelectValue placeholder="Choose location" />
                        </SelectTrigger>
                        <SelectContent>
                          {part.locations.map((loc) => {
                            const Icon = kindIcon[loc.kind]
                            return (
                              <SelectItem key={loc.location_id} value={loc.location_id}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  {loc.location_name}
                                  {loc.engineer_name ? ` (${loc.engineer_name})` : ''} —{' '}
                                  {loc.quantity} {part.unit}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`qty-${part.part_id}`} className="text-xs">
                        Quantity
                      </Label>
                      <Select
                        value={qtyChoice[part.part_id] ?? String(part.totalQuantity)}
                        onValueChange={(v) =>
                          setQtyChoice((q) => ({ ...q, [part.part_id]: v }))
                        }
                      >
                        <SelectTrigger id={`qty-${part.part_id}`} className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: Math.min(qtyCap, 20) }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => reserve(part)}
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BookmarkCheck className="h-4 w-4" />
                    )}
                    Reserve stock
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

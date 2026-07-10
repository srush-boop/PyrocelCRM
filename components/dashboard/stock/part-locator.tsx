'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Search,
  Loader2,
  MapPin,
  Warehouse,
  Truck,
  Package,
  Navigation,
  Signal,
  Home,
  SendHorizontal,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { StockLocationKind } from '@/lib/types/database'
import { findPartLocations } from '@/app/(dashboard)/dashboard/stock/actions'
import { requestPart } from '@/app/(dashboard)/dashboard/nearby/actions'
import type { PartLocationResult } from '@/lib/stock'

// Haversine distance (miles) — mirrors the server-side version in lib/geocode.ts
// but kept client-side so we can compute without a round-trip.
function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const kindIcon: Record<StockLocationKind, typeof Warehouse> = {
  warehouse: Warehouse,
  van: Truck,
  other: Package,
}

type LocationEntry = PartLocationResult['locations'][number]

interface RequestState {
  partId: string
  locationId: string
  submitted: boolean
}

interface PartLocatorProps {
  /** Engineer's active GPS coordinates (from the Nearby page location button). */
  currentLat?: number | null
  currentLng?: number | null
  /** Site postcode coordinates — used as fallback when GPS is not active. */
  siteLat?: number | null
  siteLng?: number | null
  /** Whether the current user is allowed to request parts (false for office-only views). */
  canRequest?: boolean
}

export function PartLocator({
  currentLat,
  currentLng,
  siteLat,
  siteLng,
  canRequest = true,
}: PartLocatorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PartLocationResult[]>([])
  const [searched, setSearched] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Which location card is expanded to show the request form.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  // Track submitted requests by partId+locationId key.
  const [requestedKeys, setRequestedKeys] = useState<Set<string>>(new Set())
  const [requesting, startRequestTransition] = useTransition()
  const [reqQty, setReqQty] = useState('1')
  const [reqMessage, setReqMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Determine the reference point we will measure distances from.
  // Priority: active GPS > site postcode coords > nothing.
  const refLat = currentLat ?? siteLat ?? null
  const refLng = currentLng ?? siteLng ?? null
  const refSource: 'gps' | 'site' | null =
    currentLat != null ? 'gps' : siteLat != null ? 'site' : null

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const data = await findPartLocations(q)
        setResults(data)
        setSearched(true)
      })
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key))
    setReqQty('1')
    setReqMessage('')
  }

  function submitRequest(part: PartLocationResult, loc: LocationEntry) {
    const key = `${part.part_id}:${loc.location_id}`
    startRequestTransition(async () => {
      const res = await requestPart({
        partId: part.part_id,
        locationId: loc.location_id,
        quantity: parseInt(reqQty, 10) || 1,
        message: reqMessage.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error || 'Failed to send request')
        return
      }
      toast.success(`Request sent for ${part.part_name} from ${loc.location_name}`)
      setRequestedKeys((prev) => new Set(prev).add(key))
      setExpandedKey(null)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          Find a Part
        </CardTitle>
        <CardDescription>
          Search by part name or SKU to see which locations hold it, how far away they are, and
          request a part directly from an engineer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reference-point indicator */}
        {refSource && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {refSource === 'gps' ? (
              <>
                <Signal className="h-3.5 w-3.5 shrink-0 text-green-600" />
                <span>Distances measured from your active GPS location</span>
              </>
            ) : (
              <>
                <Home className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span>Distances measured from the current site postcode</span>
              </>
            )}
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search parts by name or SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Search parts"
          />
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {searched && results.length === 0 && !isPending && (
          <p className="text-sm text-muted-foreground">
            No parts match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((part) => (
              <div key={part.part_id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {part.part_name}
                      {part.sku ? (
                        <span className="ml-2 text-xs text-muted-foreground">{part.sku}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {part.totalQuantity} {part.unit} across{' '}
                      {part.locations.length}{' '}
                      {part.locations.length === 1 ? 'location' : 'locations'}
                    </p>
                  </div>
                </div>

                {part.locations.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Not currently held at any location.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {part.locations.map((loc) => {
                      const Icon = kindIcon[loc.kind]
                      const key = `${part.part_id}:${loc.location_id}`
                      const isExpanded = expandedKey === key
                      const isRequested = requestedKeys.has(key)

                      // Compute distance from our reference point to the location.
                      let distanceMi: number | null = null
                      if (refLat != null && refLng != null && loc.lat != null && loc.lng != null) {
                        distanceMi =
                          Math.round(haversineMiles(refLat, refLng, loc.lat, loc.lng) * 10) / 10
                      }

                      return (
                        <div
                          key={loc.location_id}
                          className={cn(
                            'rounded-md border border-border transition-colors',
                            isExpanded && 'border-primary/40 bg-accent/30',
                          )}
                        >
                          {/* Location summary row */}
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {loc.location_name}
                            </span>
                            {/* Quantity */}
                            <Badge variant="secondary" className="tabular-nums">
                              {loc.quantity} {part.unit}
                            </Badge>

                            {/* Distance badge — differentiated by source */}
                            {distanceMi != null ? (
                              loc.is_live_gps ? (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                  title="Distance based on engineer's live GPS location"
                                >
                                  <Signal className="h-3 w-3" />
                                  {distanceMi} mi
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-blue-400/50 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                                  title="Distance based on engineer's home postcode — approximate"
                                >
                                  <Home className="h-3 w-3" />
                                  ~{distanceMi} mi
                                </Badge>
                              )
                            ) : refLat != null ? (
                              // We have a ref point but this location has no coordinates.
                              <Badge
                                variant="outline"
                                className="border-border text-muted-foreground"
                                title="No location data for this stock location"
                              >
                                <MapPin className="mr-1 h-3 w-3" />
                                ?
                              </Badge>
                            ) : null}

                            {/* Request / requested button */}
                            {canRequest && loc.engineer_id && (
                              isRequested ? (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-green-500/40 text-green-700 dark:text-green-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Requested
                                </Badge>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs"
                                  onClick={() => toggleExpand(key)}
                                  disabled={requesting}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                  {isExpanded ? 'Cancel' : 'Request'}
                                </Button>
                              )
                            )}
                          </div>

                          {/* Owner attribution */}
                          {loc.engineer_name && (
                            <p className="px-3 pb-1 text-xs text-muted-foreground">
                              {loc.kind === 'van' ? 'Van — ' : ''}
                              {loc.engineer_name}
                              {loc.is_live_gps && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-green-600 dark:text-green-400">
                                  <Signal className="h-3 w-3" />
                                  Live GPS
                                </span>
                              )}
                            </p>
                          )}

                          {/* Inline request form */}
                          {isExpanded && (
                            <div className="border-t border-border px-3 pb-3 pt-2">
                              <p className="mb-2 text-xs text-muted-foreground">
                                Request from{' '}
                                <span className="font-medium text-foreground">
                                  {loc.engineer_name ?? loc.location_name}
                                </span>
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor={`qty-${key}`} className="text-xs">
                                    Quantity
                                  </Label>
                                  <Select value={reqQty} onValueChange={setReqQty}>
                                    <SelectTrigger id={`qty-${key}`} className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: Math.min(loc.quantity, 10) }, (_, i) => (
                                        <SelectItem key={i + 1} value={String(i + 1)}>
                                          {i + 1}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="mt-2 space-y-1">
                                <Label htmlFor={`msg-${key}`} className="text-xs">
                                  Message (optional)
                                </Label>
                                <Textarea
                                  id={`msg-${key}`}
                                  placeholder="e.g. I'm on site 5 mins away — can you meet me?"
                                  value={reqMessage}
                                  onChange={(e) => setReqMessage(e.target.value)}
                                  rows={2}
                                  className="resize-none text-xs"
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="mt-2 h-9 w-full gap-2"
                                onClick={() => submitRequest(part, loc)}
                                disabled={requesting}
                              >
                                {requesting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <SendHorizontal className="h-3.5 w-3.5" />
                                )}
                                Send request to {loc.engineer_name?.split(' ')[0] ?? 'engineer'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Prompt to activate location when no reference point is available */}
        {!refSource && searched && results.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Navigation className="h-3.5 w-3.5 shrink-0" />
            Activate your location above to see distances to each stock location.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, Loader2, MapPin, Warehouse, Truck, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { StockLocationKind } from '@/lib/types/database'
import { findPartLocations } from '@/app/(dashboard)/dashboard/stock/actions'
import type { PartLocationResult } from '@/lib/stock'

const kindIcon: Record<StockLocationKind, typeof Warehouse> = {
  warehouse: Warehouse,
  van: Truck,
  other: Package,
}

export function PartLocator() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PartLocationResult[]>([])
  const [searched, setSearched] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          Find a Part
        </CardTitle>
        <CardDescription>
          Search by part name or SKU to see which locations hold it and how many.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                      {part.totalQuantity} {part.unit} in stock across{' '}
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    {part.locations.map((loc) => {
                      const Icon = kindIcon[loc.kind]
                      return (
                        <Link
                          key={loc.location_id}
                          href={`/dashboard/stock/${loc.location_id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm transition-colors hover:bg-accent"
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{loc.location_name}</span>
                          <Badge variant="secondary" className="tabular-nums">
                            {loc.quantity}
                          </Badge>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

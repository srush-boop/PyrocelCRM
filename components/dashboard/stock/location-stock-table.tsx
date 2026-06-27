'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Boxes, Search, Check } from 'lucide-react'
import type { StockItem } from '@/lib/types/database'
import { formatGBP } from '@/lib/utils'

interface LocationStockTableProps {
  items: StockItem[]
  locationId: string
  canManage: boolean
}

export function LocationStockTable({ items, canManage }: LocationStockTableProps) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filtered = items.filter((i) => {
    const q = search.toLowerCase()
    return (
      i.part?.name.toLowerCase().includes(q) ||
      i.part?.sku?.toLowerCase().includes(q)
    )
  })

  const saveMinLevel = async (item: StockItem) => {
    const raw = editing[item.id]
    if (raw === undefined) return
    const value = Math.max(0, Number.parseInt(raw, 10) || 0)
    setSavingId(item.id)
    await supabase.from('stock_items').update({ min_level: value }).eq('id', item.id)
    setSavingId(null)
    setEditing((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search parts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="hidden sm:table-cell">SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Min level</TableHead>
              <TableHead className="hidden text-right md:table-cell">Unit cost</TableHead>
              <TableHead className="text-right">Held value</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Boxes className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No stock held here yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const unitCost = item.part?.unit_cost ?? 0
                const low = item.min_level > 0 && item.quantity <= item.min_level
                const editValue = editing[item.id]
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.part?.name ?? 'Unknown'}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({item.part?.unit ?? 'each'})
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {item.part?.sku ?? '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={editValue ?? String(item.min_level)}
                            onChange={(e) =>
                              setEditing((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="h-8 w-16 text-right"
                          />
                          {editValue !== undefined && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={savingId === item.id}
                              onClick={() => saveMinLevel(item)}
                              aria-label="Save minimum level"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="tabular-nums">{item.min_level}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatGBP(unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatGBP(item.quantity * unitCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity === 0 ? (
                        <Badge variant="destructive">Out</Badge>
                      ) : low ? (
                        <Badge variant="secondary">Low</Badge>
                      ) : (
                        <Badge variant="outline">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

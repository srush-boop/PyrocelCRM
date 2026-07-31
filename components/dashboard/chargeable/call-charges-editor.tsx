'use client'

import { useEffect, useState, useTransition } from 'react'
import { Coins, Plus, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { CallCharge } from '@/lib/types/database'
import {
  getCallCharges,
  upsertCallCharge,
  deleteCallCharge,
} from '@/lib/actions/call-charges'

interface CallChargesEditorProps {
  taskId: string
  /** Only office/admin may manage charges; engineers/clients see a read-only list. */
  canEdit?: boolean
  /** Called after any change so a parent (e.g. review dialog) can refresh totals. */
  onChanged?: () => void
}

/** Format integer pence as GBP. */
function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

/** Parse a pounds string ("12.50") into integer pence, or null when invalid. */
function poundsToPence(value: string): number | null {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/**
 * Editor for ad-hoc chargeable lines (extra labour, sundries) added to a call at
 * the chargeable review stage. Lines flow into the generated invoice alongside
 * parts + auto-labour. Office/admin only; RLS is the real backstop.
 */
export function CallChargesEditor({ taskId, canEdit = false, onChanged }: CallChargesEditorProps) {
  const [charges, setCharges] = useState<CallCharge[]>([])
  const [loading, setLoading] = useState(true)
  const [, startSave] = useTransition()

  // Add-form state.
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [kind, setKind] = useState<'labour' | 'other'>('other')

  useEffect(() => {
    let active = true
    getCallCharges(taskId).then((data) => {
      if (active) {
        setCharges(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [taskId])

  const total = charges.reduce((sum, c) => sum + c.unit_price_pence * c.quantity, 0)

  function reload() {
    getCallCharges(taskId).then(setCharges)
    onChanged?.()
  }

  function addCharge() {
    const desc = description.trim()
    const qty = Number.parseFloat(quantity)
    const pence = poundsToPence(price)
    if (!desc) {
      toast.error('Enter a description')
      return
    }
    if (pence == null) {
      toast.error('Enter a valid price')
      return
    }
    startSave(async () => {
      const { error } = await upsertCallCharge({
        taskId,
        description: desc,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unitPricePence: pence,
        kind,
      })
      if (error) {
        toast.error(error)
        return
      }
      setDescription('')
      setQuantity('1')
      setPrice('')
      setKind('other')
      reload()
    })
  }

  function removeCharge(id: string) {
    // Optimistic removal.
    setCharges((prev) => prev.filter((c) => c.id !== id))
    startSave(async () => {
      const { error } = await deleteCallCharge(id, taskId)
      if (error) {
        toast.error(error)
        reload()
        return
      }
      onChanged?.()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-amber-600" />
          Additional charges
        </CardTitle>
        <CardDescription>
          Extra labour or sundries to invoice on top of any parts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional charges added.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.kind === 'labour' ? 'Labour' : 'Other'} · {c.quantity} ×{' '}
                    {formatPence(c.unit_price_pence)}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatPence(c.unit_price_pence * c.quantity)}
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCharge(c.id)}
                    aria-label={`Remove ${c.description}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!loading && charges.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Charges total</span>
            <span className="font-semibold tabular-nums">{formatPence(total)}</span>
          </div>
        )}

        {canEdit && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="charge-desc" className="text-xs">
                Description
              </Label>
              <Input
                id="charge-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Additional labour, access equipment hire"
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="charge-kind" className="text-xs">
                  Type
                </Label>
                <Select value={kind} onValueChange={(v) => setKind(v as 'labour' | 'other')}>
                  <SelectTrigger id="charge-kind" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="labour">Labour</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="charge-qty" className="text-xs">
                  Qty
                </Label>
                <Input
                  id="charge-qty"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="charge-price" className="text-xs">
                  Unit price (£)
                </Label>
                <Input
                  id="charge-price"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addCharge()
                    }
                  }}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addCharge}>
              <Plus className="h-3.5 w-3.5" />
              Add charge
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

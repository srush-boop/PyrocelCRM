'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { Part, NominalCode } from '@/lib/types/database'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'

const NONE_VALUE = '__none__'

interface EditPartDialogProps {
  part: Part
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers?: { id: string; name: string }[]
  nominalCodes?: NominalCode[]
}

export function EditPartDialog({ part, open, onOpenChange, suppliers = [], nominalCodes = [] }: EditPartDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: part.name,
    sku: part.sku ?? '',
    unit: part.unit,
    unit_cost: String(part.unit_cost ?? 0),
    default_min_level: String(part.default_min_level ?? 0),
    description: part.description ?? '',
    is_active: part.is_active,
    supplier_id: part.supplier_id ?? '',
    nominal_code_id: part.nominal_code_id ?? null,
  })
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('parts')
      .update({
        name: formData.name,
        sku: formData.sku || null,
        unit: formData.unit || 'each',
        unit_cost: formData.unit_cost ? Number.parseFloat(formData.unit_cost) : 0,
        default_min_level: Math.max(0, Number.parseInt(formData.default_min_level, 10) || 0),
        description: formData.description || null,
        is_active: formData.is_active,
        supplier_id: formData.supplier_id || null,
        nominal_code_id: formData.nominal_code_id,
      })
      .eq('id', part.id)

    setLoading(false)

    if (!error) {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>
              Update the catalogue details for this part.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit_name">Part name *</Label>
              <Input
                id="edit_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit_sku">SKU / Code</Label>
                <Input
                  id="edit_sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_unit">Unit</Label>
                <Input
                  id="edit_unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit_unit_cost">Unit cost (£)</Label>
                <Input
                  id="edit_unit_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit_default_min_level">Default min level</Label>
                <Input
                  id="edit_default_min_level"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={formData.default_min_level}
                  onChange={(e) =>
                    setFormData({ ...formData, default_min_level: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_supplier">Product supplier</Label>
              <Select
                value={formData.supplier_id || NONE_VALUE}
                onValueChange={(value) =>
                  setFormData({ ...formData, supplier_id: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger id="edit_supplier">
                  <SelectValue placeholder="No supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The supplier this part is ordered from. Used for future equipment ordering.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_nominal">Nominal code</Label>
              <NominalCodeSelect
                id="edit_nominal"
                value={formData.nominal_code_id}
                onChange={(id) => setFormData({ ...formData, nominal_code_id: id })}
                codes={nominalCodes}
                noneLabel="None"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Overrides the department/service nominal when this part is invoiced.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_description">Description</Label>
              <Textarea
                id="edit_description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="edit_is_active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Inactive parts are hidden from transfer lists.
                </p>
              </div>
              <Switch
                id="edit_is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

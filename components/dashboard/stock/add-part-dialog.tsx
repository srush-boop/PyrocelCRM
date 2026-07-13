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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'
import type { NominalCode } from '@/lib/types/database'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'

const NONE_VALUE = '__none__'

const emptyForm = {
  name: '',
  sku: '',
  unit: 'each',
  unit_cost: '',
  default_min_level: '',
  description: '',
  supplier_id: '',
  nominal_code_id: null as string | null,
}

interface AddPartDialogProps {
  suppliers?: { id: string; name: string }[]
  nominalCodes?: NominalCode[]
}

export function AddPartDialog({ suppliers = [], nominalCodes = [] }: AddPartDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.from('parts').insert({
      name: formData.name,
      sku: formData.sku || null,
      unit: formData.unit || 'each',
      unit_cost: formData.unit_cost ? Number.parseFloat(formData.unit_cost) : 0,
      default_min_level: formData.default_min_level
        ? Math.max(0, Number.parseInt(formData.default_min_level, 10) || 0)
        : 0,
      description: formData.description || null,
      supplier_id: formData.supplier_id || null,
      nominal_code_id: formData.nominal_code_id,
    })

    setLoading(false)

    if (!error) {
      setOpen(false)
      setFormData(emptyForm)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Part
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Part</DialogTitle>
            <DialogDescription>
              Add a part to the catalogue. Unit cost is used to value held stock.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Part name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Smoke detector head"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU / Code</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g., SD-100"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="each"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="unit_cost">Unit cost (£)</Label>
                <Input
                  id="unit_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="default_min_level">Default min level</Label>
                <Input
                  id="default_min_level"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={formData.default_min_level}
                  onChange={(e) =>
                    setFormData({ ...formData, default_min_level: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier">Product supplier</Label>
              <Select
                value={formData.supplier_id || NONE_VALUE}
                onValueChange={(value) =>
                  setFormData({ ...formData, supplier_id: value === NONE_VALUE ? '' : value })
                }
              >
                <SelectTrigger id="supplier">
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
              <Label htmlFor="nominal">Nominal code</Label>
              <NominalCodeSelect
                id="nominal"
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Part'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

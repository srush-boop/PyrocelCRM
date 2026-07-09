'use client'

import type React from 'react'
import { useState } from 'react'
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
import { Loader2, AlertCircle } from 'lucide-react'
import { saveAsset, type AssetInput } from '@/lib/actions/assets'
import type { Asset, AssetCategory, Profile } from '@/lib/types/database'

const UNASSIGNED = '__none__'

interface AssetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: AssetCategory[]
  staff: Pick<Profile, 'id' | 'full_name' | 'email'>[]
  asset?: Asset | null
}

export function AssetFormDialog({ open, onOpenChange, categories, staff, asset }: AssetFormDialogProps) {
  const router = useRouter()
  const editing = Boolean(asset)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(asset?.name ?? '')
  const [sage, setSage] = useState(asset?.sage_reference ?? '')
  const [categoryId, setCategoryId] = useState(asset?.category_id ?? UNASSIGNED)
  const [manufacturer, setManufacturer] = useState(asset?.manufacturer ?? '')
  const [model, setModel] = useState(asset?.model ?? '')
  const [serial, setSerial] = useState(asset?.serial_number ?? '')
  const [value, setValue] = useState(asset?.value != null ? String(asset.value) : '')
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')
  const [assignedTo, setAssignedTo] = useState(asset?.assigned_to ?? UNASSIGNED)
  const [storage, setStorage] = useState(asset?.storage_location ?? '')
  const [isTestEquip, setIsTestEquip] = useState(asset?.is_test_equipment ?? false)
  const [description, setDescription] = useState(asset?.description ?? '')

  // When a category is chosen, default the test-equipment flag from it (create only).
  const onCategoryChange = (val: string) => {
    setCategoryId(val)
    if (!editing) {
      const cat = categories.find((c) => c.id === val)
      if (cat) setIsTestEquip(cat.is_test_equipment)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    const holder = assignedTo === UNASSIGNED ? null : assignedTo
    const input: AssetInput = {
      id: asset?.id,
      name: name.trim(),
      sage_reference: sage || null,
      category_id: categoryId === UNASSIGNED ? null : categoryId,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serial || null,
      description: description || null,
      value: value.trim() ? Number(value) : null,
      purchase_date: purchaseDate || null,
      assigned_to: holder,
      storage_location: holder ? null : storage || null,
      is_test_equipment: isTestEquip,
    }
    const res = await saveAsset(input)
    setSaving(false)
    if (!res.ok) {
      setError(res.error || 'Failed to save asset')
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit asset' : 'Add asset'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update this asset\u2019s details.' : 'Register a new company asset.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset-name">Name *</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Megger MFT1741 Multifunction Tester"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-sage">SAGE 50 reference</Label>
              <Input
                id="asset-sage"
                value={sage}
                onChange={(e) => setSage(e.target.value)}
                placeholder="e.g. FA-00123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-category">Category</Label>
              <Select value={categoryId} onValueChange={onCategoryChange}>
                <SelectTrigger id="asset-category">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Uncategorised</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-manufacturer">Manufacturer</Label>
              <Input
                id="asset-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-model">Model</Label>
              <Input id="asset-model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-serial">Serial number</Label>
              <Input id="asset-serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-value">Value (GBP)</Label>
              <Input
                id="asset-value"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-purchase">Purchase date</Label>
              <Input
                id="asset-purchase"
                type="date"
                value={purchaseDate ?? ''}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-holder">Assigned to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="asset-holder">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned (stored)</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {assignedTo === UNASSIGNED && (
            <div className="space-y-2">
              <Label htmlFor="asset-storage">Storage location</Label>
              <Input
                id="asset-storage"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
                placeholder="e.g. Main store - Rack B3"
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="asset-test-equip" className="text-sm font-medium">
                Test equipment
              </Label>
              <p className="text-xs text-muted-foreground">
                Requires calibration; can be referenced on official reports.
              </p>
            </div>
            <Switch id="asset-test-equip" checked={isTestEquip} onCheckedChange={setIsTestEquip} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-desc">Notes</Label>
            <Textarea
              id="asset-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

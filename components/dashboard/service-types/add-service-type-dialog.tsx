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
import { Plus, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkerType, ToleranceUnit } from '@/lib/types/database'
import { WORKER_TYPE_LABELS } from '@/lib/assignment'
import { ServiceColorPicker } from './service-color-picker'
import { ToleranceFields } from './tolerance-fields'
import { PYROCEL_RED } from '@/lib/service-colors'

export function AddServiceTypeDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    default_frequency_value: 12,
    default_frequency_unit: 'months' as 'weeks' | 'months',
    default_worker_type: 'cdo' as WorkerType,
    defects_to_email: '',
    color: PYROCEL_RED,
    regulatory_tolerance_value: 0,
    regulatory_tolerance_unit: 'months' as ToleranceUnit,
  })
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Calculate months equivalent for backwards compatibility
    const frequencyInMonths = formData.default_frequency_unit === 'weeks' 
      ? Math.ceil(formData.default_frequency_value / 4) 
      : formData.default_frequency_value

    const { error } = await supabase.from('service_types').insert({
      name: formData.name,
      code: formData.code.trim().toUpperCase() || null,
      description: formData.description || null,
      default_frequency_months: frequencyInMonths,
      default_frequency_value: formData.default_frequency_value,
      default_frequency_unit: formData.default_frequency_unit,
      default_worker_type: formData.default_worker_type,
      defects_to_email: formData.defects_to_email.trim() || null,
      color: formData.color,
      regulatory_tolerance_value: formData.regulatory_tolerance_value,
      regulatory_tolerance_unit: formData.regulatory_tolerance_unit,
      // Client tier defaults to the regulatory standard; tighter client KPIs are
      // set per site/service. Keep the legacy default columns in sync as the fallback.
      client_tolerance_value: formData.regulatory_tolerance_value,
      client_tolerance_unit: formData.regulatory_tolerance_unit,
    })

    setLoading(false)

    if (error) {
      console.error('[v0] Error creating service type:', error)
      alert(`Error creating service type: ${error.message}`)
    } else {
      setOpen(false)
      setFormData({
        name: '',
        code: '',
        description: '',
        default_frequency_value: 12,
        default_frequency_unit: 'months',
        default_worker_type: 'cdo',
        defects_to_email: '',
        color: PYROCEL_RED,
        regulatory_tolerance_value: 0,
        regulatory_tolerance_unit: 'months',
      })
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Service Type
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Service Type</DialogTitle>
            <DialogDescription>
              Create a new type of service your company offers
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Fire Alarm Testing"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">System Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. FA, CCTV, AC"
                maxLength={12}
              />
              <p className="text-xs text-muted-foreground">
                Short code used to identify this system in quotes and to query quote-bank values.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the service"
              />
            </div>
            <ServiceColorPicker
              value={formData.color}
              onChange={(color) => setFormData({ ...formData, color })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="frequency-value">Frequency Value *</Label>
                <Input
                  id="frequency-value"
                  type="number"
                  min={1}
                  max={60}
                  value={formData.default_frequency_value}
                  onChange={(e) =>
                    setFormData({ ...formData, default_frequency_value: parseInt(e.target.value) || 12 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="frequency-unit">Unit *</Label>
                <Select value={formData.default_frequency_unit} onValueChange={(value) =>
                  setFormData({ ...formData, default_frequency_unit: value as 'weeks' | 'months' })
                }>
                  <SelectTrigger id="frequency-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ToleranceFields
              value={{
                regulatory_tolerance_value: formData.regulatory_tolerance_value,
                regulatory_tolerance_unit: formData.regulatory_tolerance_unit,
              }}
              onChange={(t) => setFormData({ ...formData, ...t })}
            />
            <div className="grid gap-2">
              <Label htmlFor="default-worker-type">Default delivered by</Label>
              <Select
                value={formData.default_worker_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, default_worker_type: value as WorkerType })
                }
              >
                <SelectTrigger id="default-worker-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['cdo', 'engineer', 'subcontractor'] as WorkerType[]).map((wt) => (
                    <SelectItem key={wt} value={wt}>
                      {WORKER_TYPE_LABELS[wt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Who usually performs this service. Sets the default when added to a site; can be
                overridden per site.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="defects-to-email">Defects to</Label>
              <Input
                id="defects-to-email"
                type="email"
                value={formData.defects_to_email}
                onChange={(e) => setFormData({ ...formData, defects_to_email: e.target.value })}
                placeholder="defects@yourcompany.com"
              />
              <p className="text-xs text-muted-foreground">
                When a report contains defects, this address is CC&apos;d in. Can be overridden per
                site in the service setup.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Service Type'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

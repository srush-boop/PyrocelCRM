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
import { Switch } from '@/components/ui/switch'
import { Plus, Loader2, Repeat, Siren } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkerType, ToleranceUnit, SystemType } from '@/lib/types/database'
import { WORKER_TYPE_LABELS } from '@/lib/assignment'
import { ServiceColorPicker } from './service-color-picker'
import { ToleranceFields } from './tolerance-fields'
import { PYROCEL_RED } from '@/lib/service-colors'

export function AddServiceTypeDialog({ systemTypes }: { systemTypes: SystemType[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    system_type_id: '',
    description: '',
    default_frequency_value: 12,
    default_frequency_unit: 'months' as 'weeks' | 'months',
    default_worker_type: 'cdo' as WorkerType,
    defects_to_email: '',
    color: PYROCEL_RED,
    regulatory_tolerance_value: 0,
    regulatory_tolerance_unit: 'months' as ToleranceUnit,
    // Recurring PPM by default. Turn off to make this a reactive / on-demand
    // "call type" (Reactive, Emergency Callout) logged ad-hoc against a site.
    is_recurring: true,
    is_emergency: false,
    default_kpi_hours: 24,
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
      system_type_id: formData.system_type_id || null,
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
      is_recurring: formData.is_recurring,
      // Emergency + KPI only apply to reactive (non-recurring) call types.
      is_emergency: formData.is_recurring ? false : formData.is_emergency,
      default_kpi_hours: formData.is_recurring ? null : formData.default_kpi_hours,
    })

    setLoading(false)

    if (error) {
      console.error('[v0] Error creating service type:', error)
      alert(`Error creating service type: ${error.message}`)
    } else {
      setOpen(false)
      setFormData({
        name: '',
        system_type_id: '',
        description: '',
        default_frequency_value: 12,
        default_frequency_unit: 'months',
        default_worker_type: 'cdo',
        defects_to_email: '',
        color: PYROCEL_RED,
        regulatory_tolerance_value: 0,
        regulatory_tolerance_unit: 'months',
        is_recurring: true,
        is_emergency: false,
        default_kpi_hours: 24,
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="system-type">System Type</Label>
              <Select
                value={formData.system_type_id}
                onValueChange={(value) => setFormData({ ...formData, system_type_id: value })}
              >
                <SelectTrigger id="system-type">
                  <SelectValue placeholder="Select a system type" />
                </SelectTrigger>
                <SelectContent>
                  {systemTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.code ? `${st.code} — ${st.name}` : st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The system this service belongs to (e.g. Fire Alarm). The queryable code lives on the
                system type.
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
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="is-recurring" className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  Recurring service
                </Label>
                <p className="text-xs text-muted-foreground text-pretty">
                  On = scheduled PPM visits. Off = a reactive / on-demand call type (e.g. Reactive,
                  Emergency Callout) logged ad-hoc against a site, with an attend-within KPI.
                </p>
              </div>
              <Switch
                id="is-recurring"
                checked={formData.is_recurring}
                onCheckedChange={(v) => setFormData({ ...formData, is_recurring: v })}
              />
            </div>
            {formData.is_recurring ? (
              <>
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
              </>
            ) : (
              <div className="grid gap-4 rounded-md border border-dashed p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-emergency" className="flex items-center gap-2">
                      <Siren className="h-4 w-4 text-destructive" />
                      Emergency call type
                    </Label>
                    <p className="text-xs text-muted-foreground text-pretty">
                      Emergency calls show a pulsing marker on the map and send the assigned
                      engineer an urgent notification.
                    </p>
                  </div>
                  <Switch
                    id="is-emergency"
                    checked={formData.is_emergency}
                    onCheckedChange={(v) =>
                      setFormData({
                        ...formData,
                        is_emergency: v,
                        // Sensible KPI default when flipping to emergency.
                        default_kpi_hours: v && formData.default_kpi_hours > 8 ? 4 : formData.default_kpi_hours,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="kpi-hours">Attend within (hours)</Label>
                  <Input
                    id="kpi-hours"
                    type="number"
                    min={1}
                    max={720}
                    value={formData.default_kpi_hours}
                    onChange={(e) =>
                      setFormData({ ...formData, default_kpi_hours: parseInt(e.target.value) || 1 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Default response KPI when logging this call. Editable per call at booking.
                  </p>
                </div>
              </div>
            )}
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

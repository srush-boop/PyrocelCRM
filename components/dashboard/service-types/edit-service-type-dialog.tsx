'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
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
import { Loader2, Siren, Coins, Route } from 'lucide-react'
import type { ServiceType, WorkerType, ToleranceUnit, SystemType, ChecklistTemplate, NominalCode } from '@/lib/types/database'
import { NominalCodeSelect } from '@/components/dashboard/billing/nominal-code-select'
import { WORKER_TYPE_LABELS } from '@/lib/assignment'
import { ServiceColorPicker } from './service-color-picker'
import { ToleranceFields } from './tolerance-fields'
import { ServiceVisitTypesManager } from './service-visit-types-manager'
import { PYROCEL_RED } from '@/lib/service-colors'
import {
  ServiceTypeChecklistsField,
  type ServiceTypeChecklistEntry,
} from './service-type-checklists-field'
import { syncServiceTypeChecklists } from '@/lib/service-type-checklists'
import { CALL_KIND_OPTIONS, callKindFlags } from '@/lib/call-kinds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EditServiceTypeDialogProps {
  serviceType: ServiceType
  systemTypes: SystemType[]
  nominalCodes: NominalCode[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditServiceTypeDialog({ serviceType, systemTypes, nominalCodes, open, onOpenChange }: EditServiceTypeDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: serviceType.name,
    system_type_id: serviceType.system_type_id || '',
    description: serviceType.description || '',
    default_frequency_value: serviceType.default_frequency_value ?? serviceType.default_frequency_months ?? 12,
    default_frequency_unit: (serviceType.default_frequency_unit || 'months') as 'weeks' | 'months',
    default_worker_type: (serviceType.default_worker_type || 'cdo') as WorkerType,
    defects_to_email: serviceType.defects_to_email || '',
    status: (serviceType.status || 'live') as 'live' | 'dead',
    color: serviceType.color || PYROCEL_RED,
    regulatory_tolerance_value: serviceType.regulatory_tolerance_value ?? 0,
    regulatory_tolerance_unit: (serviceType.regulatory_tolerance_unit || 'days') as ToleranceUnit,
    // Legacy rows may be null; default to subject-to-regulatory.
    regulatory_compliance: serviceType.regulatory_compliance !== false,
    // Derive call_kind from the stored value, falling back to the legacy flags
    // for rows created before call_kind existed.
    call_kind: (serviceType.call_kind ??
      (serviceType.is_recurring ? 'recurring' : 'reactive')) as ServiceType['call_kind'],
    is_emergency: serviceType.is_emergency ?? false,
    default_kpi_hours: serviceType.default_kpi_hours ?? 24,
    default_chargeable: serviceType.default_chargeable ?? false,
    route_eligible: serviceType.route_eligible ?? true,
    nominal_code_id: serviceType.nominal_code_id ?? null,
  })
  const router = useRouter()
  const supabase = createClient()

  const isRecurring = formData.call_kind === 'recurring'
  const isReactive = formData.call_kind === 'reactive'

  // Per-system checklists for non-recurring call types. Loaded from existing
  // checklist_templates (visit-type templates excluded) when the dialog opens.
  const [checklists, setChecklists] = useState<ServiceTypeChecklistEntry[]>([])
  const { data: existingChecklists } = useSWR(
    open && !isRecurring ? ['service-type-checklists', serviceType.id] : null,
    async () => {
      const { data } = await supabase
        .from('checklist_templates')
        .select('id, name, system_type_id, items')
        .eq('service_type_id', serviceType.id)
        .is('visit_type_id', null)
      return (data ?? []) as Pick<ChecklistTemplate, 'id' | 'name' | 'system_type_id' | 'items'>[]
    },
  )

  useEffect(() => {
    if (existingChecklists) {
      setChecklists(
        existingChecklists.map((t) => ({
          id: t.id,
          system_type_id: t.system_type_id ?? null,
          name: t.name,
          itemCount: Array.isArray(t.items) ? t.items.length : 0,
        })),
      )
    }
  }, [existingChecklists])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Calculate months equivalent for backwards compatibility
    const frequencyInMonths = formData.default_frequency_unit === 'weeks' 
      ? Math.ceil(formData.default_frequency_value / 4) 
      : formData.default_frequency_value

    const { error } = await supabase
      .from('service_types')
      .update({
        name: formData.name,
        // Only recurring PPM ties to a single prescriptive system. Reactive/
        // planned types are assigned to systems via per-system checklists, so
        // the single system_type_id is cleared for them.
        system_type_id: isRecurring ? formData.system_type_id || null : null,
        description: formData.description || null,
        default_frequency_months: frequencyInMonths,
        default_frequency_value: formData.default_frequency_value,
        default_frequency_unit: formData.default_frequency_unit,
        default_worker_type: formData.default_worker_type,
        defects_to_email: formData.defects_to_email.trim() || null,
        status: formData.status,
        color: formData.color,
        regulatory_tolerance_value: formData.regulatory_tolerance_value,
        regulatory_tolerance_unit: formData.regulatory_tolerance_unit,
        regulatory_compliance: formData.regulatory_compliance,
        // Keep the legacy service-type client default in step with regulatory;
        // tighter client KPIs live per site/service.
        client_tolerance_value: formData.regulatory_tolerance_value,
        client_tolerance_unit: formData.regulatory_tolerance_unit,
        // call_kind is the source of truth; legacy flags kept in sync.
        ...callKindFlags(formData.call_kind, formData.is_emergency),
        default_kpi_hours: isReactive ? formData.default_kpi_hours : null,
        default_chargeable: formData.default_chargeable,
        // Only relevant for CDO delivery; force true otherwise so non-CDO types
        // never carry a misleading "not routed" flag.
        route_eligible:
          formData.default_worker_type === 'cdo' ? formData.route_eligible : true,
        nominal_code_id: formData.nominal_code_id,
      })
      .eq('id', serviceType.id)

    // Sync per-system checklists for non-recurring call types.
    if (!error && !isRecurring) {
      const { error: clError } = await syncServiceTypeChecklists(supabase, serviceType.id, checklists)
      if (clError) {
        setLoading(false)
        console.error('[v0] Error saving call-type checklists:', clError)
        alert(`Service type saved, but updating checklists failed: ${clError}`)
        onOpenChange(false)
        router.refresh()
        return
      }
    }

    setLoading(false)

    if (error) {
      console.error('[v0] Error updating service type:', error)
      alert(`Error updating service type: ${error.message}`)
    } else {
      onOpenChange(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Service Type</DialogTitle>
            <DialogDescription>
              Update service type information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            {/* Call kind is asked first: it decides whether this is a
                prescriptive per-system PPM (one System Type) or a generic
                reactive/planned call (assigned to many systems below). */}
            <div className="grid gap-2">
              <Label htmlFor="call-kind">Call kind *</Label>
              <Select
                value={formData.call_kind}
                onValueChange={(value) =>
                  setFormData({ ...formData, call_kind: value as ServiceType['call_kind'] })
                }
              >
                <SelectTrigger id="call-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALL_KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground text-pretty">
                {CALL_KIND_OPTIONS.find((o) => o.value === formData.call_kind)?.description}
              </p>
            </div>
            {isRecurring ? (
              <>
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
                    Recurring PPM is prescriptive to one system (e.g. Fire Alarm) and uses that
                    system&apos;s checklist. The queryable code lives on the system type.
                  </p>
                </div>
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
                      required
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
                <ServiceVisitTypesManager
                  serviceTypeId={serviceType.id}
                  frequencyValue={formData.default_frequency_value}
                  frequencyUnit={formData.default_frequency_unit}
                />
                <ToleranceFields
                  value={{
                    regulatory_tolerance_value: formData.regulatory_tolerance_value,
                    regulatory_tolerance_unit: formData.regulatory_tolerance_unit,
                    regulatory_compliance: formData.regulatory_compliance,
                  }}
                  onChange={(t) => setFormData({ ...formData, ...t })}
                />
              </>
            ) : (
              <>
                {isReactive && (
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
                <ServiceTypeChecklistsField
                  systemTypes={systemTypes}
                  serviceName={formData.name}
                  entries={checklists}
                  onChange={setChecklists}
                />
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <ServiceColorPicker
              value={formData.color}
              onChange={(color) => setFormData({ ...formData, color })}
            />
            <div className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3">
              <div className="space-y-0.5">
                <Label htmlFor="default-chargeable" className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-600" />
                  Default chargeable
                </Label>
                <p className="text-xs text-muted-foreground text-pretty">
                  Completed calls of this type are deemed chargeable and sent to the Chargeable Calls
                  review queue. Any call returned with parts added is always chargeable regardless.
                </p>
              </div>
              <Switch
                id="default-chargeable"
                checked={formData.default_chargeable}
                onCheckedChange={(v) => setFormData({ ...formData, default_chargeable: v })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nominal-code">Nominal code</Label>
              <NominalCodeSelect
                id="nominal-code"
                value={formData.nominal_code_id}
                onChange={(id) => setFormData({ ...formData, nominal_code_id: id })}
                codes={nominalCodes}
                noneLabel="None"
              />
              <p className="text-xs text-muted-foreground">
                Accounting code for work of this type. Used to auto-fill invoice lines when the
                department has no code set.
              </p>
            </div>
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
                Who usually performs this service. Sets the default when added to a site.
              </p>
            </div>
            {formData.default_worker_type === 'cdo' && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="route-eligible" className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-teal-600" />
                    Allocate to a route
                  </Label>
                  <p className="text-xs text-muted-foreground text-pretty">
                    CDO-delivered services of this type can be added to a CDO route. Turn this off
                    for CDO work that is never routed (e.g. fire extinguisher servicing, fire &amp;
                    smoke damper testing).
                  </p>
                </div>
                <Switch
                  id="route-eligible"
                  checked={formData.route_eligible}
                  onCheckedChange={(v) => setFormData({ ...formData, route_eligible: v })}
                />
              </div>
            )}
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
            <div className="grid gap-2">
              <Label htmlFor="status">Service Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as 'live' | 'dead' })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="dead">Dead</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Dead services are paused and will not generate any new tasks.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useCallback, useState } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Plus, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PostcodeLookup } from '@/components/dashboard/shared/postcode-lookup'
import { AddressFinder } from '@/components/dashboard/shared/address-finder'
import type { PlaceResult } from '@/app/api/places-search/route'
import { SiteClassificationFields } from '@/components/dashboard/sites/site-classification-fields'
import {
  SystemServicePicker,
  type SystemServiceSelection,
  type ServiceValueMap,
} from '@/components/dashboard/sites/system-service-picker'
import {
  provisionSiteSystems,
  findRemoteMonitoringTypeId,
  type ProvisionSystemSelection,
} from '@/lib/sites/provision-systems'
import { createSetupCharges } from '@/lib/actions/recurring-charges'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
  MONTH_LABELS,
} from '@/lib/billing/recurring'
import type {
  Client,
  Branch,
  PropertyType,
  SystemType,
  ServiceType,
  ChargeTemplate,
  RecurringFrequency,
  RecurringTiming,
} from '@/lib/types/database'

interface AddSiteDialogProps {
  clients: Client[]
  branches?: Branch[]
  propertyTypes?: PropertyType[]
  systemTypes?: SystemType[]
  serviceTypes?: ServiceType[]
  chargeTemplates?: ChargeTemplate[]
}

  const NO_TEMPLATE = '__custom__'
const FREQUENCIES = Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[]
const TIMINGS = Object.keys(RECURRING_TIMING_LABELS) as RecurringTiming[]

export function AddSiteDialog({
  clients,
  branches = [],
  propertyTypes = [],
  systemTypes = [],
  serviceTypes = [],
  chargeTemplates = [],
}: AddSiteDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    postcode: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    client_id: '',
    branch_id: '',
    property_type_id: '',
    site_id_cash: '',
    uprn: '',
    status: 'live' as 'live' | 'dead',
    notes: '',
    has_remote_monitoring: false,
    remote_monitoring_type: '' as '' | 'fire' | 'fire_and_fault' | 'fault',
    monitoring_station_name: '',
    monitoring_station_phone: '',
    monitoring_station_url: '',
  })
  const [reportingEmails, setReportingEmails] = useState<string[]>([])
  const [newReportingEmail, setNewReportingEmail] = useState('')
  // Systems (and their required services) to provision when the site is created.
  const [systemSelection, setSystemSelection] = useState<SystemServiceSelection>({})
  // Per-service annual charge values (£) entered in the picker, keyed by service type id.
  const [serviceValues, setServiceValues] = useState<ServiceValueMap>({})
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // The "Remote Monitoring" system type, if configured. Its selection in the
  // picker is driven by the toggle below and locked so it can't be unticked.
  const rmTypeId = findRemoteMonitoringTypeId(systemTypes)

  // Default the preconfigured charge to "Annual Maintenance" when it exists.
  const annualMaintenanceTemplateId =
    chargeTemplates.find((t) => t.name.trim().toLowerCase() === 'annual maintenance')?.id ?? null
  // Site-wide billing defaults applied to every service charge created at setup.
  const [chargeTemplateId, setChargeTemplateId] = useState<string>(
    annualMaintenanceTemplateId ?? NO_TEMPLATE,
  )
  const [chargeFrequency, setChargeFrequency] = useState<RecurringFrequency>('annual')
  const [chargeTiming, setChargeTiming] = useState<RecurringTiming>('advance')
  const [chargeRenewalMonth, setChargeRenewalMonth] = useState<string>('')

  const setServiceValue = (serviceTypeId: string, v: string) =>
    setServiceValues((prev) => ({ ...prev, [serviceTypeId]: v }))

  // Whether any service is ticked (drives the billing-config section visibility).
  const anyServiceSelected = Object.values(systemSelection).some((ids) => ids.length > 0)

  const handleAddReportingEmail = () => {
    if (newReportingEmail && !reportingEmails.includes(newReportingEmail)) {
      setReportingEmails([...reportingEmails, newReportingEmail])
      setNewReportingEmail('')
    }
  }

  const handleRemoveReportingEmail = (email: string) => {
    setReportingEmails(reportingEmails.filter((e) => e !== email))
  }

  // Fill the postcode and, when the address doesn't already mention the locality,
  // append it so the engineer/typist only needs to add the street line.
  // Stable identity so the memoized PostcodeLookup doesn't re-render each keystroke.
  // Fill the site name, address, postcode and contact phone from a Google
  // Places result. Existing values are only overwritten when the result has a
  // value, so a half-filled form isn't wiped by a lookup.
  const applyPlace = useCallback((p: PlaceResult) => {
    setFormData((prev) => ({
      ...prev,
      name: prev.name || p.name,
      address: p.address || prev.address,
      postcode: p.postcode || prev.postcode,
      contact_phone: p.phone || prev.contact_phone,
    }))
    setError(null)
  }, [])

  const applyPostcode = useCallback((r: { postcode: string; locality: string }) => {
    setFormData((prev) => {
      const hasLocality =
        r.locality && prev.address.toLowerCase().includes(r.locality.toLowerCase())
      const address =
        r.locality && !hasLocality
          ? [prev.address.trim(), r.locality].filter(Boolean).join('\n')
          : prev.address
      return { ...prev, postcode: r.postcode, address }
    })
  }, [])

  // Stable handlers so the memoized SiteClassificationFields (which contains the
  // relatively expensive Radix Selects) only re-renders when a selected value
  // changes — not on every keystroke in the text fields.
  const handleClientChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, client_id: value }))
    setError(null)
  }, [])
  const handleBranchChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, branch_id: value }))
  }, [])
  const handlePropertyTypeChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, property_type_id: value }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.status === 'live' && !formData.client_id) {
      setError('A client is required for a site when its status is Live.')
      return
    }

    // If any service charge value is entered, a renewal month is required — the
    // system relies on it to generate the recurring charge.
    const hasChargeValues = Object.values(serviceValues).some(
      (v) => (Number.parseFloat(v ?? '') || 0) > 0,
    )
    if (hasChargeValues && !chargeRenewalMonth) {
      setError('Select a renewal month for the service charges — the system relies on it to generate them.')
      return
    }

    setLoading(true)

    // Record who set the site up (shown in small print on the site overview).
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: inserted, error: insertError } = await supabase
      .from('sites')
      .insert({
      ...formData,
      created_by: user?.id ?? null,
      client_id: formData.client_id || null,
      branch_id: formData.branch_id || null,
      property_type_id: formData.property_type_id || null,
      remote_monitoring_type: formData.has_remote_monitoring
        ? formData.remote_monitoring_type || null
        : null,
      monitoring_station_name: formData.has_remote_monitoring
        ? formData.monitoring_station_name.trim() || null
        : null,
      monitoring_station_phone: formData.has_remote_monitoring
        ? formData.monitoring_station_phone.trim() || null
        : null,
      monitoring_station_url: formData.has_remote_monitoring
        ? formData.monitoring_station_url.trim() || null
        : null,
      reporting_emails: reportingEmails,
      })
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      setLoading(false)
      if (insertError) setError(insertError.message)
      return
    }

    // Provision the selected systems + services (and seed tasks for live sites)
    // before navigating, so the Systems tab is populated on arrival.
    const selections: ProvisionSystemSelection[] = Object.entries(systemSelection).map(
      ([systemTypeId, serviceTypeIds]) => ({
        systemTypeId,
        systemTypeName: systemTypes.find((t) => t.id === systemTypeId)?.name ?? 'System',
        serviceTypeIds,
      }),
    )
    if (selections.length > 0) {
      const {
        error: provError,
        services: provisioned,
      } = await provisionSiteSystems(supabase, {
        siteId: inserted.id,
        selections,
        serviceTypes,
        isDead: formData.status === 'dead',
        startDate: new Date().toISOString().slice(0, 10),
      })
      if (provError) {
        // The site itself was created; log the provisioning issue rather than
        // blocking navigation (the user can add systems manually).
        console.log('[v0] provisionSiteSystems error:', provError)
      }

      // Auto-create recurring charges for services with a value entered, applying
      // the site-wide billing config. Services left blank are skipped (the Systems
      // tab prompt will flag them). Values are entered as annual totals.
      const chargeServices = provisioned
        .map((svc) => ({
          siteServiceId: svc.id,
          valuePence: Math.max(
            0,
            Math.round((Number.parseFloat(serviceValues[svc.service_type_id] ?? '') || 0) * 100),
          ),
        }))
        .filter((s) => s.valuePence > 0)
      if (chargeServices.length > 0) {
        const res = await createSetupCharges({
          siteId: inserted.id,
          templateId: chargeTemplateId === NO_TEMPLATE ? null : chargeTemplateId,
          priceBasis: 'annual',
          frequency: chargeFrequency,
          timing: chargeTiming,
          renewalMonth: chargeRenewalMonth ? Number.parseInt(chargeRenewalMonth, 10) : null,
          services: chargeServices,
        })
        if (res.error) console.log('[v0] createSetupCharges error:', res.error)
      }
    }

    setLoading(false)

    {
      setOpen(false)
      setError(null)
      setSystemSelection({})
      setServiceValues({})
      setChargeTemplateId(annualMaintenanceTemplateId ?? NO_TEMPLATE)
      setChargeFrequency('annual')
      setChargeTiming('advance')
      setChargeRenewalMonth('')
      setFormData({
        name: '',
        address: '',
        postcode: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        client_id: '',
        branch_id: '',
        property_type_id: '',
        site_id_cash: '',
        uprn: '',
        status: 'live',
        notes: '',
        has_remote_monitoring: false,
        remote_monitoring_type: '',
        monitoring_station_name: '',
        monitoring_station_phone: '',
        monitoring_station_url: '',
      })
      setReportingEmails([])
      setNewReportingEmail('')
      // Take the user straight to the new site's Systems tab so they can start
      // adding systems immediately.
      if (inserted?.id) {
        router.push(`/dashboard/sites/${inserted.id}?tab=systems`)
      } else {
        router.refresh()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Site
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
            <DialogDescription>
              Add a new client site to the system
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Site Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., ABC Company Ltd"
                required
              />
            </div>
            <AddressFinder
              label="Find business or address"
              hint="Search by business name or address to auto-fill the details below."
              onSelect={applyPlace}
            />
            <PostcodeLookup id="site-postcode-lookup" onResolved={applyPostcode} />
            <div className="grid gap-2">
              <Label htmlFor="address">Address *</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full site address"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={formData.postcode}
                onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                placeholder="e.g., AB12 3CD"
              />
              <p className="text-xs text-muted-foreground">
                Used as the access code for the site&apos;s QR fire safety log book.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="01onal 123456"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@example.com"
                required
              />
            </div>
            <SiteClassificationFields
              clientId={formData.client_id}
              branchId={formData.branch_id}
              propertyTypeId={formData.property_type_id}
              status={formData.status}
              clients={clients}
              branches={branches}
              propertyTypes={propertyTypes}
              onClientChange={handleClientChange}
              onBranchChange={handleBranchChange}
              onPropertyTypeChange={handlePropertyTypeChange}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="site_id_cash">Site ID (CASH)</Label>
                <Input
                  id="site_id_cash"
                  value={formData.site_id_cash}
                onChange={(e) => setFormData({ ...formData, site_id_cash: e.target.value })}
                placeholder="CASH site ID"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="uprn">UPRN</Label>
              <Input
                id="uprn"
                value={formData.uprn}
                onChange={(e) => setFormData({ ...formData, uprn: e.target.value })}
                placeholder="Unique Property Reference Number"
                inputMode="numeric"
              />
            </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as 'live' | 'dead' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="dead">Dead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reporting_email">Reporting Email Addresses</Label>
              <p className="text-xs text-muted-foreground">
                Email addresses that will receive completed test reports
              </p>
              <div className="flex gap-2">
                <Input
                  id="reporting_email"
                  type="email"
                  value={newReportingEmail}
                  onChange={(e) => setNewReportingEmail(e.target.value)}
                  placeholder="report@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReportingEmail()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddReportingEmail}>
                  Add
                </Button>
              </div>
              {reportingEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {reportingEmails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveReportingEmail(email)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Systems &amp; Services</Label>
              <p className="text-xs text-muted-foreground">
                Select the systems installed at this site, then optionally tick the services
                required for each and enter the annual charge (£) &mdash; you can add or change
                these later from the Systems tab.
              </p>
              <SystemServicePicker
                systemTypes={systemTypes}
                serviceTypes={serviceTypes}
                value={systemSelection}
                onChange={(next) => {
                  setSystemSelection(next)
                  // Keep the Remote Monitoring toggle in sync: ticking the RM
                  // system switches the toggle on, unticking switches it off.
                  if (rmTypeId) {
                    const rmSelected = Object.prototype.hasOwnProperty.call(next, rmTypeId)
                    if (rmSelected !== formData.has_remote_monitoring) {
                      setFormData((prev) => ({
                        ...prev,
                        has_remote_monitoring: rmSelected,
                        remote_monitoring_type: rmSelected ? prev.remote_monitoring_type : '',
                      }))
                    }
                  }
                }}
                lockedSystemTypeIds={
                  rmTypeId && formData.has_remote_monitoring ? [rmTypeId] : []
                }
                serviceValues={serviceValues}
                onServiceValueChange={setServiceValue}
              />

              {anyServiceSelected && (
                <div className="mt-1 grid gap-3 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Billing applied to the service charges above. The billing account is inherited
                    from the client; values entered are treated as the annual total.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="setup-template" className="text-xs">
                        Preconfigured charge
                      </Label>
                      <Select value={chargeTemplateId} onValueChange={setChargeTemplateId}>
                        <SelectTrigger id="setup-template">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_TEMPLATE}>Custom charge…</SelectItem>
                          {chargeTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="setup-renewal" className="text-xs">
                        Renewal month <span className="text-destructive">*</span>
                      </Label>
                      <Select value={chargeRenewalMonth} onValueChange={setChargeRenewalMonth}>
                        <SelectTrigger id="setup-renewal">
                          <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_LABELS.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="setup-freq" className="text-xs">
                        Invoice frequency
                      </Label>
                      <Select
                        value={chargeFrequency}
                        onValueChange={(v) => setChargeFrequency(v as RecurringFrequency)}
                      >
                        <SelectTrigger id="setup-freq">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCIES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {RECURRING_FREQUENCY_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="setup-timing" className="text-xs">
                        Billed
                      </Label>
                      <Select
                        value={chargeTiming}
                        onValueChange={(v) => setChargeTiming(v as RecurringTiming)}
                      >
                        <SelectTrigger id="setup-timing">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMINGS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {RECURRING_TIMING_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="has_remote_monitoring" className="text-sm font-medium">
                    Remote Monitoring
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Does this site have a remotely monitored alarm system?
                  </p>
                </div>
                <Switch
                  id="has_remote_monitoring"
                  checked={formData.has_remote_monitoring}
                  onCheckedChange={(checked) => {
                    setFormData({
                      ...formData,
                      has_remote_monitoring: checked,
                      remote_monitoring_type: checked ? formData.remote_monitoring_type : '',
                    })
                    // Auto-add / remove the Remote Monitoring system in the picker.
                    if (rmTypeId) {
                      setSystemSelection((prev) => {
                        const next = { ...prev }
                        if (checked) next[rmTypeId] = next[rmTypeId] ?? []
                        else delete next[rmTypeId]
                        return next
                      })
                    }
                  }}
                />
              </div>
              {formData.has_remote_monitoring && (
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="remote_monitoring_type">Monitoring Type</Label>
                    <Select
                      value={formData.remote_monitoring_type}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          remote_monitoring_type: value as 'fire' | 'fire_and_fault' | 'fault',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select what is monitored" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fire">Fire</SelectItem>
                        <SelectItem value="fire_and_fault">Fire and Fault</SelectItem>
                        <SelectItem value="fault">Fault only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_name">Monitoring Station Name</Label>
                    <Input
                      id="monitoring_station_name"
                      value={formData.monitoring_station_name}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_name: e.target.value })
                      }
                      placeholder="e.g., ABC Alarm Receiving Centre"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_phone">Station Phone</Label>
                    <Input
                      id="monitoring_station_phone"
                      type="tel"
                      value={formData.monitoring_station_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_phone: e.target.value })
                      }
                      placeholder="e.g., 0800 123 4567"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="monitoring_station_url">Station Website / Portal URL</Label>
                    <Input
                      id="monitoring_station_url"
                      type="url"
                      value={formData.monitoring_station_url}
                      onChange={(e) =>
                        setFormData({ ...formData, monitoring_station_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes about this site"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-2">
              {error}
            </p>
          )}
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
                'Add Site'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

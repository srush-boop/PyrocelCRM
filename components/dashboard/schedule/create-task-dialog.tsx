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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Loader2, CalendarIcon, Siren } from 'lucide-react'
import { format } from 'date-fns'
import type { Profile, SiteService, Site, ServiceType, SystemType } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'

interface CreateTaskDialogProps {
  siteServices: (SiteService & { site: Site; service_type: ServiceType })[]
  engineers: Profile[]
  clients: { id: string; name: string }[]
  /** Reactive / emergency call types (non-recurring service types). */
  reactiveServiceTypes?: ServiceType[]
  /** All sites, used for the reactive site picker (may not have services yet). */
  sites?: Site[]
  /** System types, used for the reactive system picker. */
  systemTypes?: SystemType[]
  /** Prefill + lock the site (e.g. launched from a site page). */
  defaultSiteId?: string
  /** Prefill the system (e.g. launched from a specific system). */
  defaultSystemTypeId?: string
  /** Which mode to open in. Defaults to recurring. */
  defaultMode?: 'recurring' | 'reactive'
  /** Custom trigger. Omit for the default "Book Call" button. */
  trigger?: React.ReactNode
  /**
   * Fired after a call is booked successfully, with the site it was booked
   * against. Used by the map to fly/zoom to the newly created call.
   */
  onBooked?: (info: { siteId: string; mode: 'recurring' | 'reactive' }) => void
}

const ALL_VISITS = '__all__'
// Sentinel for service types that don't belong to a system type, so they remain
// selectable rather than being hidden behind an empty system list.
const NONE_SYSTEM = '__none__'
const NO_CLIENT = '__none__'
const NO_SYSTEM = '__none__'

export function CreateTaskDialog({
  siteServices,
  engineers,
  clients,
  reactiveServiceTypes = [],
  sites: allSites,
  systemTypes = [],
  defaultSiteId,
  defaultSystemTypeId,
  defaultMode = 'recurring',
  trigger,
  onBooked,
}: CreateTaskDialogProps) {
  const reactiveEnabled = reactiveServiceTypes.length > 0
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'recurring' | 'reactive'>(
    reactiveEnabled ? defaultMode : 'recurring',
  )

  // Cascading selection: site -> system -> service (which resolves to a site_service).
  const [siteId, setSiteId] = useState(defaultSiteId ?? '')
  const [systemTypeId, setSystemTypeId] = useState('')
  const [clientId, setClientId] = useState('')

  // Reactive-mode selections.
  const [reactiveTypeId, setReactiveTypeId] = useState('')
  const [reactiveSystemTypeId, setReactiveSystemTypeId] = useState(defaultSystemTypeId ?? NO_SYSTEM)
  const [kpiHours, setKpiHours] = useState<number | ''>('')

  const [formData, setFormData] = useState({
    site_service_id: '',
    assigned_engineer_id: '',
    scheduled_date: new Date(),
    booked_start_time: '',
    booked_end_time: '',
  })
  const [visitTypes, setVisitTypes] = useState<{ id: string; name: string }[]>([])
  const [visitTypeId, setVisitTypeId] = useState<string>(ALL_VISITS)
  const [timeError, setTimeError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const schedulableServices = siteServices.filter((ss) => ss.active !== false)

  // Sites for the recurring cascade (those with at least one schedulable service).
  const recurringSites = Array.from(
    new Map(schedulableServices.map((ss) => [ss.site.id, ss.site])).values(),
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Sites for the reactive picker: prefer the full list; fall back to sites with
  // services if a full list wasn't supplied.
  const reactiveSites = (allSites && allSites.length > 0 ? allSites : recurringSites)
    .filter((s) => s.status !== 'dead')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const selectedRecurringSite = recurringSites.find((s) => s.id === siteId)
  const selectedReactiveSite = reactiveSites.find((s) => s.id === siteId)
  const lockSite = Boolean(defaultSiteId)

  const systemsForSite = siteId
    ? Array.from(
        new Map(
          schedulableServices
            .filter((ss) => ss.site_id === siteId)
            .map((ss) => {
              const st = ss.service_type?.system_type
              const key = st?.id ?? NONE_SYSTEM
              return [key, { id: key, name: st?.name ?? 'No system' }]
            }),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : []

  const servicesForSelection =
    siteId && systemTypeId
      ? schedulableServices.filter(
          (ss) =>
            ss.site_id === siteId &&
            (ss.service_type?.system_type_id ?? NONE_SYSTEM) === systemTypeId,
        )
      : []

  const selectedReactiveType = reactiveServiceTypes.find((t) => t.id === reactiveTypeId)

  const handleSiteChange = (value: string) => {
    setSiteId(value)
    setSystemTypeId('')
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setFormData((prev) => ({ ...prev, site_service_id: '' }))
    const site = recurringSites.find((s) => s.id === value)
    setClientId(site?.client_id ?? '')
  }

  const handleReactiveSiteChange = (value: string) => {
    setSiteId(value)
    const site = reactiveSites.find((s) => s.id === value)
    setClientId(site?.client_id ?? '')
  }

  const handleSystemChange = (value: string) => {
    setSystemTypeId(value)
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setFormData((prev) => ({ ...prev, site_service_id: '' }))
  }

  const handleServiceChange = async (siteServiceId: string) => {
    setFormData({ ...formData, site_service_id: siteServiceId })
    setVisitTypeId(ALL_VISITS)
    const ss = schedulableServices.find((s) => s.id === siteServiceId)
    if (!ss?.service_type_id) {
      setVisitTypes([])
      return
    }
    const { data } = await supabase
      .from('service_visit_types')
      .select('id, name, sort_order')
      .eq('service_type_id', ss.service_type_id)
      .order('sort_order', { ascending: true })
    setVisitTypes((data as { id: string; name: string }[]) ?? [])
  }

  const handleReactiveTypeChange = (value: string) => {
    setReactiveTypeId(value)
    const t = reactiveServiceTypes.find((st) => st.id === value)
    // Prefill KPI from the call type default, and the system from the type.
    setKpiHours(t?.default_kpi_hours ?? '')
    if (!defaultSystemTypeId && t?.system_type_id) {
      setReactiveSystemTypeId(t.system_type_id)
    }
  }

  const resetForm = () => {
    setSiteId(defaultSiteId ?? '')
    setSystemTypeId('')
    setClientId('')
    setReactiveTypeId('')
    setReactiveSystemTypeId(defaultSystemTypeId ?? NO_SYSTEM)
    setKpiHours('')
    setError(null)
    setFormData({
      site_service_id: '',
      assigned_engineer_id: '',
      scheduled_date: new Date(),
      booked_start_time: '',
      booked_end_time: '',
    })
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setMode(reactiveEnabled ? defaultMode : 'recurring')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      formData.booked_start_time &&
      formData.booked_end_time &&
      formData.booked_end_time <= formData.booked_start_time
    ) {
      setTimeError('End time must be after the start time')
      return
    }
    setTimeError(null)
    setError(null)
    setLoading(true)

    const shared = {
      clientId: clientId || null,
      assignedEngineerId: formData.assigned_engineer_id || null,
      scheduledDate: format(formData.scheduled_date, 'yyyy-MM-dd'),
      bookedStartTime: formData.booked_start_time || null,
      bookedEndTime: formData.booked_end_time || null,
    }

    const result =
      mode === 'recurring'
        ? await bookCall({
            mode: 'recurring',
            siteServiceId: formData.site_service_id,
            visitTypeId: visitTypeId === ALL_VISITS ? null : visitTypeId,
            ...shared,
          })
        : await bookCall({
            mode: 'reactive',
            siteId,
            serviceTypeId: reactiveTypeId,
            systemTypeId: reactiveSystemTypeId === NO_SYSTEM ? null : reactiveSystemTypeId,
            respondByHours: kpiHours === '' ? null : Number(kpiHours),
            ...shared,
          })

    setLoading(false)

    if (result.ok) {
      const bookedSiteId = siteId
      setOpen(false)
      resetForm()
      router.refresh()
      if (bookedSiteId) onBooked?.({ siteId: bookedSiteId, mode })
    } else {
      setError(result.error ?? 'Something went wrong.')
    }
  }

  const canSubmit =
    mode === 'recurring' ? Boolean(formData.site_service_id) : Boolean(siteId && reactiveTypeId)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) resetForm()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Book Call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Book New Call</DialogTitle>
            <DialogDescription>
              Log a scheduled service call or a reactive / emergency call-out.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {reactiveEnabled && (
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
                <Button
                  type="button"
                  variant={mode === 'recurring' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('recurring')}
                >
                  Scheduled
                </Button>
                <Button
                  type="button"
                  variant={mode === 'reactive' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('reactive')}
                >
                  Reactive / Emergency
                </Button>
              </div>
            )}

            {mode === 'recurring' ? (
              <>
                <div className="grid gap-2">
                  <Label>Site *</Label>
                  <Select value={siteId} onValueChange={handleSiteChange} disabled={lockSite}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a site" />
                    </SelectTrigger>
                    <SelectContent>
                      {recurringSites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>System *</Label>
                  <Select value={systemTypeId} onValueChange={handleSystemChange} disabled={!siteId}>
                    <SelectTrigger>
                      <SelectValue placeholder={siteId ? 'Select a system' : 'Select a site first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {systemsForSite.map((sys) => (
                        <SelectItem key={sys.id} value={sys.id}>
                          {sys.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Service Type *</Label>
                  <Select
                    value={formData.site_service_id}
                    onValueChange={handleServiceChange}
                    disabled={!systemTypeId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={systemTypeId ? 'Select a service type' : 'Select a system first'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {servicesForSelection.map((ss) => (
                        <SelectItem key={ss.id} value={ss.id}>
                          {ss.service_type?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {visitTypes.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Visit</Label>
                    <Select value={visitTypeId} onValueChange={setVisitTypeId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VISITS}>Unspecified</SelectItem>
                        {visitTypes.map((vt) => (
                          <SelectItem key={vt.id} value={vt.id}>
                            {vt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Call type *</Label>
                  <Select value={reactiveTypeId} onValueChange={handleReactiveTypeChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a call type" />
                    </SelectTrigger>
                    <SelectContent>
                      {reactiveServiceTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            {t.name}
                            {t.is_emergency && <Siren className="h-3.5 w-3.5 text-destructive" />}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedReactiveType?.is_emergency && (
                    <Badge variant="destructive" className="w-fit gap-1">
                      <Siren className="h-3 w-3" />
                      Emergency call — engineer is notified on assignment
                    </Badge>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Site *</Label>
                  <Select value={siteId} onValueChange={handleReactiveSiteChange} disabled={lockSite}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a site" />
                    </SelectTrigger>
                    <SelectContent>
                      {reactiveSites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {systemTypes.length > 0 && (
                  <div className="grid gap-2">
                    <Label>System</Label>
                    <Select value={reactiveSystemTypeId} onValueChange={setReactiveSystemTypeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a system (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SYSTEM}>Unspecified</SelectItem>
                        {systemTypes.map((st) => (
                          <SelectItem key={st.id} value={st.id}>
                            {st.code ? `${st.code} — ${st.name}` : st.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="kpi-hours">Attend within (hours)</Label>
                  <Input
                    id="kpi-hours"
                    type="number"
                    min={1}
                    max={720}
                    value={kpiHours}
                    onChange={(e) => setKpiHours(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                    placeholder="e.g. 4"
                  />
                  <p className="text-xs text-muted-foreground">
                    Response KPI for this call. Prefilled from the call type; leave blank for none.
                  </p>
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={clientId || NO_CLIENT}
                onValueChange={(value) => setClientId(value === NO_CLIENT ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(selectedRecurringSite || selectedReactiveSite) && (
                <p className="text-xs text-muted-foreground">
                  Defaults to the site&apos;s client. Change it to bill this call to a different client.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Assign Engineer</Label>
              <Select
                value={formData.assigned_engineer_id}
                onValueChange={(value) => setFormData({ ...formData, assigned_engineer_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an engineer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.full_name || engineer.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start text-left font-normal',
                      !formData.scheduled_date && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.scheduled_date ? (
                      format(formData.scheduled_date, 'PPP')
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.scheduled_date}
                    onSelect={(date) => date && setFormData({ ...formData, scheduled_date: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label>Booked Time (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label="Booked start time"
                  value={formData.booked_start_time}
                  onChange={(e) => setFormData({ ...formData, booked_start_time: e.target.value })}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label="Booked end time"
                  value={formData.booked_end_time}
                  onChange={(e) => setFormData({ ...formData, booked_end_time: e.target.value })}
                  className="flex-1"
                />
              </div>
              {timeError ? (
                <p className="text-sm text-destructive">{timeError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add a start and end time to book an appointment slot on the calendar.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                'Book Call'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

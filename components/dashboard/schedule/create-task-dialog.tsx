'use client'

import { useState } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SearchSelect } from '@/components/dashboard/schedule/search-select'
import { Plus, Loader2, CalendarIcon, Siren, Mail, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import type { Profile, SiteService, Site, ServiceType, SystemType } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import { resolveWorkerType } from '@/lib/engineer-visibility'
import { disciplineAssignmentWarning } from '@/lib/assignment'
import { AlertTriangle } from 'lucide-react'

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
  /**
   * Lock the dialog to reactive / emergency logging only (hides the mode toggle
   * and the scheduled path). Used for on-call engineers logging call-outs.
   */
  lockReactive?: boolean
  /** Pre-select the assigned engineer (e.g. the on-call engineer logs to self). */
  defaultEngineerId?: string
  /** Custom trigger. Omit for the default "Log Call" button. */
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
  lockReactive = false,
  defaultEngineerId,
  trigger,
  onBooked,
}: CreateTaskDialogProps) {
  // All reactive call types are bookable here, including emergency types. When an
  // emergency type is selected we surface a "Go to map" shortcut so it can also be
  // dispatched from the live map, but booking it directly is allowed.
  const bookableReactiveTypes = reactiveServiceTypes
  const reactiveEnabled = bookableReactiveTypes.length > 0
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'recurring' | 'reactive'>(
    lockReactive ? 'reactive' : reactiveEnabled ? defaultMode : 'recurring',
  )

  // Cascading selection: site -> system -> service (which resolves to a site_service).
  const [siteId, setSiteId] = useState(defaultSiteId ?? '')
  const [systemTypeId, setSystemTypeId] = useState('')
  const [clientId, setClientId] = useState('')

  // Reactive-mode selections.
  const [reactiveTypeId, setReactiveTypeId] = useState('')
  const [reactiveSystemTypeId, setReactiveSystemTypeId] = useState(defaultSystemTypeId ?? NO_SYSTEM)
  const [kpiHours, setKpiHours] = useState<number | ''>('')
  // Free-text description of the reactive / emergency call (fault, access, etc.).
  const [description, setDescription] = useState('')

  const [formData, setFormData] = useState({
    site_service_id: '',
    assigned_engineer_id: defaultEngineerId ?? '',
    scheduled_date: new Date(),
    booked_start_time: '',
    booked_end_time: '',
  })
  const [visitTypes, setVisitTypes] = useState<{ id: string; name: string }[]>([])
  const [visitTypeId, setVisitTypeId] = useState<string>(ALL_VISITS)
  const [timeError, setTimeError] = useState<string | null>(null)
  // Complimentary booking confirmation email to the client/site (opt-out).
  const [sendConfirmation, setSendConfirmation] = useState(true)
  // Discipline-mismatch override: once the issuer confirms, booking proceeds.
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)
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

  // Warn (overridably) when the chosen engineer's discipline doesn't match the
  // call's delivery worker type — e.g. a CDO route call issued to a fire
  // engineer. Reactive/emergency calls are always worker_type 'engineer'.
  const selectedService =
    mode === 'recurring'
      ? schedulableServices.find((ss) => ss.id === formData.site_service_id)
      : undefined
  const callWorkerType =
    mode === 'recurring' && selectedService ? resolveWorkerType(selectedService) : 'engineer'
  const assignedEngineer = engineers.find((e) => e.id === formData.assigned_engineer_id)
  const disciplineWarning =
    formData.assigned_engineer_id && assignedEngineer
      ? disciplineAssignmentWarning(callWorkerType, assignedEngineer.discipline)
      : null

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

  const selectedReactiveType = bookableReactiveTypes.find((t) => t.id === reactiveTypeId)
  const selectedReactiveIsEmergency = selectedReactiveType?.is_emergency === true

  // Load the systems this call type has been configured for (via its per-system
  // checklists). When present, the system picker is scoped to just these; a
  // general (system_type_id = null) checklist means "Unspecified" is allowed too.
  const { data: callTypeSystems } = useSWR(
    reactiveTypeId ? ['call-type-systems', reactiveTypeId] : null,
    async () => {
      const { data } = await supabase
        .from('checklist_templates')
        .select('system_type_id')
        .eq('service_type_id', reactiveTypeId)
        .is('visit_type_id', null)
      const rows = (data ?? []) as { system_type_id: string | null }[]
      return {
        systemIds: rows.map((r) => r.system_type_id).filter((id): id is string => !!id),
        hasGeneral: rows.some((r) => r.system_type_id === null),
      }
    },
  )

  // Options for the reactive system picker. If the call type defines per-system
  // checklists, scope to those systems; otherwise show all systems (legacy).
  const scopedToCallType = (callTypeSystems?.systemIds.length ?? 0) > 0
  const reactiveSystemOptions = scopedToCallType
    ? systemTypes.filter((st) => callTypeSystems!.systemIds.includes(st.id))
    : systemTypes
  const allowUnspecifiedSystem = !scopedToCallType || (callTypeSystems?.hasGeneral ?? false)

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
    const t = bookableReactiveTypes.find((st) => st.id === value)
    // Only emergency calls carry an "attend within" KPI. Non-emergency
    // reactive work (remedial, commissioning, etc.) has no response target.
    setKpiHours(t?.is_emergency ? t?.default_kpi_hours ?? '' : '')
    // Reset the system selection; the picker's options reload for the new call
    // type (it may be scoped to specific systems). Seed the type's own system
    // when there is no locked default.
    if (defaultSystemTypeId) {
      setReactiveSystemTypeId(defaultSystemTypeId)
    } else {
      setReactiveSystemTypeId(t?.system_type_id ?? NO_SYSTEM)
    }
  }

  const resetForm = () => {
    setSiteId(defaultSiteId ?? '')
    setSystemTypeId('')
    setClientId('')
    setReactiveTypeId('')
    setReactiveSystemTypeId(defaultSystemTypeId ?? NO_SYSTEM)
    setKpiHours('')
    setDescription('')
    setSendConfirmation(true)
    setError(null)
    setFormData({
      site_service_id: '',
      assigned_engineer_id: defaultEngineerId ?? '',
      scheduled_date: new Date(),
      booked_start_time: '',
      booked_end_time: '',
    })
    setVisitTypes([])
    setVisitTypeId(ALL_VISITS)
    setOverrideConfirmed(false)
    setMode(lockReactive ? 'reactive' : reactiveEnabled ? defaultMode : 'recurring')
  }

  // Validate the form and book the call. Returns the booking result on success,
  // or null when validation failed (an error/time message has been set). Shared
  // by the normal submit and the "book, then go to map" emergency shortcut.
  const runBooking = async () => {
    if (
      formData.booked_start_time &&
      formData.booked_end_time &&
      formData.booked_end_time <= formData.booked_start_time
    ) {
      setTimeError('End time must be after the start time')
      return null
    }
    setTimeError(null)

    // A reactive / emergency call must carry a description so the engineer knows
    // what they are attending.
    if (mode === 'reactive' && !description.trim()) {
      setError('Add a call description so the engineer knows what to attend.')
      return null
    }

    // When a call type is scoped to specific systems and has no general
    // fallback checklist, a system must be chosen so the right checklist loads.
    if (
      mode === 'reactive' &&
      scopedToCallType &&
      !allowUnspecifiedSystem &&
      (reactiveSystemTypeId === NO_SYSTEM || !reactiveSystemTypeId)
    ) {
      setError('Select a system for this call type.')
      return null
    }

    setError(null)
    setLoading(true)

    const shared = {
      clientId: clientId || null,
      assignedEngineerId: formData.assigned_engineer_id || null,
      scheduledDate: format(formData.scheduled_date, 'yyyy-MM-dd'),
      bookedStartTime: formData.booked_start_time || null,
      bookedEndTime: formData.booked_end_time || null,
      sendConfirmation,
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
            notes: description,
            ...shared,
          })

    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.')
      return null
    }
    return result
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await runBooking()
    if (!result) return

    const bookedSiteId = siteId
    setOpen(false)
    resetForm()
    router.refresh()
    if (bookedSiteId) onBooked?.({ siteId: bookedSiteId, mode })
  }

  // Emergency shortcut: book the call first, then hand off to the live map with
  // the new call pre-selected for dispatch (?dispatch=<taskId>).
  const handleBookThenMap = async () => {
    const result = await runBooking()
    if (!result) return
    setOpen(false)
    resetForm()
    router.push(
      result.taskId
        ? `/dashboard/schedule/map?dispatch=${result.taskId}`
        : '/dashboard/schedule/map',
    )
  }

  const canSubmit =
    (mode === 'recurring'
      ? Boolean(formData.site_service_id)
      : Boolean(siteId && reactiveTypeId && description.trim())) &&
    // A discipline mismatch must be explicitly overridden before booking.
    (!disciplineWarning || overrideConfirmed)

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
            Log Call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log New Call</DialogTitle>
            <DialogDescription>
              {lockReactive
                ? 'Log a reactive / emergency call-out for your on-call shift.'
                : 'Log a scheduled service call or a reactive / emergency call-out.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {reactiveEnabled && !lockReactive && (
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
                  <SearchSelect
                    value={siteId}
                    onChange={handleSiteChange}
                    disabled={lockSite}
                    placeholder="Select a site"
                    searchPlaceholder="Search sites…"
                    emptyText="No matching site."
                    options={recurringSites.map((site) => ({
                      value: site.id,
                      label: site.name ?? 'Unnamed site',
                    }))}
                  />
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
                      {bookableReactiveTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            {t.is_emergency && <Siren className="h-3.5 w-3.5 text-destructive" />}
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedReactiveIsEmergency && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <Siren className="h-3.5 w-3.5 shrink-0" />
                        Emergency call — set the &ldquo;attend within&rdquo; target below, or book &amp; dispatch it live from the map.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading || !canSubmit}
                        className="h-7 shrink-0 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={handleBookThenMap}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Book &amp; go to map
                      </Button>
                    </div>
                  )}
                  {selectedReactiveIsEmergency && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="kpi-hours" className="text-sm">
                        Attend within (hours)
                      </Label>
                      <Input
                        id="kpi-hours"
                        type="number"
                        min={0}
                        step={0.5}
                        value={kpiHours}
                        onChange={(e) =>
                          setKpiHours(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="e.g. 4"
                      />
                      <p className="text-xs text-muted-foreground">
                        Response target for this emergency. Leave blank for none.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Site *</Label>
                  <SearchSelect
                    value={siteId}
                    onChange={handleReactiveSiteChange}
                    disabled={lockSite}
                    placeholder="Select a site"
                    searchPlaceholder="Search sites…"
                    emptyText="No matching site."
                    options={reactiveSites.map((site) => ({
                      value: site.id,
                      label: site.name ?? 'Unnamed site',
                    }))}
                  />
                </div>

                {reactiveSystemOptions.length > 0 && (
                  <div className="grid gap-2">
                    <Label>System{scopedToCallType ? ' *' : ''}</Label>
                    <Select value={reactiveSystemTypeId} onValueChange={setReactiveSystemTypeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a system (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowUnspecifiedSystem && <SelectItem value={NO_SYSTEM}>Unspecified</SelectItem>}
                        {reactiveSystemOptions.map((st) => (
                          <SelectItem key={st.id} value={st.id}>
                            {st.code ? `${st.code} — ${st.name}` : st.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {scopedToCallType && (
                      <p className="text-xs text-muted-foreground">
                        This call type has a checklist per system. The engineer&apos;s checklist is
                        chosen from the system selected here.
                      </p>
                    )}
                  </div>
                )}



                <div className="grid gap-2">
                  <Label htmlFor="call-description">Call description *</Label>
                  <Textarea
                    id="call-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the fault, symptoms, access details or anything the engineer should know…"
                    rows={3}
                    required
                    aria-required="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required. Shown to the engineer as the call notes.
                  </p>
                </div>
              </>
            )}

            {lockReactive ? (
              <div className="grid gap-2">
                <Label>Client</Label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {clients.find((c) => c.id === clientId)?.name ??
                    (siteId ? "The site's client" : 'Select a site first')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically billed to the site&apos;s client.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Client</Label>
                <SearchSelect
                  value={clientId || NO_CLIENT}
                  onChange={(value) => setClientId(value === NO_CLIENT ? '' : value)}
                  placeholder="Select a client"
                  searchPlaceholder="Search clients…"
                  emptyText="No matching client."
                  options={[
                    { value: NO_CLIENT, label: 'No client' },
                    ...clients.map((client) => ({ value: client.id, label: client.name })),
                  ]}
                />
                {(selectedRecurringSite || selectedReactiveSite) && (
                  <p className="text-xs text-muted-foreground">
                    Defaults to the site&apos;s client. Change it to bill this call to a different client.
                  </p>
                )}
              </div>
            )}

            {lockReactive ? (
              <div className="grid gap-2">
                <Label>Assigned engineer</Label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {engineers.find((e) => e.id === formData.assigned_engineer_id)?.full_name ||
                    engineers.find((e) => e.id === formData.assigned_engineer_id)?.email ||
                    'You'}
                </div>
                <p className="text-xs text-muted-foreground">
                  On-call call-outs are logged against you.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Assign Engineer</Label>
                <Select
                  value={formData.assigned_engineer_id}
                  onValueChange={(value) => {
                    setFormData({ ...formData, assigned_engineer_id: value })
                    setOverrideConfirmed(false)
                  }}
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

                {disciplineWarning && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-sm text-pretty">{disciplineWarning}</p>
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={overrideConfirmed}
                            onCheckedChange={(v) => setOverrideConfirmed(v === true)}
                          />
                          Assign anyway — the engineer will still see this call.
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="send-confirmation"
                checked={sendConfirmation}
                onCheckedChange={(checked) => setSendConfirmation(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label
                  htmlFor="send-confirmation"
                  className="flex cursor-pointer items-center gap-1.5"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Send booking confirmation
                </Label>
                <p className="text-xs text-muted-foreground">
                  Emails the site &amp; client a complimentary confirmation with an
                  add-to-calendar invite. Uncheck to skip.
                </p>
              </div>
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
                  Logging...
                </>
              ) : (
                'Log Call'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SystemBadge, SystemIcon, systemAccentStyle } from '@/lib/system-types'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Pencil,
  Trash2,
  Layers,
  Wrench,
  ExternalLink,
  Settings2,
  Siren,
  CalendarDays,
  AlertTriangle,
  HardHat,
  Power,
  PowerOff,
} from 'lucide-react'
import {
  EDITABLE_SITE_FLAG_KEYS,
  SITE_FLAG_META,
  resolveSiteFlags,
  activeFlagKeys,
  type EditableSiteFlagKey,
} from '@/lib/site-flags'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { buildSeedTaskRows, fetchVisitsByServiceType } from '@/lib/scheduling'
import { SystemPanelsManager } from '@/components/dashboard/sites/system-panels-manager'
import { CreateTaskDialog } from '@/components/dashboard/schedule/create-task-dialog'
import type {
  SiteSystem,
  SiteService,
  ServiceType,
  SystemType,
  PanelFieldDef,
  SystemPanel,
  ServiceVisitType,
  PanelVisitAssignment,
  Supplier,
  Profile,
  Site,
} from '@/lib/types/database'

type ServiceWithType = SiteService & { service_type?: ServiceType }

const UNASSIGNED = '__unassigned__'

interface SiteSystemsManagerProps {
  siteId: string
  siteSystems: SiteSystem[]
  siteServices: ServiceWithType[]
  systemTypes: SystemType[]
  availableServiceTypes: ServiceType[]
  siteStatus?: 'live' | 'dead' | 'new'
  panelFieldDefs?: PanelFieldDef[]
  panels?: SystemPanel[]
  // Visit types (Annual/Periodic/…) for the service types used on this site, and
  // any saved panel→visit rotation assignments. Feed the rotation grid.
  serviceVisitTypes?: ServiceVisitType[]
  panelAssignments?: PanelVisitAssignment[]
  // Active sub-contractors, for the per-system default assignment.
  subcontractors?: Supplier[]
  // Data for the per-system "Book call" (reactive/emergency) dialog. When
  // reactiveServiceTypes is empty the button is hidden.
  site?: Site
  engineers?: Profile[]
  clients?: { id: string; name: string }[]
  reactiveServiceTypes?: ServiceType[]
  // Site-level attendance defaults, shown as the "Inherit" value for each
  // system's per-system override.
  siteFlagDefaults?: Record<EditableSiteFlagKey, boolean>
}

export function SiteSystemsManager({
  siteId,
  siteSystems,
  siteServices,
  systemTypes,
  availableServiceTypes,
  siteStatus = 'live',
  panelFieldDefs = [],
  panels = [],
  serviceVisitTypes = [],
  panelAssignments = [],
  subcontractors = [],
  site,
  engineers = [],
  clients = [],
  reactiveServiceTypes = [],
  siteFlagDefaults = {
    booking_required: false,
    access_required: false,
    keys_required: false,
    two_engineers_required: false,
  },
}: SiteSystemsManagerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Off-contract sites (Dead, or New/auto-created from a won prospect quote) do
  // not auto-schedule visits when services are added.
  const isDead = siteStatus !== 'live'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SiteSystem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    system_type_id: '',
    description: '',
    install_date: '',
    nimbus_url: '',
    default_subcontractor_id: '',
    // Whether the system is in service. Inactive systems are kept for history but
    // excluded from recurring call generation.
    active: true,
    // Per-system attendance overrides, tri-state: null inherits the site default.
    booking_required: null as boolean | null,
    access_required: null as boolean | null,
    keys_required: null as boolean | null,
    two_engineers_required: null as boolean | null,
    remedial_notes: '',
  })

  // Add-services-to-a-system flow
  const [serviceSystemId, setServiceSystemId] = useState<string | null>(null)
  const [serviceSelection, setServiceSelection] = useState<string[]>([])
  const [serviceVisitDate, setServiceVisitDate] = useState('')
  const [addingServices, setAddingServices] = useState(false)

  function systemTypeName(id: string | null): string | null {
    if (!id) return null
    return systemTypes.find((s) => s.id === id)?.name ?? null
  }

  // Nimbus is the fire alarm remote-monitoring portal, so the URL field is only
  // relevant for fire alarm systems.
  function isFireAlarmSystemType(id: string | null): boolean {
    const name = systemTypeName(id)?.toLowerCase() ?? ''
    return name.includes('fire alarm')
  }

  function systemTypeLabel(id: string | null): string | null {
    if (!id) return null
    const st = systemTypes.find((s) => s.id === id)
    if (!st) return null
    return st.code ? `${st.code} — ${st.name}` : st.name
  }

  // Title for a system is its system type; fall back to the stored name for
  // legacy systems created before the type became mandatory.
  function systemTitle(system: SiteSystem): string {
    return systemTypeName(system.system_type_id) ?? system.name ?? 'System'
  }

  function openAdd() {
    setEditing(null)
    setForm({
      system_type_id: '',
      description: '',
      install_date: '',
      nimbus_url: '',
      default_subcontractor_id: '',
      active: true,
      booking_required: null,
      access_required: null,
      keys_required: null,
      two_engineers_required: null,
      remedial_notes: '',
    })
    setDialogOpen(true)
  }

  function openEdit(system: SiteSystem) {
    setEditing(system)
    setForm({
      system_type_id: system.system_type_id ?? '',
      description: system.description ?? '',
      install_date: system.install_date ?? '',
      nimbus_url: system.nimbus_url ?? '',
      default_subcontractor_id: system.default_subcontractor_id ?? '',
      active: system.active !== false,
      booking_required: system.booking_required ?? null,
      access_required: system.access_required ?? null,
      keys_required: system.keys_required ?? null,
      two_engineers_required: system.two_engineers_required ?? null,
      remedial_notes: system.remedial_notes ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.system_type_id) {
      toast.error('Select a system type')
      return
    }
    setSaving(true)
    const payload = {
      site_id: siteId,
      // The system type is the title, so the stored name mirrors it.
      name: systemTypeName(form.system_type_id) ?? 'System',
      system_type_id: form.system_type_id,
      description: form.description.trim() || null,
      install_date: form.install_date || null,
      // Nimbus only applies to fire alarm systems; clear it otherwise.
      nimbus_url: isFireAlarmSystemType(form.system_type_id)
        ? form.nimbus_url.trim() || null
        : null,
      default_subcontractor_id: form.default_subcontractor_id || null,
      active: form.active,
      // Per-system attendance overrides (null = inherit the site default).
      booking_required: form.booking_required,
      access_required: form.access_required,
      keys_required: form.keys_required,
      two_engineers_required: form.two_engineers_required,
      remedial_notes: form.remedial_notes.trim() || null,
    }
    const { error } = editing
      ? await supabase.from('site_systems').update(payload).eq('id', editing.id)
      : await supabase.from('site_systems').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editing ? 'System updated' : 'System added')
    setDialogOpen(false)
    router.refresh()
  }

  // Quick active/inactive toggle from the system tile, without opening the full
  // edit dialog. Inactive systems are kept for history but skipped by recurring
  // call generation.
  async function toggleActive(system: SiteSystem) {
    const next = system.active === false
    const { error } = await supabase
      .from('site_systems')
      .update({ active: next })
      .eq('id', system.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(next ? 'System marked active' : 'System marked inactive')
    router.refresh()
  }

  async function handleDelete() {
    if (!deleteId) return
    // Detach services first so they are not removed, just unassigned.
    await supabase.from('site_services').update({ site_system_id: null }).eq('site_system_id', deleteId)
    const { error } = await supabase.from('site_systems').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('System removed')
    router.refresh()
  }

  // Open the full service setup (frequency, assignment, KPIs) for a service by
  // routing to the overview tab with ?editService=, which auto-opens its edit
  // dialog in SiteServicesManager.
  function openServiceSetup(serviceId: string) {
    router.push(`${pathname}?tab=overview&editService=${serviceId}`)
  }

  async function assignService(serviceId: string, systemId: string | null) {
    const { error } = await supabase
      .from('site_services')
      .update({ site_system_id: systemId })
      .eq('id', serviceId)
    if (error) {
      toast.error(error.message)
      return
    }
    router.refresh()
  }

  function openAddServices(systemId: string) {
    setServiceSystemId(systemId)
    setServiceSelection([])
    setServiceVisitDate(new Date().toISOString().slice(0, 10))
  }

  function toggleServiceType(id: string) {
    setServiceSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Only service types belonging to this system's type may be added, so every
  // service stays linked to the correct system (e.g. only emergency-lighting
  // services can be attached to an Emergency Lighting system).
  function serviceTypesForSystem(system: SiteSystem | undefined): ServiceType[] {
    if (!system) return []
    return availableServiceTypes
      .filter((st) => st.system_type_id === system.system_type_id)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function handleAddServicesToSystem() {
    if (!serviceSystemId || serviceSelection.length === 0) return
    setAddingServices(true)
    const visitDateStr = serviceVisitDate || new Date().toISOString().slice(0, 10)

    const insertData = serviceSelection.map((serviceTypeId) => {
      const st = availableServiceTypes.find((s) => s.id === serviceTypeId)
      return {
        site_id: siteId,
        service_type_id: serviceTypeId,
        site_system_id: serviceSystemId,
        frequency_value: st?.default_frequency_value ?? 12,
        frequency_unit: st?.default_frequency_unit ?? 'months',
        worker_type: st?.default_worker_type ?? 'cdo',
        next_service_date: isDead ? null : visitDateStr,
      }
    })

    const { data: inserted, error } = await supabase
      .from('site_services')
      .insert(insertData)
      .select('id, service_type_id, frequency_value, frequency_unit')

    if (error) {
      setAddingServices(false)
      toast.error(error.message)
      return
    }

    // Live sites get scheduled tasks for each new service. Multi-visit services
    // (e.g. Fire Alarm = Annual + Periodic) seed the whole first cycle up front.
    if (!isDead && inserted && inserted.length > 0) {
      const rows = inserted as {
        id: string
        service_type_id: string
        frequency_value: number
        frequency_unit: 'weeks' | 'months'
      }[]
      const visitsByServiceType = await fetchVisitsByServiceType(
        supabase,
        rows.map((r) => r.service_type_id),
      )
      const taskData = buildSeedTaskRows(rows, visitDateStr, visitsByServiceType)
      await supabase.from('tasks').insert(taskData)
    }

    setAddingServices(false)
    setServiceSystemId(null)
    setServiceSelection([])
    toast.success(`Added ${insertData.length} service${insertData.length !== 1 ? 's' : ''}`)

    // Stay on the Systems tab and refresh in place so the new service appears
    // under its system straight away. Users can click a service to open its full
    // set up (frequency, assignment, KPIs) via openServiceSetup.
    router.refresh()
  }

  // Group services by their site_system_id.
  const servicesBySystem = new Map<string, ServiceWithType[]>()
  const unassigned: ServiceWithType[] = []
  for (const svc of siteServices) {
    if (svc.site_system_id) {
      const list = servicesBySystem.get(svc.site_system_id) ?? []
      list.push(svc)
      servicesBySystem.set(svc.site_system_id, list)
    } else {
      unassigned.push(svc)
    }
  }

  const activeServiceSystem = siteSystems.find((s) => s.id === serviceSystemId)
  const serviceTypeOptions = serviceTypesForSystem(activeServiceSystem)

  // Active panel field definitions grouped by system type, and panels grouped by
  // the site system they belong to. A system type only offers panels when an
  // admin has configured at least one active panel field for it.
  const panelDefsBySystemType = new Map<string, PanelFieldDef[]>()
  for (const def of panelFieldDefs) {
    if (!def.active) continue
    const list = panelDefsBySystemType.get(def.system_type_id) ?? []
    list.push(def)
    panelDefsBySystemType.set(def.system_type_id, list)
  }
  const panelsBySystem = new Map<string, SystemPanel[]>()
  for (const panel of panels) {
    const list = panelsBySystem.get(panel.site_system_id) ?? []
    list.push(panel)
    panelsBySystem.set(panel.site_system_id, list)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Systems</h2>
          <p className="text-sm text-muted-foreground">
            The systems installed at this site. Attach services to each system.
          </p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" />
          Add system
        </Button>
      </div>

      {siteSystems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No systems yet</p>
              <p className="text-sm text-muted-foreground">
                Add a system (e.g. Fire Alarm) to start grouping this site&apos;s services.
              </p>
            </div>
            <Button onClick={openAdd} variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Add system
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {siteSystems.map((system) => {
            const services = servicesBySystem.get(system.id) ?? []
            const addableForSystem = serviceTypesForSystem(system)
            const typeLabel = systemTypeLabel(system.system_type_id)
            const st = systemTypes.find((s) => s.id === system.system_type_id)
            const systemPanelDefs = system.system_type_id
              ? panelDefsBySystemType.get(system.system_type_id) ?? []
              : []
            const systemPanels = panelsBySystem.get(system.id) ?? []
            // Rotation grid inputs for this system: the distinct visit types of
            // its active services (ordered), and the saved assignments. Rotation
            // only makes sense when a service actually has ≥2 visit occurrences.
            const systemServiceTypeIds = new Set(
              services.map((s) => s.service_type_id).filter(Boolean) as string[],
            )
            const systemVisitTypes = serviceVisitTypes
              .filter((vt) => systemServiceTypeIds.has(vt.service_type_id))
              .sort((a, b) => a.sort_order - b.sort_order)
            const systemPanelAssignments = panelAssignments.filter(
              (pa) => pa.site_system_id === system.id,
            )

            // Summary info for the tile: active service count, next visit due
            // (earliest across the system's active services, flagged if overdue),
            // effective attendance requirements, and the default sub-contractor.
            const activeServices = services.filter((s) => s.active !== false)
            const nextDueDate = activeServices
              .map((s) => s.next_service_date)
              .filter((d): d is string => !!d)
              .sort()[0] ?? null
            const todayStr = new Date().toISOString().slice(0, 10)
            const nextDueOverdue = nextDueDate ? nextDueDate < todayStr : false
            const systemFlags = resolveSiteFlags(siteFlagDefaults, null, { system })
            const activeFlags = activeFlagKeys(systemFlags).filter(
              (k) => k !== 'remedial_required',
            )
            const subName = system.default_subcontractor_id
              ? subcontractors.find((s) => s.id === system.default_subcontractor_id)?.name ?? null
              : null
            const isInactive = system.active === false

            return (
              <Card
                key={system.id}
                className={cn(
                  st && 'border-2 border-l-4',
                  isInactive && 'opacity-60',
                )}
                style={st ? systemAccentStyle(st.color) : undefined}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 py-2">
                  <div className="space-y-0.5">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {st ? (
                        <SystemIcon system={st} />
                      ) : (
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      )}
                      {systemTitle(system)}
                      {typeLabel && system.system_type_id && st?.code && (
                        <SystemBadge system={st} codeOnly />
                      )}
                      {isInactive && (
                        <Badge variant="secondary" className="gap-1">
                          <PowerOff className="h-3 w-3" />
                          Inactive
                        </Badge>
                      )}
                    </CardTitle>
                    {system.description && (
                      <CardDescription>{system.description}</CardDescription>
                    )}
                    {system.nimbus_url && (
                      <a
                        href={system.nimbus_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Nimbus
                      </a>
                    )}

                    {/* At-a-glance system info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Wrench className="h-3.5 w-3.5" />
                        {activeServices.length} service{activeServices.length !== 1 ? 's' : ''}
                      </span>
                      {nextDueDate && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            nextDueOverdue && 'font-medium text-destructive',
                          )}
                        >
                          {nextDueOverdue ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <CalendarDays className="h-3.5 w-3.5" />
                          )}
                          {nextDueOverdue ? 'Overdue' : 'Next visit'}:{' '}
                          {format(parseISO(nextDueDate), 'd MMM yyyy')}
                        </span>
                      )}
                      {system.install_date && (
                        <span className="inline-flex items-center gap-1">
                          <HardHat className="h-3.5 w-3.5" />
                          Installed {format(parseISO(system.install_date), 'MMM yyyy')}
                        </span>
                      )}
                      {systemPanels.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {systemPanels.length} panel{systemPanels.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {subName && (
                        <span className="inline-flex items-center gap-1">
                          Sub-contractor: <span className="text-foreground">{subName}</span>
                        </span>
                      )}
                    </div>

                    {/* Effective attendance requirements */}
                    {activeFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {activeFlags.map((key) => {
                          const meta = SITE_FLAG_META[key]
                          const FlagIcon = meta.icon
                          return (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground"
                              title={meta.label}
                            >
                              <FlagIcon className="h-3 w-3" />
                              {meta.short}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {reactiveServiceTypes.length > 0 && site && !isInactive && (
                      <CreateTaskDialog
                        siteServices={[]}
                        engineers={engineers}
                        clients={clients}
                        reactiveServiceTypes={reactiveServiceTypes}
                        sites={[site]}
                        systemTypes={systemTypes}
                        defaultSiteId={siteId}
                        defaultSystemTypeId={system.system_type_id ?? undefined}
                        defaultMode="reactive"
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Book a call for this system">
                            <Siren className="h-4 w-4" />
                            <span className="sr-only">Book call for this system</span>
                          </Button>
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleActive(system)}
                      title={isInactive ? 'Mark system active' : 'Mark system inactive'}
                    >
                      {isInactive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                      <span className="sr-only">
                        {isInactive ? 'Mark system active' : 'Mark system inactive'}
                      </span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(system)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit system</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(system.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete system</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pb-2 pt-0">
                  {services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No services attached.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {services.map((svc) => (
                        <li
                          key={svc.id}
                          className="flex items-center justify-between gap-3 px-3 py-1"
                        >
                          <button
                            type="button"
                            onClick={() => openServiceSetup(svc.id)}
                            className="group flex flex-1 items-center gap-2 text-left text-sm hover:text-primary"
                            title="Open service set up"
                          >
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                            <span className="group-hover:underline">
                              {svc.service_type?.name ?? 'Service'}
                            </span>
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => assignService(svc.id, null)}
                          >
                            Detach
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => openAddServices(system.id)}
                    disabled={addableForSystem.length === 0 || isInactive}
                    title={
                      isInactive
                        ? 'System is inactive — mark it active to add services'
                        : addableForSystem.length === 0
                          ? 'No more service types available for this system type'
                          : undefined
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add service
                  </Button>
                  {systemPanelDefs.length > 0 && (
                    <SystemPanelsManager
                      siteSystemId={system.id}
                      panels={systemPanels}
                      fieldDefs={systemPanelDefs}
                      sitePath={pathname}
                      disabled={isDead}
                      rotationEnabled={system.panel_rotation_enabled}
                      visitTypes={systemVisitTypes}
                      assignments={systemPanelAssignments}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned services</CardTitle>
            <CardDescription>
              Services on this site not yet attached to a system. Assign each to a system below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {unassigned.map((svc) => (
                <li key={svc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    {svc.service_type?.name ?? 'Service'}
                  </span>
                  <Select
                    value={UNASSIGNED}
                    onValueChange={(value) =>
                      assignService(svc.id, value === UNASSIGNED ? null : value)
                    }
                    disabled={siteSystems.length === 0}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign to system" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {siteSystems.map((system) => (
                        <SelectItem key={system.id} value={system.id}>
                          {systemTitle(system)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit system' : 'Add system'}</DialogTitle>
            <DialogDescription>
              The system type is the title. Add an optional description for extra detail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="system-type">System type</Label>
              <Select
                value={form.system_type_id}
                onValueChange={(value) => setForm({ ...form, system_type_id: value })}
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
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="system-active" className="text-sm font-medium">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inactive systems are kept for history but excluded from recurring call
                  generation.
                </p>
              </div>
              <Switch
                id="system-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-desc">
                Additional description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="system-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Gent panel in ground floor reception"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="system-install">
                Install date <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="system-install"
                type="date"
                value={form.install_date}
                onChange={(e) => setForm({ ...form, install_date: e.target.value })}
              />
            </div>
            {isFireAlarmSystemType(form.system_type_id) && (
              <div className="grid gap-2">
                <Label htmlFor="system-nimbus">
                  Nimbus URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="system-nimbus"
                  type="url"
                  inputMode="url"
                  value={form.nimbus_url}
                  onChange={(e) => setForm({ ...form, nimbus_url: e.target.value })}
                  placeholder="https://nimbus.example.com/site/..."
                />
                <p className="text-xs text-muted-foreground">
                  Link to the Nimbus monitoring portal. Shown to engineers working on this
                  fire alarm system.
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="system-subcontractor">
                Default sub-contractor <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={form.default_subcontractor_id || UNASSIGNED}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    default_subcontractor_id: value === UNASSIGNED ? '' : value,
                  })
                }
              >
                <SelectTrigger id="system-subcontractor">
                  <SelectValue placeholder="Inherit site default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Inherit site default</SelectItem>
                  {subcontractors.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sub-contracted services under this system default to this sub-contractor unless
                overridden per service.
              </p>
            </div>

            <div className="grid gap-3 rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Attendance requirements</Label>
                <p className="text-xs text-muted-foreground">
                  System defaults for engineers attending this system. Each inherits the site
                  default unless overridden, and individual services can override these again.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {EDITABLE_SITE_FLAG_KEYS.map((key) => {
                  const meta = SITE_FLAG_META[key]
                  const Icon = meta.icon
                  const value = form[key]
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        {meta.label}
                      </span>
                      <Select
                        value={value === null ? UNASSIGNED : value ? 'yes' : 'no'}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            [key]: v === UNASSIGNED ? null : v === 'yes',
                          })
                        }
                      >
                        <SelectTrigger className="w-28 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>
                            {`Inherit (${siteFlagDefaults[key] ? 'Yes' : 'No'})`}
                          </SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="system-remedial" className="text-sm font-medium">
                  Remedial / parts notes{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="system-remedial"
                  value={form.remedial_notes}
                  onChange={(e) => setForm({ ...form, remedial_notes: e.target.value })}
                  placeholder="e.g. Faulty detector head zone 3 — bring spare."
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Add system'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!serviceSystemId}
        onOpenChange={(open) => !open && setServiceSystemId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add services</DialogTitle>
            <DialogDescription>
              {activeServiceSystem
                ? `Services added here are linked to ${systemTitle(activeServiceSystem)}.`
                : 'Services added here are linked to this system.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {serviceTypeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matching service types are available for this system
                {activeServiceSystem ? ` (${systemTitle(activeServiceSystem)})` : ''}. They may
                already be added, or none are configured for this system type yet.
              </p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Service types</Label>
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
                    {serviceTypeOptions.map((st) => (
                      <label
                        key={st.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                      >
                        <Checkbox
                          checked={serviceSelection.includes(st.id)}
                          onCheckedChange={() => toggleServiceType(st.id)}
                        />
                        <span className="flex-1 text-sm">{st.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="service-visit">First visit date</Label>
                  <Input
                    id="service-visit"
                    type="date"
                    value={serviceVisitDate}
                    onChange={(e) => setServiceVisitDate(e.target.value)}
                    disabled={isDead}
                  />
                  {isDead && (
                    <p className="text-xs text-muted-foreground">
                      This site is Dead — services will be added but no visit is scheduled.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setServiceSystemId(null)}
              disabled={addingServices}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddServicesToSystem}
              disabled={serviceSelection.length === 0 || addingServices}
            >
              {addingServices
                ? 'Adding...'
                : `Add ${serviceSelection.length > 0 ? `(${serviceSelection.length})` : ''} service${serviceSelection.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this system?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will be deleted. Any attached services are kept but become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

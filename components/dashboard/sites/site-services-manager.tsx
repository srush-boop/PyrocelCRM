'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateDocumentButton } from '@/components/documents/create-document-dialog'
import { formatDateUK } from '@/lib/utils'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Trash2, Wrench, Loader2, Calendar as CalendarIcon, Edit2, Clock, X, MapPin, MapPinned, User, HardHat, Power, PowerOff, ShieldCheck, Coins } from 'lucide-react'
import { ServiceChargeDialog } from './service-charge-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { describeTolerance } from '@/lib/kpi'
import { buildSeedTaskRows, fetchVisitsByServiceType } from '@/lib/scheduling'
import type { ServiceType, SiteService, Profile, Task, Route, Area, Subcontractor, WorkerType, ToleranceUnit } from '@/lib/types/database'
import {
  WORKER_TYPE_LABELS,
  allowedMethodsForWorker,
  resolveAssignedEngineerId,
  type AssignmentMethod,
} from '@/lib/assignment'

const NONE_VALUE = '__none__'

interface SiteServicesManagerProps {
  siteId: string
  // When set (via the ?editService= URL param, e.g. after adding a service
  // from a system), the edit dialog for this service opens automatically.
  initialEditServiceId?: string
  siteServices: (SiteService & { service_type: ServiceType })[]
  availableServiceTypes: ServiceType[]
  engineers?: Profile[]
  routes?: Route[]
  areas?: Area[]
  subcontractors?: Subcontractor[]
  tasks?: Task[]
  siteStatus?: 'live' | 'dead' | 'new'
  // Cascade default: a service with no explicit sub-contractor inherits its
  // system's default.
  systemDefaultsById?: Record<string, string | null>
}

export function SiteServicesManager({
  siteId,
  initialEditServiceId,
  siteServices,
  availableServiceTypes,
  engineers = [],
  routes = [],
  areas = [],
  subcontractors = [],
  tasks = [],
  siteStatus = 'live',
  systemDefaultsById = {},
}: SiteServicesManagerProps) {
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([])
  const [addServicesOpen, setAddServicesOpen] = useState(false)
  const [initialVisitDate, setInitialVisitDate] = useState<Date>(new Date())
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // Site service whose "Add charge" dialog is open (null = closed).
  const [chargeServiceId, setChargeServiceId] = useState<string | null>(null)

  // Edit service state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFrequencyValue, setEditFrequencyValue] = useState<number>(12)
  const [editFrequencyUnit, setEditFrequencyUnit] = useState<'weeks' | 'months'>('months')
  // Client KPI override for this site/service. Empty string = no override
  // (falls back to the service type's regulatory KPI).
  const [editClientToleranceValue, setEditClientToleranceValue] = useState<string>('')
  const [editClientToleranceUnit, setEditClientToleranceUnit] = useState<ToleranceUnit>('months')
  const [editWorkerType, setEditWorkerType] = useState<WorkerType>('cdo')
  const [editMethod, setEditMethod] = useState<AssignmentMethod>('route')
  const [editRouteId, setEditRouteId] = useState<string>(NONE_VALUE)
  const [editAreaId, setEditAreaId] = useState<string>(NONE_VALUE)
  const [editEngineerId, setEditEngineerId] = useState<string>(NONE_VALUE)
  const [editSubcontractorId, setEditSubcontractorId] = useState<string>(NONE_VALUE)
  const [editNextServiceDate, setEditNextServiceDate] = useState<Date | undefined>(undefined)
  const [editReportingEmails, setEditReportingEmails] = useState<string[]>([])
  const [editDefectsToEmail, setEditDefectsToEmail] = useState('')
  const [editAnchorNextToSchedule, setEditAnchorNextToSchedule] = useState(true)
  // Comprehensive cover: when on, this system is under cover for the client and
  // is used by future charging logic to decide what a chargeable call costs.
  const [editComprehensiveCover, setEditComprehensiveCover] = useState(false)
  const [editComprehensiveCoverNote, setEditComprehensiveCoverNote] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // One-off task scheduling state
  const [scheduleServiceId, setScheduleServiceId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date())
  const [scheduleEngineerId, setScheduleEngineerId] = useState<string>('')
  const [scheduling, setScheduling] = useState(false)
  // Which service is mid-toggle (active <-> inactive), for a spinner/disabled state.
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Off-contract sites (Dead, or New/auto-created from a won prospect quote) do
  // not auto-generate scheduled tasks until formally set Live.
  const isDead = siteStatus !== 'live'
  const isNewSite = siteStatus === 'new'

  // Sub-contractor cascade for the service currently being edited.
  const editingService = editingId ? siteServices.find((s) => s.id === editingId) : undefined
  const editServiceTypeId = editingService?.service_type_id ?? null
  // Only offer sub-contractors that provide this service type. Sub-contractors
  // with no tagged services (e.g. freshly migrated) fall back to being eligible
  // so the list is never unexpectedly empty.
  const eligibleSubcontractors = editServiceTypeId
    ? (() => {
        const matching = subcontractors.filter(
          (s) =>
            !s.service_type_ids ||
            s.service_type_ids.length === 0 ||
            s.service_type_ids.includes(editServiceTypeId),
        )
        return matching.length > 0 ? matching : subcontractors
      })()
    : subcontractors
  // Inherited default: the service's system default (if any).
  const inheritedSubcontractorId =
    (editingService?.site_system_id
      ? systemDefaultsById[editingService.site_system_id]
      : null) || null
  const inheritedSubcontractorName = inheritedSubcontractorId
    ? subcontractors.find((s) => s.id === inheritedSubcontractorId)?.name ?? null
    : null

  const handleToggleService = (serviceTypeId: string) => {
    setSelectedServiceTypes(prev =>
      prev.includes(serviceTypeId)
        ? prev.filter(id => id !== serviceTypeId)
        : [...prev, serviceTypeId]
    )
  }

  const handleAddServices = async () => {
    if (selectedServiceTypes.length === 0) return
    setAdding(true)

    const visitDateStr = format(initialVisitDate, 'yyyy-MM-dd')

    const insertData = selectedServiceTypes.map(serviceTypeId => {
      const serviceType = availableServiceTypes.find(st => st.id === serviceTypeId)
      return {
        site_id: siteId,
        service_type_id: serviceTypeId,
        frequency_value: serviceType?.default_frequency_value ?? 12,
        frequency_unit: serviceType?.default_frequency_unit ?? 'months',
        worker_type: serviceType?.default_worker_type ?? 'cdo',
        // Live sites get their first visit scheduled on the chosen date
        next_service_date: isDead ? null : visitDateStr,
      }
    })

    const { data: inserted } = await supabase
      .from('site_services')
      .insert(insertData)
      .select('id, service_type_id, frequency_value, frequency_unit')

    // Generate scheduled tasks for each new service. Dead sites never generate
    // tasks. For multi-visit services (e.g. Fire Alarm = Annual + Periodic) we
    // seed the WHOLE first cycle up front: one task per visit type, evenly split
    // across the service frequency. Single/zero-visit services seed one task.
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

    setAdding(false)
    setSelectedServiceTypes([])
    setInitialVisitDate(new Date())
    setAddServicesOpen(false)
    router.refresh()
  }

  const openEditDialog = (ss: SiteService & { service_type: ServiceType }) => {
    setEditingId(ss.id)
    setEditFrequencyValue(ss.frequency_value)
    setEditFrequencyUnit(ss.frequency_unit)
    setEditClientToleranceValue(
      ss.client_tolerance_value != null ? String(ss.client_tolerance_value) : '',
    )
    setEditClientToleranceUnit((ss.client_tolerance_unit as ToleranceUnit) || 'months')
    const workerType = (ss.worker_type as WorkerType) || 'cdo'
    setEditWorkerType(workerType)
    setEditRouteId(ss.route_id || NONE_VALUE)
    setEditAreaId(ss.area_id || NONE_VALUE)
    setEditEngineerId(ss.assigned_engineer_id || NONE_VALUE)
    setEditSubcontractorId(ss.subcontractor_id || NONE_VALUE)
    // Derive the current assignment method from whichever vector is set.
    let method: AssignmentMethod
    if (workerType === 'subcontractor') method = 'subcontractor'
    else if (ss.assigned_engineer_id) method = 'direct'
    else if (ss.route_id) method = 'route'
    else if (ss.area_id) method = 'area'
    else method = allowedMethodsForWorker(workerType)[0]
    setEditMethod(method)
    setEditNextServiceDate(ss.next_service_date ? new Date(ss.next_service_date) : undefined)
    setEditReportingEmails(Array.isArray(ss.reporting_emails) ? ss.reporting_emails : [])
    setEditDefectsToEmail(ss.defects_to_email || '')
    setEditAnchorNextToSchedule(ss.anchor_next_to_schedule ?? true)
    setEditComprehensiveCover(ss.comprehensive_cover ?? false)
    setEditComprehensiveCoverNote(ss.comprehensive_cover_note ?? '')
    setNewEmail('')
  }

  // Auto-open the edit dialog when arrived at via ?editService= (e.g. straight
  // after adding a service from a system). Runs once on mount.
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenedRef.current || !initialEditServiceId) return
    const match = siteServices.find((s) => s.id === initialEditServiceId)
    if (match) {
      autoOpenedRef.current = true
      openEditDialog(match)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddEmail = () => {
    const email = newEmail.trim()
    if (email && !editReportingEmails.includes(email)) {
      setEditReportingEmails([...editReportingEmails, email])
      setNewEmail('')
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSavingEdit(true)

    // Only the assignment vector matching the selected method is kept; the
    // others are cleared so resolution stays unambiguous.
    const routeId = editMethod === 'route' && editRouteId !== NONE_VALUE ? editRouteId : null
    const areaId = editMethod === 'area' && editAreaId !== NONE_VALUE ? editAreaId : null
    const engineerId = editMethod === 'direct' && editEngineerId !== NONE_VALUE ? editEngineerId : null
    const subcontractorId =
      editMethod === 'subcontractor' && editSubcontractorId !== NONE_VALUE ? editSubcontractorId : null

    await supabase
      .from('site_services')
      .update({
          frequency_value: editFrequencyValue,
          frequency_unit: editFrequencyUnit,
          // Client KPI override: blank clears it (inherits regulatory default).
        client_tolerance_value:
          editClientToleranceValue.trim() === ''
            ? null
            : Math.max(0, parseInt(editClientToleranceValue, 10) || 0),
        client_tolerance_unit:
          editClientToleranceValue.trim() === '' ? null : editClientToleranceUnit,
        worker_type: editWorkerType,
        route_id: routeId,
        area_id: areaId,
        assigned_engineer_id: engineerId,
        subcontractor_id: subcontractorId,
        next_service_date: editNextServiceDate
          ? format(editNextServiceDate, 'yyyy-MM-dd')
          : null,
        reporting_emails: editReportingEmails,
        defects_to_email: editDefectsToEmail.trim() || null,
        anchor_next_to_schedule: editAnchorNextToSchedule,
        comprehensive_cover: editComprehensiveCover,
        comprehensive_cover_note: editComprehensiveCover
          ? editComprehensiveCoverNote.trim() || null
          : null,
      })
      .eq('id', editingId)

    // Resolve the effective engineer for this service (direct → route → area)
    // and propagate it to existing pending tasks so the worker can actually see
    // their assigned work (engineers query tasks by assigned_engineer_id, which
    // is null on auto-generated tasks). Sub-contracted work resolves to null.
    const effectiveEngineerId = resolveAssignedEngineerId({
      worker_type: editWorkerType,
      assigned_engineer_id: engineerId,
      route_id: routeId,
      area_id: areaId,
      subcontractor_id: subcontractorId,
      route: routeId ? routes.find((r) => r.id === routeId) ?? null : null,
      area: areaId ? areas.find((a) => a.id === areaId) ?? null : null,
    })

    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: effectiveEngineerId })
      .eq('site_service_id', editingId)
      .eq('status', 'pending')

    setSavingEdit(false)
    setEditingId(null)
    // Drop the ?editService= param (mirrors the dialog's onOpenChange) so the
    // auto-open effect doesn't reopen the dialog when the refresh re-renders.
    if (initialEditServiceId) router.replace(pathname)
    router.refresh()
  }

  const handleDeleteService = async () => {
    if (!deleteId) return
    await supabase.from('site_services').delete().eq('id', deleteId)
    setDeleteId(null)
    router.refresh()
  }

  const handleScheduleTask = async () => {
    if (!scheduleServiceId) return
    setScheduling(true)

    await supabase.from('tasks').insert({
      site_service_id: scheduleServiceId,
      assigned_engineer_id: scheduleEngineerId || null,
      scheduled_date: format(scheduleDate, 'yyyy-MM-dd'),
      status: 'pending',
    })

    setScheduling(false)
    setScheduleServiceId(null)
    setScheduleDate(new Date())
    setScheduleEngineerId('')
    router.refresh()
  }

  // Toggle a service between active and inactive. When inactive, no new calls are
  // generated for it (recurrence, bulk generation, manual scheduling all stop).
  // Existing pending calls are intentionally left untouched.
  const handleToggleActive = async (serviceId: string, nextActive: boolean) => {
    setTogglingId(serviceId)
    await supabase
      .from('site_services')
      .update({ active: nextActive })
      .eq('id', serviceId)
    setTogglingId(null)
    router.refresh()
  }

  const getServiceTaskCount = (serviceId: string) => {
    return tasks.filter(t => t.site_service_id === serviceId && t.status === 'pending').length
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Services
              </CardTitle>
              <CardDescription>
                Services scheduled for this site
              </CardDescription>
            </div>
            {availableServiceTypes.length > 0 && (
              <Button onClick={() => setAddServicesOpen(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Services
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDead && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {isNewSite
                ? 'This site is New (created from a won quote) and off-contract. No tasks will be generated until it is set Live.'
                : 'This site is marked Dead. No new tasks will be generated until it is set back to Live.'}
            </p>
          )}
          {siteServices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No services configured for this site
            </p>
          ) : (
            <div className="space-y-3">
              {siteServices.map((ss) => {
                const pendingTasks = getServiceTaskCount(ss.id)
                const isInactive = ss.active === false
                const workerType = (ss.worker_type as WorkerType) || 'cdo'
                const route = ss.route
                const area = ss.area
                const engineer = ss.assigned_engineer
                const subcontractor = ss.subcontractor
                const serviceEmails = Array.isArray(ss.reporting_emails) ? ss.reporting_emails : []
                return (
                  <div
                    key={ss.id}
                    className={cn(
                      'flex items-start justify-between p-3 border rounded-lg gap-2 border-l-4',
                      isInactive && 'opacity-60',
                    )}
                    style={{ borderLeftColor: ss.service_type?.color || 'var(--border)' }}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: ss.service_type?.color || 'var(--muted-foreground)' }}
                          aria-hidden="true"
                        />
                        <p className="font-medium">{ss.service_type?.name}</p>
                        {isInactive && (
                          <Badge variant="outline" className="border-amber-500 text-xs text-amber-600">
                            Inactive
                          </Badge>
                        )}
                        {pendingTasks > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {pendingTasks} pending
                          </Badge>
                        )}
                        {ss.comprehensive_cover && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-500 text-xs text-emerald-700 dark:text-emerald-400"
                            title={ss.comprehensive_cover_note || 'Under comprehensive cover'}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Cover
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>Every {ss.frequency_value} {ss.frequency_unit}</span>
                        {ss.next_service_date && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              Next: {formatDateUK(ss.next_service_date)}
                            </span>
                          </>
                        )}
                        {ss.last_service_date && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              Last: {formatDateUK(ss.last_service_date)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {WORKER_TYPE_LABELS[workerType]}
                        </Badge>
                        {workerType === 'subcontractor' ? (
                          <Badge variant="outline" className="gap-1 text-xs font-normal">
                            <HardHat className="h-3 w-3" />
                            {subcontractor?.name || 'Unassigned sub-contractor'}
                          </Badge>
                        ) : engineer ? (
                          <Badge variant="outline" className="gap-1 text-xs font-normal">
                            <User className="h-3 w-3" />
                            {engineer.full_name || engineer.email}
                          </Badge>
                        ) : route ? (
                          <Badge variant="outline" className="gap-1 text-xs font-normal">
                            <MapPin className="h-3 w-3" />
                            {route.name}
                          </Badge>
                        ) : area ? (
                          <Badge variant="outline" className="gap-1 text-xs font-normal">
                            <MapPinned className="h-3 w-3" />
                            {area.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                            Unassigned
                          </Badge>
                        )}
                        {serviceEmails.length > 0 && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {serviceEmails.length} report email{serviceEmails.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isDead || ss.active === false}
                        onClick={() => {
                          setScheduleServiceId(ss.id)
                          setScheduleDate(new Date())
                          setScheduleEngineerId(ss.assigned_engineer_id || '')
                        }}
                        className="text-primary hover:text-primary"
                        title={
                          isDead
                            ? 'Site is dead — scheduling disabled'
                            : ss.active === false
                              ? 'Service is inactive — scheduling disabled'
                              : 'Book Call'
                        }
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={togglingId === ss.id}
                        onClick={() => handleToggleActive(ss.id, isInactive)}
                        className="text-muted-foreground hover:text-foreground"
                        title={isInactive ? 'Activate service' : 'Deactivate service (stops new calls)'}
                      >
                        {togglingId === ss.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isInactive ? (
                          <Power className="h-4 w-4" />
                        ) : (
                          <PowerOff className="h-4 w-4" />
                        )}
                      </Button>
                      <CreateDocumentButton
                        ownerType="site_service"
                        ownerId={ss.id}
                        entityLabel={ss.service_type?.name}
                        revalidatePath={pathname}
                        variant="ghost"
                        iconOnly
                        label="Create document"
                        className="text-muted-foreground hover:text-foreground"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setChargeServiceId(ss.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Add recurring charge"
                      >
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(ss)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit Service"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(ss.id)}
                        className="text-destructive hover:text-destructive"
                        title="Remove Service"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {availableServiceTypes.length === 0 && siteServices.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              All available services have been added
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Multiple Services Dialog */}
      <Dialog open={addServicesOpen} onOpenChange={setAddServicesOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Services to Site</DialogTitle>
            <DialogDescription>
              Select one or more services to add to this site
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 grid gap-2">
            <Label>First Visit Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isDead}
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !initialVisitDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {initialVisitDate ? format(initialVisitDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={initialVisitDate}
                  onSelect={(date) => date && setInitialVisitDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              {isDead
                ? 'This site is Dead — services will be added but no tasks will be scheduled.'
                : 'A scheduled task will be generated for each selected service on this date.'}
            </p>
          </div>
          <div className="py-2 space-y-3 max-h-[300px] overflow-y-auto">
            {availableServiceTypes.map((st) => (
              <div
                key={st.id}
                className={cn(
                  "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                  selectedServiceTypes.includes(st.id)
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleToggleService(st.id)}
              >
                <Checkbox
                  checked={selectedServiceTypes.includes(st.id)}
                  onCheckedChange={() => handleToggleService(st.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium">{st.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Default: Every {st.default_frequency_value} {st.default_frequency_unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Regulatory:{' '}
                    {describeTolerance({
                      value: st.regulatory_tolerance_value ?? st.default_deadline_tolerance_days ?? 0,
                      unit: st.regulatory_tolerance_unit ?? 'days',
                    })}{' '}
                    · Client:{' '}
                    {describeTolerance({
                      value: st.client_tolerance_value ?? st.default_deadline_tolerance_days ?? 0,
                      unit: st.client_tolerance_unit ?? 'days',
                    })}
                  </p>
                  {st.description && (
                    <p className="text-xs text-muted-foreground mt-1">{st.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddServicesOpen(false)
              setSelectedServiceTypes([])
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddServices}
              disabled={selectedServiceTypes.length === 0 || adding}
            >
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add {selectedServiceTypes.length > 0 ? `(${selectedServiceTypes.length})` : ''} Service{selectedServiceTypes.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule One-off Task Dialog */}
      <Dialog open={!!scheduleServiceId} onOpenChange={() => setScheduleServiceId(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book Service Call</DialogTitle>
            <DialogDescription>
              Book a call for {siteServices.find(ss => ss.id === scheduleServiceId)?.service_type?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !scheduleDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={(date) => date && setScheduleDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {engineers.length > 0 && (
              <div className="grid gap-2">
                <Label>Assign Engineer</Label>
                <Select value={scheduleEngineerId} onValueChange={setScheduleEngineerId}>
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleServiceId(null)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleTask} disabled={scheduling}>
              {scheduling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Book Call
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this service from the site? This will also
              remove any associated pending tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteService}
              className="bg-destructive text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {chargeServiceId && (
        <ServiceChargeDialog
          open={!!chargeServiceId}
          onOpenChange={(open) => !open && setChargeServiceId(null)}
          siteServiceId={chargeServiceId}
        />
      )}

      {/* Edit Service Dialog */}
      <Dialog
        open={!!editingId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null)
            // Drop the ?editService= param so it doesn't reopen on refresh.
            if (initialEditServiceId) router.replace(pathname)
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Configure the recurring schedule, assignment and client report emails for this service.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="freq-value">Frequency Value</Label>
                <Input
                  id="freq-value"
                  type="number"
                  min={1}
                  max={60}
                  value={editFrequencyValue}
                  onChange={(e) => setEditFrequencyValue(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freq-unit">Unit</Label>
                <Select value={editFrequencyUnit} onValueChange={(value) =>
                  setEditFrequencyUnit(value as 'weeks' | 'months')
                }>
                  <SelectTrigger id="freq-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(() => {
              const editingService = siteServices.find((s) => s.id === editingId)
              const regValue = editingService?.service_type?.regulatory_tolerance_value ?? 0
              const regUnit = (editingService?.service_type?.regulatory_tolerance_unit ??
                'months') as ToleranceUnit
              const regLabel = describeTolerance({ value: regValue, unit: regUnit })
              const hasOverride = editClientToleranceValue.trim() !== ''
              return (
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label htmlFor="client-kpi-value">Client KPI (optional)</Label>
                      <p className="text-xs text-muted-foreground">
                        A tighter target shared with the client. Leave blank to use the
                        regulatory standard ({regLabel}).
                      </p>
                    </div>
                    {hasOverride && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditClientToleranceValue('')}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="client-kpi-value"
                      type="number"
                      min={0}
                      max={60}
                      placeholder="Inherit"
                      value={editClientToleranceValue}
                      onChange={(e) => setEditClientToleranceValue(e.target.value)}
                    />
                    <Select
                      value={editClientToleranceUnit}
                      onValueChange={(v) => setEditClientToleranceUnit(v as ToleranceUnit)}
                    >
                      <SelectTrigger id="client-kpi-unit" aria-label="Client KPI unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasOverride ? (
                      <>
                        Client target:{' '}
                        <span className="font-medium text-foreground">
                          {describeTolerance({
                            value: parseInt(editClientToleranceValue, 10) || 0,
                            unit: editClientToleranceUnit,
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        Using regulatory standard:{' '}
                        <span className="font-medium text-foreground">{regLabel}</span>
                      </>
                    )}
                  </p>
                </div>
              )
            })()}

            <div className="grid gap-2">
              <Label>Next Service Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !editNextServiceDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editNextServiceDate ? format(editNextServiceDate, 'PPP') : <span>Not scheduled</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editNextServiceDate}
                    onSelect={setEditNextServiceDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                The date the next recurring service is due for this system.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="anchor-next-to-schedule"
                checked={editAnchorNextToSchedule}
                onCheckedChange={(checked) => setEditAnchorNextToSchedule(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor="anchor-next-to-schedule" className="cursor-pointer">
                  Anchor next due date to schedule
                </Label>
                <p className="text-xs text-muted-foreground">
                  {editAnchorNextToSchedule
                    ? 'On completion, the next due date is calculated from the scheduled date (fixed cadence — completing early or late will not shift future dates).'
                    : 'On completion, the next due date is calculated from the actual completion date (the schedule drifts with each visit).'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="comprehensive-cover"
                  checked={editComprehensiveCover}
                  onCheckedChange={(checked) => setEditComprehensiveCover(checked === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1">
                  <Label htmlFor="comprehensive-cover" className="flex cursor-pointer items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    Comprehensive cover
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    This system is under comprehensive cover for the client. Used when working out
                    what a chargeable call costs the client (cover typically means no charge).
                  </p>
                </div>
              </div>
              {editComprehensiveCover && (
                <div className="space-y-1.5">
                  <Label htmlFor="comprehensive-cover-note" className="text-xs">
                    Cover note (optional)
                  </Label>
                  <Textarea
                    id="comprehensive-cover-note"
                    value={editComprehensiveCoverNote}
                    onChange={(e) => setEditComprehensiveCoverNote(e.target.value)}
                    placeholder="e.g. Parts and labour included under annual cover contract."
                    rows={2}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-md border p-3">
              <Label>Who performs this service</Label>
              <Select
                value={editWorkerType}
                onValueChange={(value) => {
                  const wt = value as WorkerType
                  setEditWorkerType(wt)
                  // Reset the assignment method to the first valid option for
                  // the new worker type, and clear the vectors.
                  const nextMethod = allowedMethodsForWorker(wt)[0]
                  setEditMethod(nextMethod)
                  setEditRouteId(NONE_VALUE)
                  setEditAreaId(NONE_VALUE)
                  setEditEngineerId(NONE_VALUE)
                  setEditSubcontractorId(NONE_VALUE)
                }}
              >
                <SelectTrigger>
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

              {editWorkerType !== 'subcontractor' && (
                <div className="grid gap-2 pt-1">
                  <Label>How it is assigned</Label>
                  <Select
                    value={editMethod}
                    onValueChange={(value) => {
                      const m = value as AssignmentMethod
                      setEditMethod(m)
                      // Clear vectors not relevant to the chosen method.
                      if (m !== 'route') setEditRouteId(NONE_VALUE)
                      if (m !== 'area') setEditAreaId(NONE_VALUE)
                      if (m !== 'direct') setEditEngineerId(NONE_VALUE)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedMethodsForWorker(editWorkerType).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m === 'route'
                            ? 'By route'
                            : m === 'area'
                            ? 'By area'
                            : m === 'direct'
                            ? 'Direct to a person'
                            : 'Unassigned (open)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editWorkerType !== 'subcontractor' && editMethod === 'route' && (
                <div className="grid gap-2 pt-1">
                  <Label>Route</Label>
                  <Select value={editRouteId} onValueChange={setEditRouteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a route" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>No route</SelectItem>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editWorkerType !== 'subcontractor' && editMethod === 'area' && (
                <div className="grid gap-2 pt-1">
                  <Label>Area</Label>
                  <Select value={editAreaId} onValueChange={setEditAreaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>No area</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Work flows to the worker assigned to this area.
                  </p>
                </div>
              )}

              {editWorkerType !== 'subcontractor' && editMethod === 'direct' && (
                <div className="grid gap-2 pt-1">
                  <Label>Person</Label>
                  <Select value={editEngineerId} onValueChange={setEditEngineerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>No person</SelectItem>
                      {engineers.map((engineer) => (
                        <SelectItem key={engineer.id} value={engineer.id}>
                          {engineer.full_name || engineer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editWorkerType !== 'subcontractor' && editMethod === 'unassigned' && (
                <p className="text-xs text-muted-foreground pt-1">
                  This service will be left open. Generated tasks appear in the schedule&apos;s
                  Unassigned filter where they can be picked up and assigned.
                </p>
              )}

              {editWorkerType === 'subcontractor' && (
                <div className="grid gap-2 pt-1">
                  <Label>Sub-contractor</Label>
                  <Select value={editSubcontractorId} onValueChange={setEditSubcontractorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a sub-contractor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>
                        {inheritedSubcontractorName
                          ? `Inherit default (${inheritedSubcontractorName})`
                          : 'Unassigned sub-contractor'}
                      </SelectItem>
                      {eligibleSubcontractors.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {inheritedSubcontractorName
                      ? `Leave unset to inherit the default sub-contractor (${inheritedSubcontractorName}). `
                      : ''}
                    Sub-contracted work is tracked for completion but is not assigned to an
                    internal engineer.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="service-email">Client Report Emails (this service)</Label>
              <p className="text-xs text-muted-foreground">
                If set, reports for this service are sent to these addresses instead of the
                site-level reporting emails.
              </p>
              <div className="flex gap-2">
                <Input
                  id="service-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="report@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddEmail()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddEmail}>
                  Add
                </Button>
              </div>
              {editReportingEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {editReportingEmails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => setEditReportingEmails(editReportingEmails.filter((e) => e !== email))}
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
              <Label htmlFor="service-defects-email">Defects to (this service)</Label>
              <p className="text-xs text-muted-foreground">
                If a report contains defects, it is also CC&apos;d to this address — useful for
                sending problems to a different department. Leave blank to use the service
                template default.
              </p>
              <Input
                id="service-defects-email"
                type="email"
                value={editDefectsToEmail}
                onChange={(e) => setEditDefectsToEmail(e.target.value)}
                placeholder="defects@client.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Trash2, Wrench, Loader2, Calendar as CalendarIcon, Edit2, Clock, X, MapPin, MapPinned, User, HardHat } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ServiceType, SiteService, Profile, Task, Route, Area, Subcontractor, WorkerType } from '@/lib/types/database'
import {
  WORKER_TYPE_LABELS,
  allowedMethodsForWorker,
  resolveAssignedEngineerId,
  type AssignmentMethod,
} from '@/lib/assignment'

const NONE_VALUE = '__none__'

interface SiteServicesManagerProps {
  siteId: string
  siteServices: (SiteService & { service_type: ServiceType })[]
  availableServiceTypes: ServiceType[]
  engineers?: Profile[]
  routes?: Route[]
  areas?: Area[]
  subcontractors?: Subcontractor[]
  tasks?: Task[]
  siteStatus?: 'live' | 'dead'
}

export function SiteServicesManager({
  siteId,
  siteServices,
  availableServiceTypes,
  engineers = [],
  routes = [],
  areas = [],
  subcontractors = [],
  tasks = [],
  siteStatus = 'live',
}: SiteServicesManagerProps) {
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([])
  const [addServicesOpen, setAddServicesOpen] = useState(false)
  const [initialVisitDate, setInitialVisitDate] = useState<Date>(new Date())
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Edit service state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFrequencyValue, setEditFrequencyValue] = useState<number>(12)
  const [editFrequencyUnit, setEditFrequencyUnit] = useState<'weeks' | 'months'>('months')
  const [editToleranceDays, setEditToleranceDays] = useState<number>(7)
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
  const [newEmail, setNewEmail] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // One-off task scheduling state
  const [scheduleServiceId, setScheduleServiceId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date())
  const [scheduleEngineerId, setScheduleEngineerId] = useState<string>('')
  const [scheduling, setScheduling] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const isDead = siteStatus === 'dead'

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
      .select('id')

    // Generate a scheduled task for each new service on the visit date.
    // Dead sites never generate tasks.
    if (!isDead && inserted && inserted.length > 0) {
      const taskData = (inserted as { id: string }[]).map((row) => ({
        site_service_id: row.id,
        scheduled_date: visitDateStr,
        status: 'pending' as const,
      }))
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
    setEditToleranceDays(ss.deadline_tolerance_days)
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
    setNewEmail('')
  }

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
        deadline_tolerance_days: editToleranceDays,
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
              This site is marked Dead. No new tasks will be generated until it is set back to Live.
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
                const workerType = (ss.worker_type as WorkerType) || 'cdo'
                const route = ss.route
                const area = ss.area
                const engineer = ss.assigned_engineer
                const subcontractor = ss.subcontractor
                const serviceEmails = Array.isArray(ss.reporting_emails) ? ss.reporting_emails : []
                return (
                  <div
                    key={ss.id}
                    className="flex items-start justify-between p-3 border rounded-lg gap-2 border-l-4"
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
                        {pendingTasks > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {pendingTasks} pending
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>Every {ss.frequency_value} {ss.frequency_unit}</span>
                        <span>•</span>
                        <span>Tolerance: {ss.deadline_tolerance_days} days</span>
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
                        disabled={isDead}
                        onClick={() => {
                          setScheduleServiceId(ss.id)
                          setScheduleDate(new Date())
                          setScheduleEngineerId(ss.assigned_engineer_id || '')
                        }}
                        className="text-primary hover:text-primary"
                        title={isDead ? 'Site is dead — scheduling disabled' : 'Schedule Task'}
                      >
                        <Clock className="h-4 w-4" />
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
        <DialogContent className="max-w-md">
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
                    Tolerance: {st.default_deadline_tolerance_days} days
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Service Task</DialogTitle>
            <DialogDescription>
              Schedule a task for {siteServices.find(ss => ss.id === scheduleServiceId)?.service_type?.name}
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
                  Schedule Task
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

      {/* Edit Service Dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
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

            <div className="grid gap-2">
              <Label htmlFor="tolerance-days">Deadline Tolerance (days)</Label>
              <Input
                id="tolerance-days"
                type="number"
                min={1}
                max={365}
                value={editToleranceDays}
                onChange={(e) => setEditToleranceDays(parseInt(e.target.value) || 7)}
              />
              <p className="text-xs text-muted-foreground">
                How many days after the due date before this service is considered overdue
              </p>
            </div>

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
                      <SelectItem value={NONE_VALUE}>Unassigned sub-contractor</SelectItem>
                      {subcontractors.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
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

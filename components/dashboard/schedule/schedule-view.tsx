'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loadAllMyCalls } from '@/app/(dashboard)/dashboard/schedule/search-actions'
import { CompletedCallsTable } from '@/components/dashboard/reports/completed-calls-table'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatDateUK, formatBookedSlot } from '@/lib/utils'
import { isCallOverdue, getCallTargetDate } from '@/lib/kpi'
import { bookExistingCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SearchMultiSelect } from '@/components/dashboard/schedule/search-multi-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { 
  Calendar,
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarIcon,
  X,
  LayoutGrid,
  List as ListIcon,
  Route as RouteIcon,
  MapPinned,
  HardHat,
  UserPlus,
  Loader2,
  UserCheck,
  ArrowUpDown,
  Eye,
  MapPin,
  Phone,
  User,
  FileText,
  Wrench,
  CalendarClock,
  Navigation,
  PauseCircle,
  BellRing,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Profile, TaskWithDetails, Site, Area, ServiceType, SystemType } from '@/lib/types/database'
import type { CallEstimate } from '@/lib/task-duration'
import { WORKER_TYPE_LABELS } from '@/lib/assignment'
import { SystemIcon, SystemBadge, getSystemColors } from '@/lib/system-types'
import { Building2 } from 'lucide-react'
import { SiteFlagBadges } from '@/components/dashboard/site-info/site-flag-badges'
import { resolveSiteFlags } from '@/lib/site-flags'
import { CallTile } from '@/components/dashboard/calls/call-tile'
import { GridSearch } from '@/components/dashboard/grid-header'
import {
  taskRoute,
  orderRouteCalls,
  dedupeSoonestPerService,
  routeOptionsFromTasks,
  defaultRouteForToday,
} from '@/lib/routes/route-schedule'

type ViewMode = 'grid' | 'list' | 'route' | 'area'
type SortKey = 'date' | 'postcode' | 'nearby'

// Great-circle distance in miles between two coordinates (client-safe, so the
// "nearby" sort can run without hitting the server).
function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

interface ScheduleViewProps {
  tasks: TaskWithDetails[]
  profile: Profile
  engineers?: Profile[]
  /** Which tab to open on mount (e.g. deep-linked from ?tab=completed). */
  initialTab?: string
  /**
   * taskId → "approximate time to complete" estimate (learned average of the
   * last 5 same-type calls, or the manual service-setup expected time). Computed
   * on the server; tasks without a grounded estimate are simply absent.
   */
  estimates?: Record<string, CallEstimate>
  /**
   * Full live service-type / system-type catalogue used to populate the System
   * and Service filters so every type is selectable, even when it currently has
   * no calls in the loaded window. When omitted (e.g. field-role logins that
   * only see their own calls) the filters fall back to task-derived options.
   */
  serviceTypes?: ServiceType[]
  systemTypes?: SystemType[]
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, variant: 'secondary' as const },
  in_progress: { label: 'In Progress', icon: ClipboardCheck, variant: 'default' as const },
  paused: { label: 'Paused', icon: PauseCircle, variant: 'outline' as const },
  completed: { label: 'Completed', icon: CheckCircle2, variant: 'outline' as const },
  cancelled: { label: 'Cancelled', icon: XCircle, variant: 'destructive' as const },
}

/**
 * Inline booking control shown in the call-detail preview for every schedule
 * user (engineers, office and admin) — only weekly recurring PPM calls are
 * excluded. Sets/updates the booked appointment slot on an existing call and can
 * email the site/client a confirmation. Defined at module scope so its form
 * state survives parent re-renders (an inline component would remount and drop
 * input focus).
 */
function BookingEditor({
  task,
  onSaved,
}: {
  task: TaskWithDetails
  onSaved: (fields: { booked_start_time: string | null; booked_end_time: string | null }) => void
}) {
  const alreadyBooked = !!task.booked_start_time
  const [start, setStart] = useState((task.booked_start_time ?? '').slice(0, 5))
  const [end, setEnd] = useState((task.booked_end_time ?? '').slice(0, 5))
  const [sendConfirmation, setSendConfirmation] = useState(!alreadyBooked)
  const [saving, setSaving] = useState(false)

  const save = async (clear = false) => {
    setSaving(true)
    const res = await bookExistingCall({
      taskId: task.id,
      bookedStartTime: clear ? null : start || null,
      bookedEndTime: clear ? null : end || null,
      sendConfirmation: !clear && sendConfirmation,
    })
    setSaving(false)
    if (res.ok) {
      toast.success(clear ? 'Booking cleared' : 'Call booked')
      onSaved({
        booked_start_time: clear ? null : start ? `${start}:00` : null,
        booked_end_time: clear ? null : end ? `${end}:00` : null,
      })
    } else {
      toast.error(res.error ?? 'Could not save the booking.')
    }
  }

  return (
    <div className="space-y-2.5 rounded-md border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {alreadyBooked ? 'Update booking' : 'Book appointment'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor="book-start" className="text-xs text-muted-foreground">
            Start time
          </label>
          <Input
            id="book-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="book-end" className="text-xs text-muted-foreground">
            End time
          </label>
          <Input
            id="book-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={sendConfirmation}
          onCheckedChange={(checked) => setSendConfirmation(checked === true)}
        />
        Email the site &amp; client a booking confirmation
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="flex-1" disabled={saving || !start} onClick={() => save(false)}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {alreadyBooked ? 'Update booking' : 'Book call'}
        </Button>
        {alreadyBooked && (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => save(true)}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

export function ScheduleView({ tasks: baseTasks, profile, engineers = [], initialTab, estimates = {}, serviceTypes = [], systemTypes = [] }: ScheduleViewProps) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  // CDOs work planned routes, so open straight into the grouped "By route" view.
  const [viewMode, setViewMode] = useState<ViewMode>(
    profile.discipline === 'cdo' ? 'route' : 'list',
  )
  // CDO route selector: which route's day is being worked ('all' = every route).
  // Defaults to today's weekday route on first load (see the effect below).
  const [selectedRouteId, setSelectedRouteId] = useState<string>('all')
  const autoRouteRef = useRef(false)
  // Switching to the grouped "By route"/"By area" views does real grouping +
  // sorting work. Run it as a non-blocking transition so the toggle stays
  // responsive (no ~130ms click jank) and the heavier view paints when ready.
  const [isSwitchingView, startViewTransition] = useTransition()
  const selectView = (mode: ViewMode) => startViewTransition(() => setViewMode(mode))
  const [activeTab, setActiveTab] = useState(
    initialTab && ['upcoming', 'overdue', 'completed'].includes(initialTab) ? initialTab : 'upcoming',
  )
  const [sortBy, setSortBy] = useState<SortKey>('date')
  // Engineer's live location, captured on demand for the "nearby" sort.
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // Quick filter: only show calls that must be booked but aren't booked yet.
  const [needsBookingOnly, setNeedsBookingOnly] = useState(false)
  // Quick filter: only show overdue (past scheduled_date, still pending) calls.
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  // Quick filter: only show remedial calls (one-off remedial works raised from a
  // defect or accepted quote). They share a recurring service's type, so the
  // service filter can't isolate them — this can.
  const [remedialOnly, setRemedialOnly] = useState(false)
  const [selectedEngineer, setSelectedEngineer] = useState<string>('all')
  // Multi-select filters: empty array = "all" (no restriction).
  const [selectedSystems, setSelectedSystems] = useState<string[]>([])
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  // Call selected for the read-only "View Call" preview dialog.
  const [viewTask, setViewTask] = useState<TaskWithDetails | null>(null)

  // Engineers/sub-contractors only receive recent completed calls in their
  // initial payload (a 90-day cutoff in schedule/page.tsx keeps the field
  // payload bounded). So the search can still reach OLDER calls, lazily pull
  // their full call history the first time they type a search, then merge it in.
  // Admin/office already load everything, so this never runs for them.
  const cutoffApplies = profile.role === 'engineer' || profile.role === 'subcontractor'
  const [extraTasks, setExtraTasks] = useState<TaskWithDetails[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const loadStarted = useRef(false)

  useEffect(() => {
    if (!cutoffApplies || loadStarted.current) return
    if (search.trim().length < 2) return
    loadStarted.current = true
    setLoadingAll(true)
    loadAllMyCalls()
      .then((res) => {
        if (res.ok && res.tasks) setExtraTasks(res.tasks)
      })
      .catch((err) => {
        console.error('[v0] Failed to load full call history for search:', err)
        // Allow a retry on the next search keystroke.
        loadStarted.current = false
      })
      .finally(() => setLoadingAll(false))
  }, [search, cutoffApplies])

  // Merge the initial (bounded) payload with any lazily-loaded older calls,
  // de-duping by id. This merged list feeds the whole filter/sort pipeline.
  const tasks = useMemo(() => {
    if (extraTasks.length === 0) return baseTasks
    const seen = new Set(baseTasks.map((t) => t.id))
    return [...baseTasks, ...extraTasks.filter((t) => !seen.has(t.id))]
  }, [baseTasks, extraTasks])

  // Bulk assignment state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignTo, setAssignTo] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // The client KPI "complete by" target date drives both the overdue state and
  // the date shown in the grid (weekly/monthly recurring PPM stays tied to the
  // due week/month). Centralised in lib/kpi so grid, tiles and portal all agree.
  const overdueInput = (task: TaskWithDetails) => ({
    scheduledDate: task.scheduled_date,
    status: task.status,
    isRecurring: task.site_service?.service_type?.is_recurring,
    frequencyValue: task.site_service?.frequency_value,
    frequencyUnit: task.site_service?.frequency_unit,
    clientToleranceValue: task.site_service?.client_tolerance_value,
    clientToleranceUnit: task.site_service?.client_tolerance_unit,
    regulatoryToleranceValue: task.site_service?.service_type?.regulatory_tolerance_value,
    regulatoryToleranceUnit: task.site_service?.service_type?.regulatory_tolerance_unit,
  })
  const taskOverdue = (task: TaskWithDetails) => isCallOverdue(overdueInput(task), today)
  const taskTargetDate = (task: TaskWithDetails) => getCallTargetDate(overdueInput(task))

  const isEngineer = profile.role === 'engineer'
  const isAdminOrOffice = profile.role === 'admin' || profile.role === 'office'
  // CDOs perform route-based work, so they keep the "By route" grouping in their
  // engineer view; regular engineers do not.
  const isCdo = profile.discipline === 'cdo'

  // Routes present across the CDO's current calls, ordered by soonest-due call
  // so the "select route" list leads with the most pressing work.
  const routeOptions = useMemo(
    () => (isCdo ? routeOptionsFromTasks(tasks) : []),
    [isCdo, tasks],
  )
  // On first load, pre-select the route named for today's weekday (falling back
  // to the soonest-due route). The CDO can still switch route or pick "All".
  useEffect(() => {
    if (!isCdo || autoRouteRef.current || routeOptions.length === 0) return
    autoRouteRef.current = true
    const def = defaultRouteForToday(routeOptions)
    if (def) setSelectedRouteId(def)
  }, [isCdo, routeOptions])
  // Everyone who works the schedule (engineers, admins and office) can open the
  // read-only call preview — office needs it to review and assign a call.
  // Starting/continuing a call is no longer offered from the schedule; it lives
  // on the task overview page, gated to the assigned engineer.
  const canPreviewCall = isEngineer || isAdminOrOffice

  // System types for the system filter. Seeded from the full live catalogue
  // (so every system is selectable even with no calls in the loaded window) and
  // then unioned with any system present on the current tasks (covers dead
  // systems that still have an active call).
  const systemOptions = (() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const sys of systemTypes) {
      if (sys?.id && !map.has(sys.id)) map.set(sys.id, { id: sys.id, name: sys.name })
    }
    for (const task of tasks) {
      const sys = task.site_service?.service_type?.system_type
      if (sys?.id && !map.has(sys.id)) map.set(sys.id, { id: sys.id, name: sys.name })
    }
    return Array.from(map.values()).sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''))
  })()
  // Service types for the service filter. Seeded from the full live catalogue so
  // every type is selectable, then unioned with types present on the current
  // tasks. Respects the selected system so the two filters narrow together.
  // NOTE: after normalizeTasks all tasks have site_service?.service_type populated,
  // including reactive/emergency calls synthesised from direct_service_type.
  // When filtering by a specific system we must also include service types whose
  // system_type is null/undefined (reactive types with no system classification)
  // so they always appear rather than disappearing when a system is selected.
  const serviceOptions = (() => {
    const map = new Map<string, { id: string; name: string; sysId: string | null }>()
    const add = (id: string | undefined, name: string | undefined, sysId: string | null) => {
      if (!id || map.has(id)) return
      // When systems are selected, show only services belonging to those systems.
      // Services with no system_type are always shown (can't be narrowed by system).
      if (selectedSystems.length > 0 && sysId !== null && !selectedSystems.includes(sysId)) return
      map.set(id, { id, name: name ?? '', sysId })
    }
    for (const svc of serviceTypes) {
      add(svc.id, svc.name, svc.system_type?.id ?? null)
    }
    for (const task of tasks) {
      const svc = task.site_service?.service_type
      add(svc?.id, svc?.name, svc?.system_type?.id ?? null)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()
  // Only admin/office can multi-select and reassign tasks
  const canAssign = isAdminOrOffice && engineers.length > 0
  // Once an engineer has closed (completed) a call it can no longer be
  // reassigned. Cancelled calls are also locked. This is enforced in the UI
  // and by a database trigger.
  const isReassignable = (task: TaskWithDetails) =>
    task.status !== 'completed' && task.status !== 'cancelled'

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleMany = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !assignTo) return
    // Never reassign completed/cancelled calls, even if somehow selected.
    const lockedIds = new Set(
      tasks.filter((t) => !isReassignable(t)).map((t) => t.id),
    )
    const targetIds = Array.from(selectedIds).filter((id) => !lockedIds.has(id))
    if (targetIds.length === 0) {
      toast.error('Completed calls cannot be reassigned')
      return
    }
    setAssigning(true)
    const engineerId = assignTo === 'unassigned' ? null : assignTo
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId })
      .in('id', targetIds)
    setAssigning(false)
    if (!error) {
      clearSelection()
      setAssignTo('')
      router.refresh()
    }
  }

  // Assign an open (unassigned) task to a person directly from the schedule.
  const assignTask = async (taskId: string, engineerId: string) => {
    setAssigningTaskId(taskId)
    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId })
      .eq('id', taskId)
    setAssigningTaskId(null)
    router.refresh()
  }

  // Assign/reassign from the View Call dialog. Updates the local snapshot so the
  // dialog reflects the change immediately, then refreshes the list.
  const assignFromDialog = async (value: string) => {
    if (!viewTask) return
    if (!isReassignable(viewTask)) {
      toast.error('Completed calls cannot be reassigned')
      return
    }
    const engineerId = value === 'unassigned' ? null : value
    setAssigningTaskId(viewTask.id)
    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId })
      .eq('id', viewTask.id)
    const eng = engineers.find((e) => e.id === engineerId) ?? null
    setViewTask({ ...viewTask, assigned_engineer_id: engineerId, assigned_engineer: eng })
    setAssigningTaskId(null)
    router.refresh()
  }

  // Capture the engineer's current location (used by the "nearby" sort). Cached
  // for a minute so repeated sorts don't re-prompt.
  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Location is not supported on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      },
      (err) => {
        setLocating(false)
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it to sort by nearby.'
            : 'Could not get your location. Please try again.',
        )
        // Fall back to date order so the list isn't left empty-feeling.
        setSortBy('date')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const handleSortChange = (value: SortKey) => {
    setSortBy(value)
    if (value === 'nearby' && !userCoords) requestLocation()
  }

  // A call "needs booking" when the site/service requires an advance booking but
  // no slot has been booked yet, and the call is still actionable.
  const taskNeedsBooking = (task: TaskWithDetails) => {
    if (task.booked_start_time) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    return resolveSiteFlags(task.site_service?.site, task.site_service, {
      system: task.site_service?.site_system,
      remedialOpen: task.is_remedial,
    }).booking_required
  }

  const needsBookingCount = tasks.filter(taskNeedsBooking).length
  const remedialCount = tasks.filter((t) => t.is_remedial).length

  // Weekly recurring calls (a recurring service repeating every 1 week, e.g.
  // weekly fire-alarm tests) are too routine to book an individual appointment
  // for, so the booking option is hidden for them.
  const isWeeklyRecurring = (task: TaskWithDetails) => {
    const ss = task.site_service
    return !!ss && ss.frequency_unit === 'weeks' && (ss.frequency_value ?? 1) === 1
  }

  const hasActiveFilters =
    search || selectedEngineer !== 'all' || selectedSystems.length > 0 || selectedServices.length > 0 || dateFrom || dateTo || needsBookingOnly || showOverdueOnly || remedialOnly

  const clearFilters = () => {
    setSearch('')
    setSelectedEngineer('all')
    setSelectedSystems([])
    setSelectedServices([])
    setDateFrom(undefined)
    setDateTo(undefined)
    setNeedsBookingOnly(false)
    setShowOverdueOnly(false)
    setRemedialOnly(false)
  }

  const filteredTasks = tasks.filter((task) => {
    // Text search
    const matchesSearch = !search ||
      task.site_service?.site?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.site_service?.service_type?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.assigned_engineer?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      (task.reference_number ?? task.task_result?.reference_number ?? '').toLowerCase().includes(search.toLowerCase())
    
    // Engineer filter (only for admin/office)
    const matchesEngineer = selectedEngineer === 'all' || 
      (selectedEngineer === 'unassigned' ? !task.assigned_engineer_id : task.assigned_engineer_id === selectedEngineer)

    // Resolve the task's service/system type. Recurring calls carry it on the
    // site_service; reactive/remedial calls anchored straight to a site carry it
    // on the direct_* embeds. Fall back so one-off calls aren't dropped by the
    // service/system filters.
    const directServiceType = (task as { direct_service_type?: { id?: string; system_type?: { id?: string } | null } | null }).direct_service_type
    const resolvedServiceType = task.site_service?.service_type ?? directServiceType ?? null

    // System type filter (multi-select; empty = all)
    const taskSystemId = resolvedServiceType?.system_type?.id
    const matchesSystem = selectedSystems.length === 0 ||
      (!!taskSystemId && selectedSystems.includes(taskSystemId))

    // Service type filter (multi-select; empty = all)
    const taskServiceId = resolvedServiceType?.id
    const matchesService = selectedServices.length === 0 ||
      (!!taskServiceId && selectedServices.includes(taskServiceId))

    // Remedial quick filter — only one-off remedial calls.
    const matchesRemedial = !remedialOnly || !!task.is_remedial
    
    // Date range filter
    const taskDate = new Date(task.scheduled_date)
    const matchesDateFrom = !dateFrom || taskDate >= dateFrom
    const matchesDateTo = !dateTo || taskDate <= dateTo

    // Needs-booking quick filter
    const matchesNeedsBooking = !needsBookingOnly || taskNeedsBooking(task)

    // Overdue quick filter — only pending tasks past their scheduled date.
    const matchesOverdue = !showOverdueOnly || (
      task.status === 'pending' && new Date(task.scheduled_date) < today
    )

    // CDO route selector — narrow to the chosen route's calls ('all' = no limit).
    const matchesRoute =
      !isCdo || selectedRouteId === 'all' || taskRoute(task)?.id === selectedRouteId

    return (
      matchesSearch &&
      matchesEngineer &&
      matchesSystem &&
      matchesService &&
      matchesDateFrom &&
      matchesDateTo &&
      matchesNeedsBooking &&
      matchesOverdue &&
      matchesRemedial &&
      matchesRoute
    )
  })

  // Sort the filtered tasks by the chosen key. This flows through to the
  // upcoming/completed/overdue lists. The route/area grouped views apply their
  // own ordering (route position / site name) on top of this.
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'nearby' && userCoords) {
      const sa = a.site_service?.site
      const sb = b.site_service?.site
      const da =
        sa?.latitude != null && sa?.longitude != null
          ? haversineMiles(userCoords, { latitude: sa.latitude, longitude: sa.longitude })
          : Infinity
      const db =
        sb?.latitude != null && sb?.longitude != null
          ? haversineMiles(userCoords, { latitude: sb.latitude, longitude: sb.longitude })
          : Infinity
      // Sites without coordinates sink to the bottom, then tie-break by date.
      if (da !== db) return da - db
      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    }
    if (sortBy === 'postcode') {
      const pa = a.site_service?.site?.postcode?.trim().toUpperCase() ?? ''
      const pb = b.site_service?.site?.postcode?.trim().toUpperCase() ?? ''
      // Push tasks with no postcode to the bottom
      if (pa && !pb) return -1
      if (!pa && pb) return 1
      if (pa !== pb) return pa.localeCompare(pb)
      // Tie-break by due date so same-postcode work stays date-ordered
      return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    }
    // Default: due date ascending
    return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
  })

  const upcomingTasks = sortedTasks.filter(
    (task) =>
      task.status === 'pending' || task.status === 'in_progress' || task.status === 'paused'
  )
  const completedTasks = sortedTasks.filter((task) => task.status === 'completed')
  const overdueTasks = upcomingTasks.filter((task) => taskOverdue(task))

  // The list is split into Upcoming / Overdue / Completed tabs, so a search hit
  // that lives in a different tab than the one selected would look "missing".
  // When a search is active and the selected tab has no matches, fall through to
  // whichever tab does — so searching (e.g. a completed call's reference number)
  // surfaces the match regardless of the call's status.
  const tabCounts: Record<string, number> = {
    upcoming: upcomingTasks.length,
    overdue: overdueTasks.length,
    completed: completedTasks.length,
  }
  const effectiveTab =
    search.trim() && tabCounts[activeTab] === 0
      ? (['upcoming', 'overdue', 'completed'].find((t) => tabCounts[t] > 0) ?? activeTab)
      : activeTab

  // On the Completed tab, office/admin see the rich "reports" table (its own
  // filters, statuses, margins, email actions) instead of tiles/list. This is
  // the merged Reports view. Engineers/subcontractors never had Reports access,
  // so they keep the tile/list layout for completed calls.
  const showRichCompleted = isAdminOrOffice && effectiveTab === 'completed'

  // Inline control to pick up an open task. Only shown to admin/office for
  // unassigned, still-actionable tasks (e.g. CDO non-route work like dampers).
  const AssignControl = ({ task, className }: { task: TaskWithDetails; className?: string }) => {
    if (!isAdminOrOffice) return null
    if (task.assigned_engineer_id) return null
    if (task.status === 'completed' || task.status === 'cancelled') return null
    if (task.site_service?.worker_type === 'subcontractor') return null
    const busy = assigningTaskId === task.id
    return (
      <div className={cn('flex items-center gap-2', className)} onClick={(e) => e.preventDefault()}>
        <Select disabled={busy} onValueChange={(value) => assignTask(task.id, value)}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Assigning...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Assign to...
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {engineers.map((eng) => (
              <SelectItem key={eng.id} value={eng.id}>
                {eng.full_name || eng.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const TaskCard = ({ task }: { task: TaskWithDetails }) => {
    const isOverdue = taskOverdue(task)
    const system = task.site_service?.service_type?.system_type
    const sysColors = getSystemColors(system?.color)
    const bookedSlot = formatBookedSlot(task.booked_start_time, task.booked_end_time)
    const workerType = task.site_service?.worker_type
    const siteFlags = resolveSiteFlags(task.site_service?.site, task.site_service, {
      system: task.site_service?.site_system,
      remedialOpen: task.is_remedial,
    })
    // Start/Continue is intentionally NOT surfaced here — those actions live on
    // the task overview page and are gated to the assigned user. Grid tiles only
    // navigate (View) and, for admin/office, allow assigning.
    const canView = canPreviewCall && task.status !== 'completed' && task.status !== 'cancelled'

    return (
      <CallTile
        title={task.site_service?.site?.name ?? 'Unknown site'}
        subtitle={
          `${task.site_service?.service_type?.name ?? 'Ad-hoc / reactive'}` +
          (task.visit_type?.name ? ` · ${task.visit_type.name}` : '')
        }
        status={task.status}
        result={task.task_result?.overall_status ?? null}
        reference={task.reference_number ?? task.task_result?.reference_number ?? null}
        scheduledDate={task.scheduled_date}
        completeByDate={taskTargetDate(task)}
        isOverdue={isOverdue}
        engineerName={
          !isEngineer
            ? task.assigned_engineer?.full_name || task.assigned_engineer?.email || ''
            : undefined
        }
        address={task.site_service?.site?.address ?? null}
        approxMinutes={estimates[task.id]?.minutes ?? null}
        approxLearned={estimates[task.id]?.learned}
        approxSampleSize={estimates[task.id]?.sampleSize}
        bookedSlot={bookedSlot}
        showBooking
        isEmergency={task.is_emergency}
        isRemedial={task.is_remedial}
        emergencyAnimated={isEngineer}
        accentColor={!isOverdue ? sysColors.solid : undefined}
        leading={<SystemIcon system={system ?? {}} boxed boxClassName="h-8 w-8 shrink-0" />}
        extraBadges={
          system?.name ? <SystemBadge system={system} className="text-xs font-normal" /> : null
        }
        secondary={
          <div className="flex flex-col gap-2 pt-1">
            {!isEngineer && workerType && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-xs font-normal">
                  {WORKER_TYPE_LABELS[workerType]}
                </Badge>
                {workerType === 'subcontractor' && task.site_service?.subcontractor && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <HardHat className="h-3 w-3" />
                    {task.site_service.subcontractor.name}
                  </Badge>
                )}
              </div>
            )}
            <SiteFlagBadges flags={siteFlags} variant="full" />
            <AssignControl task={task} />
          </div>
        }
        actions={
          canView ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setViewTask(task)}>
              <Eye className="mr-2 h-4 w-4" />
              View Call
            </Button>
          ) : task.status === 'completed' ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/tasks/${task.id}?from=/dashboard/schedule`}>
                View Details
              </Link>
            </Button>
          ) : null
        }
      />
    )
  }

  const TaskRow = ({ task }: { task: TaskWithDetails }) => {
    const config = statusConfig[task.status]
    const isOverdue = taskOverdue(task)
    const actionable =
      canPreviewCall &&
      task.status !== 'completed' &&
      task.status !== 'cancelled'
    const selected = selectedIds.has(task.id)
    const system = task.site_service?.service_type?.system_type
    const sysColors = getSystemColors(system?.color)
    const bookedSlot = formatBookedSlot(task.booked_start_time, task.booked_end_time)

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-l-4 bg-card transition-colors hover:bg-accent',
          isOverdue && 'border-destructive',
          selected && 'border-primary ring-1 ring-primary',
        )}
        style={!isOverdue && !selected ? { borderLeftColor: sysColors.solid } : undefined}
      >
        {canAssign && isReassignable(task) && (
          <div className="pl-2">
            <Checkbox
              checked={selected}
              onCheckedChange={() => toggleOne(task.id)}
              aria-label={`Select call at ${task.site_service?.site?.name}`}
            />
          </div>
        )}
        <Link
          href={`/dashboard/tasks/${task.id}?from=/dashboard/schedule`}
          className={cn('flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5', canAssign && 'pl-0')}
        >
          <SystemIcon system={system ?? {}} className="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isEngineer && task.is_emergency && (
                <BellRing
                  className="h-3.5 w-3.5 shrink-0 animate-pulse text-destructive"
                  role="img"
                  aria-label="Emergency call"
                />
              )}
              <p className="truncate text-sm font-medium leading-tight">{task.site_service?.site?.name}</p>
              {system?.name && (
                <SystemBadge system={system} codeOnly showIcon={false} className="shrink-0 px-1.5 py-0 text-[10px]" />
              )}
              {task.is_remedial && (
                <Badge variant="outline" className="shrink-0 border-destructive/40 px-1.5 py-0 text-[10px] text-destructive">
                  Remedial
                </Badge>
              )}
              {task.follow_up_to_id && (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                  Follow-up
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground leading-tight">
              {(task.reference_number ?? task.task_result?.reference_number) && (
                <span className="font-mono text-foreground">
                  {task.reference_number ?? task.task_result?.reference_number} ·{' '}
                </span>
              )}
              {task.site_service?.service_type?.name}
              {task.visit_type?.name ? ` · ${task.visit_type.name}` : ''}
              {!isEngineer
                ? ` · ${task.assigned_engineer ? (task.assigned_engineer.full_name || task.assigned_engineer.email) : 'Unassigned'}`
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SiteFlagBadges
              flags={resolveSiteFlags(task.site_service?.site, task.site_service, {
                system: task.site_service?.site_system,
                remedialOpen: task.is_remedial,
              })}
              variant="compact"
            />
            {isOverdue && (
              <Badge variant="destructive" className="hidden text-[10px] sm:inline-flex">
                Overdue
              </Badge>
            )}
            {bookedSlot && (
              <Badge className="hidden gap-1 border-transparent bg-emerald-600 text-[10px] text-white hover:bg-emerald-600/90 sm:inline-flex">
                <Clock className="h-3 w-3" />
                Booked
              </Badge>
            )}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {formatDateUK(
                task.status === 'completed'
                  ? task.scheduled_date
                  : (taskTargetDate(task) ?? task.scheduled_date),
              )}
              {bookedSlot ? ` · ${bookedSlot}` : ''}
            </span>
            <Badge variant={config.variant} className="hidden text-[10px] sm:inline-flex">
              {config.label}
            </Badge>
            {actionable && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`View call at ${task.site_service?.site?.name}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setViewTask(task)
                }}
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </Link>
      </div>
    )
  }

  // Group tasks by each service's own route (a site can have some services on
  // a route and others not), ordered by the site's planned position then name.
  const groupByRoute = (list: TaskWithDetails[]) => {
    // The route lives on the site (sites.route_id), inherited by its calls — see
    // taskRoute. For CDOs we also collapse recurring services to their soonest
    // occurrence so a route day never shows the same site twice for different
    // weeks; within a route, calls follow the site's planned visiting order.
    const source = isCdo ? dedupeSoonestPerService(list) : list
    const groups = new Map<string, { name: string; tasks: TaskWithDetails[]; due: number }>()
    for (const task of source) {
      const route = taskRoute(task)
      const key = route?.id ?? 'unassigned'
      const name = route?.name ?? 'No route assigned'
      if (!groups.has(key)) groups.set(key, { name, tasks: [], due: Number.MAX_SAFE_INTEGER })
      groups.get(key)!.tasks.push(task)
    }
    for (const group of groups.values()) {
      group.tasks = orderRouteCalls(group.tasks)
      // A route's "due" date is its soonest call, so routes always line up in
      // the order they need working — never interleaving weeks.
      group.due = group.tasks.reduce((min, t) => {
        const time = new Date(t.scheduled_date).getTime()
        return Number.isNaN(time) ? min : Math.min(min, time)
      }, Number.MAX_SAFE_INTEGER)
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.name === 'No route assigned') return 1
      if (b.name === 'No route assigned') return -1
      if (a.due !== b.due) return a.due - b.due
      return a.name.localeCompare(b.name)
    })
  }

  // Group tasks by each service's area (for non-route engineer/CDO work).
  const groupByArea = (list: TaskWithDetails[]) => {
    const groups = new Map<string, { name: string; tasks: TaskWithDetails[] }>()
    for (const task of list) {
      const area = (task.site_service as { area?: Area | null } | undefined)?.area
      const key = area?.id ?? 'unassigned'
      const name = area?.name ?? 'No area assigned'
      if (!groups.has(key)) groups.set(key, { name, tasks: [] })
      groups.get(key)!.tasks.push(task)
    }
    for (const group of groups.values()) {
      group.tasks.sort((a, b) => {
        const sa = a.site_service?.site as Site | undefined
        const sb = b.site_service?.site as Site | undefined
        return (sa?.name ?? '').localeCompare(sb?.name ?? '')
      })
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.name === 'No area assigned') return 1
      if (b.name === 'No area assigned') return -1
      return a.name.localeCompare(b.name)
    })
  }

  const EmptyState = ({ icon: Icon, label }: { icon: typeof ClipboardCheck; label: string }) => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Icon className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )

  const renderTasks = (list: TaskWithDetails[], emptyLabel: string) => {
    if (list.length === 0) {
      return <EmptyState icon={activeTab === 'completed' ? CheckCircle2 : ClipboardCheck} label={emptyLabel} />
    }
    if (viewMode === 'list') {
      const ids = list.filter(isReassignable).map((t) => t.id)
      const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            {canAssign ? (
              <label className="flex items-center gap-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleMany(ids, checked === true)}
                  aria-label="Select all calls"
                />
                Select all
              </label>
            ) : (
              <span />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {ids.length} {ids.length === 1 ? 'call' : 'calls'}
            </span>
          </div>
          {list.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )
    }
    if (viewMode === 'route' || viewMode === 'area') {
      const groups = viewMode === 'route' ? groupByRoute(list) : groupByArea(list)
      const GroupIcon = viewMode === 'route' ? RouteIcon : MapPinned
      return (
        <div className="space-y-6">
          {groups.map((group) => {
            const groupIds = group.tasks.filter(isReassignable).map((t) => t.id)
            const allGroupSelected =
              groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))
            return (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center gap-2">
                {canAssign && (
                  <Checkbox
                    checked={allGroupSelected}
                    onCheckedChange={(checked) => toggleMany(groupIds, checked === true)}
                    aria-label={`Select all calls on ${group.name}`}
                  />
                )}
                <GroupIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{group.name}</h3>
                <Badge variant="secondary" className="text-xs">
                  {group.tasks.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {group.tasks.map((task, idx) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-right text-xs font-medium text-muted-foreground">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <TaskRow task={task} />
                      <AssignControl task={task} className="pl-1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    )
  }

  // Engineers get a slimmed-down toggle: no Grid, no "By area", and "By route"
  // only for CDOs (who do route-based work). Admin/office keep every option.
  const viewModeOptions = isEngineer
    ? [
        { mode: 'list' as const, icon: ListIcon, label: 'List' },
        ...(isCdo ? [{ mode: 'route' as const, icon: RouteIcon, label: 'By route' }] : []),
      ]
    : [
        { mode: 'grid' as const, icon: LayoutGrid, label: 'Grid' },
        { mode: 'list' as const, icon: ListIcon, label: 'List' },
        { mode: 'route' as const, icon: RouteIcon, label: 'By route' },
        { mode: 'area' as const, icon: MapPinned, label: 'By area' },
      ]

  // With a single option there is nothing to toggle, so hide the control.
  const viewToggle = viewModeOptions.length < 2 ? null : (
    <div className="flex items-center rounded-md border p-0.5">
      {viewModeOptions.map(({ mode, icon: Icon, label }) => (
        <Button
          key={mode}
          type="button"
          variant={viewMode === mode ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1.5 px-2 sm:px-2.5"
          onClick={() => selectView(mode)}
          aria-pressed={viewMode === mode}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  )

  // Shared Upcoming / Overdue / Completed switcher. Rendered centred in the
  // filter row (normal mode) or standalone above the rich Completed table.
  const tabTriggers = (
    <TabsList>
      <TabsTrigger value="upcoming" className="gap-1.5">
        Upcoming
        <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums">
          {upcomingTasks.length}
        </span>
      </TabsTrigger>
      {overdueTasks.length > 0 && (
        <TabsTrigger value="overdue" className="gap-1.5 text-destructive data-[state=active]:text-destructive">
          Overdue
          <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-destructive">
            {overdueTasks.length}
          </span>
        </TabsTrigger>
      )}
      <TabsTrigger value="completed" className="gap-1.5">
        Completed
        <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums">
          {completedTasks.length}
        </span>
      </TabsTrigger>
    </TabsList>
  )

  return (
    <div className="space-y-2">
      {/* The shared schedule toolbar is hidden on the rich Completed table,
          which carries its own search + filters. */}
      <Tabs value={effectiveTab} onValueChange={setActiveTab}>
      {!showRichCompleted ? (
        <>
      {/* Row 1: search | quick-filter pill buttons | engineer select | dates | clear */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        <GridSearch
          value={search}
          onChange={setSearch}
          placeholder="Search calls or ref number..."
          className="shrink-0 w-[200px] max-w-none sm:w-[240px]"
        />

        {loadingAll && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching all calls...
          </span>
        )}

        {/* CDO route selector — defaults to today's weekday route, and narrows
            the schedule to that route's calls in planned visiting order. */}
        {isCdo && routeOptions.length > 0 && (
          <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
            <SelectTrigger className="w-[180px] shrink-0">
              <RouteIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Select route" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {routeOptions.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(needsBookingCount > 0 || needsBookingOnly) && (
          <Button
            type="button"
            variant={needsBookingOnly ? 'default' : 'outline'}
            onClick={() => setNeedsBookingOnly((v) => !v)}
            aria-pressed={needsBookingOnly}
            className="gap-1.5 shrink-0"
          >
            <CalendarClock className="h-4 w-4" />
            {isEngineer ? 'To book' : 'Needs booking'}
            <Badge
              variant={needsBookingOnly ? 'secondary' : 'outline'}
              className="ml-0.5 px-1.5 py-0"
            >
              {needsBookingCount}
            </Badge>
          </Button>
        )}

        {(overdueTasks.length > 0 || showOverdueOnly) && (
          <Button
            type="button"
            variant={showOverdueOnly ? 'destructive' : 'outline'}
            onClick={() => setShowOverdueOnly((v) => !v)}
            aria-pressed={showOverdueOnly}
            className="gap-1.5 shrink-0"
          >
            <Clock className="h-4 w-4" />
            Overdue
            <Badge
              variant={showOverdueOnly ? 'secondary' : 'destructive'}
              className="ml-0.5 px-1.5 py-0"
            >
              {overdueTasks.length}
            </Badge>
          </Button>
        )}

        {(remedialCount > 0 || remedialOnly) && (
          <Button
            type="button"
            variant={remedialOnly ? 'default' : 'outline'}
            onClick={() => setRemedialOnly((v) => !v)}
            aria-pressed={remedialOnly}
            className="gap-1.5 shrink-0"
          >
            <Wrench className="h-4 w-4" />
            Remedial
            <Badge
              variant={remedialOnly ? 'secondary' : 'outline'}
              className="ml-0.5 px-1.5 py-0"
            >
              {remedialCount}
            </Badge>
          </Button>
        )}

        {isAdminOrOffice && engineers.length > 0 && (
          <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
            <SelectTrigger className="w-[160px] shrink-0">
              <SelectValue placeholder="All Engineers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Engineers</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {engineers.map((eng) => (
                <SelectItem key={eng.id} value={eng.id}>
                  {eng.full_name || eng.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range — admin/office only */}
        {!isEngineer && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[120px] shrink-0 justify-start text-left font-normal',
                    !dateFrom && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[120px] shrink-0 justify-start text-left font-normal',
                    !dateTo && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {dateTo ? format(dateTo, 'dd/MM/yy') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
              </PopoverContent>
            </Popover>
          </>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Row 2: system/service selects | → sort + view toggle */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {systemOptions.length > 0 && (
          <div className="w-[160px] shrink-0">
            <SearchMultiSelect
              values={selectedSystems}
              onChange={(vals) => {
                setSelectedSystems(vals)
                // Drop any selected services that no longer belong to the chosen
                // systems so the two filters stay consistent.
                if (vals.length > 0) {
                  setSelectedServices((prev) =>
                    prev.filter((svcId) => {
                      const opt = serviceOptions.find((s) => s.id === svcId)
                      return !opt || opt.sysId === null || vals.includes(opt.sysId)
                    }),
                  )
                }
              }}
              options={systemOptions.map((sys) => ({ value: sys.id, label: sys.name }))}
              placeholder="All Systems"
              searchPlaceholder="Search systems…"
              emptyText="No systems found."
            />
          </div>
        )}

        {serviceOptions.length > 1 && (
          <div className="w-[160px] shrink-0">
            <SearchMultiSelect
              values={selectedServices}
              onChange={setSelectedServices}
              options={serviceOptions.map((svc) => ({ value: svc.id, label: svc.name }))}
              placeholder="All Services"
              searchPlaceholder="Search services…"
              emptyText="No services found."
            />
          </div>
        )}

        {/* Centre: Upcoming / Overdue / Completed switcher, in line with filters */}
        <div className="mx-auto flex shrink-0 items-center justify-center">
          {tabTriggers}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortKey)}>
            <SelectTrigger className="w-[140px]">
              {locating ? (
                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Due date</SelectItem>
              <SelectItem value="postcode">Postcode</SelectItem>
              <SelectItem value="nearby">
                <span className="flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5" />
                  Nearby
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          {viewToggle}
        </div>
      </div>
        </>
      ) : (
        // Rich Completed table hides the toolbar; keep the tab switcher so the
        // user can navigate back to Upcoming / Overdue.
        <div className="mb-3">{tabTriggers}</div>
      )}

      <div
        className={
          isSwitchingView ? 'opacity-60 transition-opacity duration-150' : 'transition-opacity'
        }
      >
        <TabsContent value="upcoming" className="mt-4">
          {renderTasks(upcomingTasks, 'No upcoming calls')}
        </TabsContent>

        <TabsContent value="overdue" className="mt-4">
          {renderTasks(overdueTasks, 'No overdue calls')}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {showRichCompleted ? (
            <CompletedCallsTable embedded />
          ) : (
            renderTasks(completedTasks, 'No completed calls')
          )}
        </TabsContent>
      </div>
      </Tabs>

      {canAssign && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-lg">
            <span className="flex items-center gap-2 text-sm font-medium">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              {selectedIds.size} selected
            </span>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Assign to engineer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {engineers.map((eng) => (
                  <SelectItem key={eng.id} value={eng.id}>
                    {eng.full_name || eng.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleBulkAssign} disabled={!assignTo || assigning} size="sm">
              {assigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="ml-auto gap-2"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!viewTask} onOpenChange={(open) => !open && setViewTask(null)}>
        {/* Don't auto-focus on open: the first focusable element is the booking
            "Start time" input (type="time"), and focusing it makes the browser
            pop its time-picker clock the moment you open the read-only preview. */}
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {viewTask && (() => {
            const site = viewTask.site_service?.site
            const config = statusConfig[viewTask.status]
            const StatusIcon = config.icon
            const slot = formatBookedSlot(viewTask.booked_start_time, viewTask.booked_end_time)
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <DialogTitle className="flex items-center gap-2">
                        <SystemIcon
                          system={viewTask.site_service?.service_type?.system_type ?? {}}
                          className="h-5 w-5"
                        />
                        <span className="truncate">{site?.name}</span>
                      </DialogTitle>
                      <DialogDescription>
                        {viewTask.site_service?.service_type?.name}
                        {viewTask.visit_type?.name ? ` · ${viewTask.visit_type.name}` : ''}
                      </DialogDescription>
                    </div>
                    <Badge variant={config.variant} className="flex shrink-0 items-center gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDateUK(viewTask.scheduled_date)}
                    </div>
                    {slot ? (
                      <Badge className="gap-1 border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
                        <Clock className="h-3 w-3" />
                        Booked · {slot}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Not booked
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                    {viewTask.site_service?.service_type?.system_type && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">System</span>
                        <SystemBadge system={viewTask.site_service.service_type.system_type} />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Service</span>
                      <span className="text-right font-medium">
                        {viewTask.site_service?.service_type?.name ?? '—'}
                        {viewTask.visit_type?.name ? ` · ${viewTask.visit_type.name}` : ''}
                      </span>
                    </div>
                    {(viewTask.client?.name || site?.client?.name) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Client</span>
                        <span className="inline-flex items-center gap-1.5 text-right font-medium">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {viewTask.client?.name ?? site?.client?.name}
                        </span>
                      </div>
                    )}
                  </div>

                  {isAdminOrOffice && engineers.length > 0 && !isReassignable(viewTask) && (
                    <p className="flex items-center gap-1.5 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      <UserPlus className="h-3.5 w-3.5 shrink-0" />
                      {viewTask.status === 'completed'
                        ? 'This call has been completed and can no longer be reassigned.'
                        : 'Cancelled calls can no longer be reassigned.'}
                    </p>
                  )}

                  {isAdminOrOffice && engineers.length > 0 && isReassignable(viewTask) && (
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <UserPlus className="h-3.5 w-3.5" />
                        Assign engineer
                      </p>
                      <Select
                        value={viewTask.assigned_engineer_id ?? 'unassigned'}
                        onValueChange={assignFromDialog}
                        disabled={assigningTaskId === viewTask.id}
                      >
                        <SelectTrigger>
                          {assigningTaskId === viewTask.id ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                            </span>
                          ) : (
                            <SelectValue placeholder="Assign to..." />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {engineers.map((eng) => (
                            <SelectItem key={eng.id} value={eng.id}>
                              {eng.full_name || eng.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Every schedule user (engineers included) can book an
                      appointment slot for a call — the only exception is weekly
                      recurring PPM calls, which are too routine to book
                      individually and show a notice instead. */}
                  {canPreviewCall &&
                    (isWeeklyRecurring(viewTask) ? (
                      <p className="flex items-center gap-1.5 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        Weekly recurring calls don&apos;t require an individual booking.
                      </p>
                    ) : (
                      <BookingEditor
                        key={viewTask.id}
                        task={viewTask}
                        onSaved={(fields) => {
                          setViewTask({ ...viewTask, ...fields })
                          router.refresh()
                        }}
                      />
                    ))}

                  {site?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>
                        {site.address}
                        {site.postcode ? `, ${site.postcode}` : ''}
                      </span>
                    </div>
                  )}

                  {site?.contact_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{site.contact_name}</span>
                    </div>
                  )}

                  {site?.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <a href={`tel:${site.contact_phone}`} className="text-primary hover:underline">
                        {site.contact_phone}
                      </a>
                    </div>
                  )}

                  {!isEngineer && viewTask.site_service?.worker_type && (
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{WORKER_TYPE_LABELS[viewTask.site_service.worker_type]}</span>
                    </div>
                  )}

                  {viewTask.notes && (
                    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Call notes</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{viewTask.notes}</p>
                      </div>
                    </div>
                  )}

                  {site?.notes && (
                    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Site notes</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{site.notes}</p>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => setViewTask(null)}>
                    Close
                  </Button>
                  {/* Navigation only — starting/continuing a call happens on the task
                      overview page, gated to the assigned engineer. */}
                  <Button asChild>
                    <Link href={`/dashboard/tasks/${viewTask.id}?from=/dashboard/schedule`}>
                      Open call
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

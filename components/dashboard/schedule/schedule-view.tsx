'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatDateUK, formatBookedSlot } from '@/lib/utils'
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
  Search,
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
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Profile, TaskWithDetails, Site, Route, Area } from '@/lib/types/database'
import { WORKER_TYPE_LABELS } from '@/lib/assignment'
import { SystemIcon, SystemBadge, getSystemColors } from '@/lib/system-types'
import { Building2 } from 'lucide-react'
import { SiteFlagBadges } from '@/components/dashboard/site-info/site-flag-badges'
import { resolveSiteFlags } from '@/lib/site-flags'

type ViewMode = 'grid' | 'list' | 'route' | 'area'

interface ScheduleViewProps {
  tasks: TaskWithDetails[]
  profile: Profile
  engineers?: Profile[]
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, variant: 'secondary' as const },
  in_progress: { label: 'In Progress', icon: ClipboardCheck, variant: 'default' as const },
  completed: { label: 'Completed', icon: CheckCircle2, variant: 'outline' as const },
  cancelled: { label: 'Cancelled', icon: XCircle, variant: 'destructive' as const },
}

export function ScheduleView({ tasks, profile, engineers = [] }: ScheduleViewProps) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeTab, setActiveTab] = useState('upcoming')
  const [sortBy, setSortBy] = useState<'date' | 'postcode'>('date')
  const [selectedEngineer, setSelectedEngineer] = useState<string>('all')
  const [selectedSystem, setSelectedSystem] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  // Call selected for the read-only "View Call" preview dialog.
  const [viewTask, setViewTask] = useState<TaskWithDetails | null>(null)

  // Bulk assignment state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignTo, setAssignTo] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isEngineer = profile.role === 'engineer'
  const isAdminOrOffice = profile.role === 'admin' || profile.role === 'office'

  // Unique system types present across the current calls, for the system filter.
  const systemOptions = Array.from(
    tasks.reduce((map, task) => {
      const sys = task.site_service?.service_type?.system_type
      if (sys?.id && !map.has(sys.id)) map.set(sys.id, sys)
      return map
    }, new Map<string, NonNullable<NonNullable<NonNullable<TaskWithDetails['site_service']>['service_type']>['system_type']>>()).values()
  ).sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''))
  // Only admin/office can multi-select and reassign tasks
  const canAssign = isAdminOrOffice && engineers.length > 0

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
    setAssigning(true)
    const engineerId = assignTo === 'unassigned' ? null : assignTo
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId })
      .in('id', Array.from(selectedIds))
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

  const hasActiveFilters = search || selectedEngineer !== 'all' || selectedSystem !== 'all' || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setSelectedEngineer('all')
    setSelectedSystem('all')
    setDateFrom(undefined)
    setDateTo(undefined)
  }

  const filteredTasks = tasks.filter((task) => {
    // Text search
    const matchesSearch = !search ||
      task.site_service?.site?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.site_service?.service_type?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.assigned_engineer?.full_name?.toLowerCase().includes(search.toLowerCase())
    
    // Engineer filter (only for admin/office)
    const matchesEngineer = selectedEngineer === 'all' || 
      (selectedEngineer === 'unassigned' ? !task.assigned_engineer_id : task.assigned_engineer_id === selectedEngineer)

    // System type filter
    const matchesSystem = selectedSystem === 'all' ||
      task.site_service?.service_type?.system_type?.id === selectedSystem
    
    // Date range filter
    const taskDate = new Date(task.scheduled_date)
    const matchesDateFrom = !dateFrom || taskDate >= dateFrom
    const matchesDateTo = !dateTo || taskDate <= dateTo

    return matchesSearch && matchesEngineer && matchesSystem && matchesDateFrom && matchesDateTo
  })

  // Sort the filtered tasks by the chosen key. This flows through to the
  // upcoming/completed/overdue lists. The route/area grouped views apply their
  // own ordering (route position / site name) on top of this.
  const sortedTasks = [...filteredTasks].sort((a, b) => {
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
    (task) => task.status === 'pending' || task.status === 'in_progress'
  )
  const completedTasks = sortedTasks.filter((task) => task.status === 'completed')
  const overdueTasks = upcomingTasks.filter(
    (task) => new Date(task.scheduled_date) < today && task.status === 'pending'
  )

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
    const config = statusConfig[task.status]
    const Icon = config.icon
    const taskDate = new Date(task.scheduled_date)
    const isOverdue = taskDate < today && task.status === 'pending'
    const system = task.site_service?.service_type?.system_type
    const sysColors = getSystemColors(system?.color)

    return (
      <Card
        className={cn('border-l-4', isOverdue && 'border-destructive')}
        style={!isOverdue ? { borderLeftColor: sysColors.solid } : undefined}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <SystemIcon system={system ?? {}} boxed boxClassName="h-9 w-9 shrink-0" />
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {task.site_service?.site?.name}
                  {system?.name && (
                    <SystemBadge system={system} className="text-xs font-normal" />
                  )}
                </CardTitle>
                <CardDescription>
                  {task.site_service?.service_type?.name}
                  {task.visit_type?.name ? ` · ${task.visit_type.name}` : ''}
                </CardDescription>
              </div>
            </div>
            <Badge variant={config.variant} className="flex shrink-0 items-center gap-1">
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {task.site_service?.site?.address}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatDateUK(task.scheduled_date)}
              </div>
              {formatBookedSlot(task.booked_start_time, task.booked_end_time) && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatBookedSlot(task.booked_start_time, task.booked_end_time)}
                </div>
              )}
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Overdue
                </Badge>
              )}
            </div>
            {!isEngineer && task.site_service?.worker_type && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-xs font-normal">
                  {WORKER_TYPE_LABELS[task.site_service.worker_type]}
                </Badge>
                {task.site_service.worker_type === 'subcontractor' && task.site_service.subcontractor && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <HardHat className="h-3 w-3" />
                    {task.site_service.subcontractor.name}
                  </Badge>
                )}
              </div>
            )}
            {!isEngineer && task.assigned_engineer && (
              <p className="text-sm">
                <span className="text-muted-foreground">Engineer: </span>
                {task.assigned_engineer.full_name || task.assigned_engineer.email}
              </p>
            )}
            <SiteFlagBadges
              flags={resolveSiteFlags(task.site_service?.site, task.site_service, {
                remedialOpen: task.is_remedial,
              })}
              variant="full"
              className="pt-1"
            />
          </div>
          <AssignControl task={task} className="mt-4" />
          {(isEngineer || profile.role === 'admin') && task.status !== 'completed' && task.status !== 'cancelled' && (
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                size="sm"
                onClick={() => setViewTask(task)}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Call
              </Button>
              <Button asChild className="flex-1" size="sm">
                <Link href={`/dashboard/tasks/${task.id}?from=/dashboard/schedule`}>
                  {task.status === 'pending' ? 'Start Task' : 'Continue Task'}
                </Link>
              </Button>
            </div>
          )}
          {task.status === 'completed' && (
            <Button asChild variant="outline" className="w-full mt-4" size="sm">
              <Link href={`/dashboard/tasks/${task.id}?from=/dashboard/schedule`}>
                View Details
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const TaskRow = ({ task }: { task: TaskWithDetails }) => {
    const config = statusConfig[task.status]
    const taskDate = new Date(task.scheduled_date)
    const isOverdue = taskDate < today && task.status === 'pending'
    const actionable =
      (isEngineer || profile.role === 'admin') &&
      task.status !== 'completed' &&
      task.status !== 'cancelled'
    const selected = selectedIds.has(task.id)
    const system = task.site_service?.service_type?.system_type
    const sysColors = getSystemColors(system?.color)

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-l-4 bg-card transition-colors hover:bg-accent',
          isOverdue && 'border-destructive',
          selected && 'border-primary ring-1 ring-primary',
        )}
        style={!isOverdue && !selected ? { borderLeftColor: sysColors.solid } : undefined}
      >
        {canAssign && (
          <div className="pl-2">
            <Checkbox
              checked={selected}
              onCheckedChange={() => toggleOne(task.id)}
              aria-label={`Select task at ${task.site_service?.site?.name}`}
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
              <p className="truncate text-sm font-medium leading-tight">{task.site_service?.site?.name}</p>
              {system?.name && (
                <SystemBadge system={system} codeOnly showIcon={false} className="shrink-0 px-1.5 py-0 text-[10px]" />
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground leading-tight">
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
                remedialOpen: task.is_remedial,
              })}
              variant="compact"
            />
            {isOverdue && (
              <Badge variant="destructive" className="hidden text-[10px] sm:inline-flex">
                Overdue
              </Badge>
            )}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {formatDateUK(task.scheduled_date)}
              {formatBookedSlot(task.booked_start_time, task.booked_end_time)
                ? ` · ${formatBookedSlot(task.booked_start_time, task.booked_end_time)}`
                : ''}
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
            {actionable && (
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 gap-1.5 font-semibold"
                aria-label={`${task.status === 'pending' ? 'Start' : 'Continue'} call at ${task.site_service?.site?.name}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  router.push(`/dashboard/tasks/${task.id}?from=/dashboard/schedule`)
                }}
              >
                <Wrench className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {task.status === 'pending' ? 'Start Task' : 'Continue'}
                </span>
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
    const groups = new Map<string, { name: string; tasks: TaskWithDetails[] }>()
    for (const task of list) {
      const route = (task.site_service as { route?: Route | null } | undefined)?.route
      const key = route?.id ?? 'unassigned'
      const name = route?.name ?? 'No route assigned'
      if (!groups.has(key)) groups.set(key, { name, tasks: [] })
      groups.get(key)!.tasks.push(task)
    }
    // Sort tasks within each route by the site's planned position, then name
    for (const group of groups.values()) {
      group.tasks.sort((a, b) => {
        const sa = a.site_service?.site as Site | undefined
        const sb = b.site_service?.site as Site | undefined
        const pa = sa?.route_position ?? Number.MAX_SAFE_INTEGER
        const pb = sb?.route_position ?? Number.MAX_SAFE_INTEGER
        if (pa !== pb) return pa - pb
        return (sa?.name ?? '').localeCompare(sb?.name ?? '')
      })
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.name === 'No route assigned') return 1
      if (b.name === 'No route assigned') return -1
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
      const ids = list.map((t) => t.id)
      const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            {canAssign ? (
              <label className="flex items-center gap-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleMany(ids, checked === true)}
                  aria-label="Select all tasks"
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
            const groupIds = group.tasks.map((t) => t.id)
            const allGroupSelected =
              groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))
            return (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center gap-2">
                {canAssign && (
                  <Checkbox
                    checked={allGroupSelected}
                    onCheckedChange={(checked) => toggleMany(groupIds, checked === true)}
                    aria-label={`Select all tasks on ${group.name}`}
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

  const viewToggle = (
    <div className="flex items-center rounded-md border p-0.5">
      {(
        [
          { mode: 'grid' as const, icon: LayoutGrid, label: 'Grid' },
          { mode: 'list' as const, icon: ListIcon, label: 'List' },
          { mode: 'route' as const, icon: RouteIcon, label: 'By route' },
          { mode: 'area' as const, icon: MapPinned, label: 'By area' },
        ]
      ).map(({ mode, icon: Icon, label }) => (
        <Button
          key={mode}
          type="button"
          variant={viewMode === mode ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          onClick={() => setViewMode(mode)}
          aria-pressed={viewMode === mode}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isAdminOrOffice && engineers.length > 0 && (
          <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Engineer" />
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

        {systemOptions.length > 0 && (
          <Select value={selectedSystem} onValueChange={setSelectedSystem}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="System" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Systems</SelectItem>
              {systemOptions.map((sys) => (
                <SelectItem key={sys.id} value={sys.id}>
                  <span className="flex items-center gap-2">
                    <SystemIcon system={sys} className="h-3.5 w-3.5" />
                    {sys.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range filtering is for admin/office planning only; engineers just
            see their own upcoming/overdue/completed lists without date pickers. */}
        {!isEngineer && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'postcode')}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Due date</SelectItem>
              <SelectItem value="postcode">Postcode</SelectItem>
            </SelectContent>
          </Select>
          {viewToggle}
        </div>
      </div>

      {viewMode === 'grid' && overdueTasks.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Overdue Tasks ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {overdueTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {renderTasks(
            viewMode === 'grid'
              ? upcomingTasks.filter((t) => !overdueTasks.includes(t))
              : upcomingTasks,
            'No upcoming tasks',
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {renderTasks(completedTasks, 'No completed tasks')}
        </TabsContent>
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {viewTask && (() => {
            const site = viewTask.site_service?.site
            const config = statusConfig[viewTask.status]
            const StatusIcon = config.icon
            const slot = formatBookedSlot(viewTask.booked_start_time, viewTask.booked_end_time)
            const canStart = viewTask.status !== 'completed' && viewTask.status !== 'cancelled'
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
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDateUK(viewTask.scheduled_date)}
                    </div>
                    {slot && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {slot}
                      </div>
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

                  {isAdminOrOffice && engineers.length > 0 && (
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
                  {(isEngineer || profile.role === 'admin') && canStart && (
                    <Button asChild>
              <Link href={`/dashboard/tasks/${viewTask.id}?from=/dashboard/schedule`}>
                {viewTask.status === 'pending' ? 'Start Call' : 'Continue Call'}
                      </Link>
                    </Button>
                  )}
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

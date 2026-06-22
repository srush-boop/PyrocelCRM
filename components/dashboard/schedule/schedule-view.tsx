'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatDateUK } from '@/lib/utils'
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
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Profile, TaskWithDetails, Site, Route } from '@/lib/types/database'

type ViewMode = 'grid' | 'list' | 'route'

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
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [activeTab, setActiveTab] = useState('upcoming')
  const [selectedEngineer, setSelectedEngineer] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isEngineer = profile.role === 'engineer'
  const isAdminOrOffice = profile.role === 'admin' || profile.role === 'office'

  const hasActiveFilters = search || selectedEngineer !== 'all' || dateFrom || dateTo

  const clearFilters = () => {
    setSearch('')
    setSelectedEngineer('all')
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
    
    // Date range filter
    const taskDate = new Date(task.scheduled_date)
    const matchesDateFrom = !dateFrom || taskDate >= dateFrom
    const matchesDateTo = !dateTo || taskDate <= dateTo

    return matchesSearch && matchesEngineer && matchesDateFrom && matchesDateTo
  })

  const upcomingTasks = filteredTasks.filter(
    (task) => task.status === 'pending' || task.status === 'in_progress'
  )
  const completedTasks = filteredTasks.filter((task) => task.status === 'completed')
  const overdueTasks = upcomingTasks.filter(
    (task) => new Date(task.scheduled_date) < today && task.status === 'pending'
  )

  const TaskCard = ({ task }: { task: TaskWithDetails }) => {
    const config = statusConfig[task.status]
    const Icon = config.icon
    const taskDate = new Date(task.scheduled_date)
    const isOverdue = taskDate < today && task.status === 'pending'

    return (
      <Card className={isOverdue ? 'border-destructive' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">
                {task.site_service?.site?.name}
              </CardTitle>
              <CardDescription>
                {task.site_service?.service_type?.name}
              </CardDescription>
            </div>
            <Badge variant={config.variant} className="flex items-center gap-1">
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
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Overdue
                </Badge>
              )}
            </div>
            {!isEngineer && task.assigned_engineer && (
              <p className="text-sm">
                <span className="text-muted-foreground">Engineer: </span>
                {task.assigned_engineer.full_name || task.assigned_engineer.email}
              </p>
            )}
          </div>
          {(isEngineer || profile.role === 'admin') && task.status !== 'completed' && task.status !== 'cancelled' && (
            <Button asChild className="w-full mt-4" size="sm">
              <Link href={`/dashboard/tasks/${task.id}`}>
                {task.status === 'pending' ? 'Start Task' : 'Continue Task'}
              </Link>
            </Button>
          )}
          {task.status === 'completed' && (
            <Button asChild variant="outline" className="w-full mt-4" size="sm">
              <Link href={`/dashboard/tasks/${task.id}`}>
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
    const Icon = config.icon
    const taskDate = new Date(task.scheduled_date)
    const isOverdue = taskDate < today && task.status === 'pending'
    const actionable =
      (isEngineer || profile.role === 'admin') &&
      task.status !== 'completed' &&
      task.status !== 'cancelled'

    return (
      <Link
        href={`/dashboard/tasks/${task.id}`}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent',
          isOverdue && 'border-destructive',
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.site_service?.site?.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {task.site_service?.service_type?.name}
            {!isEngineer && task.assigned_engineer
              ? ` · ${task.assigned_engineer.full_name || task.assigned_engineer.email}`
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isOverdue && (
            <Badge variant="destructive" className="hidden text-xs sm:inline-flex">
              Overdue
            </Badge>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatDateUK(task.scheduled_date)}
          </span>
          <Badge variant={config.variant} className="text-xs">
            {config.label}
          </Badge>
          {actionable && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </Link>
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
      return (
        <div className="space-y-2">
          {list.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )
    }
    if (viewMode === 'route') {
      return (
        <div className="space-y-6">
          {groupByRoute(list).map((group) => (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
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
                    <div className="flex-1">
                      <TaskRow task={task} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}

        <div className="ml-auto">{viewToggle}</div>
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
    </div>
  )
}

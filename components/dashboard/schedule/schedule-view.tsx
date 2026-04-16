'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { 
  Calendar,
  Search,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react'
import type { Profile, TaskWithDetails } from '@/lib/types/database'

interface ScheduleViewProps {
  tasks: TaskWithDetails[]
  profile: Profile
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, variant: 'secondary' as const },
  in_progress: { label: 'In Progress', icon: ClipboardCheck, variant: 'default' as const },
  completed: { label: 'Completed', icon: CheckCircle2, variant: 'outline' as const },
  cancelled: { label: 'Cancelled', icon: XCircle, variant: 'destructive' as const },
}

export function ScheduleView({ tasks, profile }: ScheduleViewProps) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('upcoming')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.site_service?.site?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.site_service?.service_type?.name.toLowerCase().includes(search.toLowerCase()) ||
      task.assigned_engineer?.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  const upcomingTasks = filteredTasks.filter(
    (task) => task.status === 'pending' || task.status === 'in_progress'
  )
  const completedTasks = filteredTasks.filter((task) => task.status === 'completed')
  const overdueTasks = upcomingTasks.filter(
    (task) => new Date(task.scheduled_date) < today && task.status === 'pending'
  )

  const isEngineer = profile.role === 'engineer'

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
                {taskDate.toLocaleDateString()}
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {overdueTasks.length > 0 && (
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
          {upcomingTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No upcoming tasks</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingTasks
                .filter((t) => !overdueTasks.includes(t))
                .map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No completed tasks</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

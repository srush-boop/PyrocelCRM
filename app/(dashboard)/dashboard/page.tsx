import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Route, ClipboardCheck, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Fetch dashboard stats
  const [sitesCount, routesCount, pendingTasks, completedTasks] = await Promise.all([
    supabase.from('sites').select('id', { count: 'exact', head: true }),
    supabase.from('routes').select('id', { count: 'exact', head: true }),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ])

  // Fetch recent/upcoming tasks based on role
  const tasksQuery = supabase
    .from('tasks')
    .select(`
      *,
      site_service:site_services(
        *,
        site:sites(*),
        service_type:service_types(*)
      ),
      assigned_engineer:profiles(*)
    `)
    .in('status', ['pending', 'in_progress'])
    .order('scheduled_date', { ascending: true })
    .limit(5)

  // For engineers, only show their assigned tasks
  if ((profile as Profile).role === 'engineer') {
    tasksQuery.eq('assigned_engineer_id', user.id)
  }

  const { data: recentTasks } = await tasksQuery

  const isAdminOrOffice = (profile as Profile).role === 'admin' || (profile as Profile).role === 'office'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {(profile as Profile).role === 'engineer' ? 'My Tasks' : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground">
          Welcome back, {(profile as Profile).full_name || 'User'}
        </p>
      </div>

      {isAdminOrOffice && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sitesCount.count || 0}</div>
              <p className="text-xs text-muted-foreground">Active client sites</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Routes</CardTitle>
              <Route className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{routesCount.count || 0}</div>
              <p className="text-xs text-muted-foreground">Geographic areas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingTasks.count || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting completion</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedTasks.count || 0}</div>
              <p className="text-xs text-muted-foreground">Tasks completed</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {(profile as Profile).role === 'engineer' ? 'My Upcoming Tasks' : 'Upcoming Tasks'}
          </CardTitle>
          <CardDescription>
            {(profile as Profile).role === 'engineer' 
              ? 'Tasks assigned to you' 
              : 'Tasks scheduled for the coming days'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTasks && recentTasks.length > 0 ? (
            <div className="space-y-4">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {task.site_service?.site?.name || 'Unknown Site'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {task.site_service?.service_type?.name || 'Unknown Service'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {task.site_service?.site?.address}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={task.status === 'pending' ? 'secondary' : 'default'}>
                      {task.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(task.scheduled_date).toLocaleDateString()}
                    </span>
                    {(profile as Profile).role === 'engineer' && (
                      <Button size="sm" asChild>
                        <Link href={`/dashboard/tasks/${task.id}`}>
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          Start
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No upcoming tasks</p>
              {isAdminOrOffice && (
                <Button asChild className="mt-4">
                  <Link href="/dashboard/schedule">Schedule Tasks</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

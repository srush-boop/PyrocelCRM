import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sun, Siren, MapPin, CalendarDays, ChevronRight, User } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

// "09:00" from a "HH:mm:ss" DB time string, or null when unbooked.
function shortTime(t: string | null): string | null {
  if (!t) return null
  return t.slice(0, 5)
}

type DayAheadTask = {
  id: string
  status: string
  is_emergency: boolean | null
  booked_start_time: string | null
  booked_end_time: string | null
  assigned_engineer: { full_name: string | null } | null
  site_service: {
    site: { name: string | null; address: string | null; postcode: string | null } | null
    service_type: { name: string | null } | null
  } | null
}

// Company-wide "day ahead" for office/admin: every call booked for today across
// all engineers (mirrors the engineer home tile, but not scoped to one user).
export async function CompanyDayAheadTile() {
  const supabase = await createClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const { data: rows } = await supabase
    .from('tasks')
    .select(
      `
      id,
      status,
      is_emergency,
      booked_start_time,
      booked_end_time,
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name),
      site_service:site_services(
        site:sites(name, address, postcode),
        service_type:service_types(name)
      )
    `,
    )
    .eq('scheduled_date', todayStr)
    .in('status', ['pending', 'in_progress', 'completed'])
    .order('booked_start_time', { ascending: true, nullsFirst: false })

  const tasks = (rows as unknown as DayAheadTask[]) ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5" />
            The day ahead
          </CardTitle>
          <CardDescription>
            {tasks.length > 0
              ? `${tasks.length} call${tasks.length === 1 ? '' : 's'} booked across the team today`
              : 'Nothing booked for today'}
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/calendar">
            Open calendar
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task) => {
              const start = shortTime(task.booked_start_time)
              const end = shortTime(task.booked_end_time)
              const site = task.site_service?.site
              const done = task.status === 'completed'
              return (
                <Link
                  key={task.id}
                  href={`/dashboard/tasks/${task.id}?from=/dashboard`}
                  className={`flex items-center gap-4 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    task.is_emergency ? 'border-destructive/40' : ''
                  }`}
                >
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-muted px-2 py-1.5 text-center">
                    <span className="text-sm font-semibold tabular-nums">{start ?? '--:--'}</span>
                    {end && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{end}</span>
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 space-y-0.5 ${done ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{site?.name || 'Unknown site'}</p>
                      {task.is_emergency && (
                        <Badge variant="destructive" className="shrink-0 gap-1">
                          <Siren className="h-3 w-3" />
                          Emergency
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {task.site_service?.service_type?.name || 'Call'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {task.assigned_engineer?.full_name || 'Unassigned'}
                      </p>
                      {(site?.address || site?.postcode) && (
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[site?.address, site?.postcode].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {done ? (
                    <Badge className="shrink-0 bg-green-600 text-white hover:bg-green-600/90">
                      Done
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      {task.status === 'in_progress' ? 'in progress' : 'to do'}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No calls booked for today.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard/calendar">View the calendar</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

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
import {
  Calendar,
  Clock,
  MapPin,
  Siren,
  CheckCircle2,
  ChevronRight,
  Sun,
  Signal,
  Crown,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Profile, WorkerType } from '@/lib/types/database'
import { isTaskVisibleToEngineer } from '@/lib/engineer-visibility'
import { DidYouKnowTile } from '@/components/dashboard/home/did-you-know-tile'
import { LocationSharingToggle } from '@/components/dashboard/home/location-sharing-toggle'
import { LoneWorkerShiftCard } from '@/components/dashboard/lone-worker/lone-worker-shift-card'
import { getEngineerEngagementStats } from '@/lib/engagement-stats'
import { EngineerStandingCard } from '@/components/dashboard/home/engineer-standing-card'
import { YourTasksTile } from '@/components/dashboard/internal-tasks/your-tasks-tile'

// Greeting that reflects the time of day, so the home feels alive.
function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// "09:00" from a "HH:mm:ss" DB time string, or null when unbooked.
function shortTime(t: string | null): string | null {
  if (!t) return null
  return t.slice(0, 5)
}

type EngineerTask = {
  id: string
  scheduled_date: string
  status: string
  is_emergency: boolean | null
  booked_start_time: string | null
  booked_end_time: string | null
  site_service: {
    worker_type?: WorkerType | null
    site: { name: string | null; address: string | null; postcode: string | null } | null
    service_type: { name: string | null; default_worker_type?: WorkerType | null } | null
  } | null
}

export async function EngineerHome({
  profile,
  isSubcontractor = false,
}: {
  profile: Profile
  // Sub-contractors are external workers: they see their day/schedule but not
  // the internal-only cards (lone-worker shift, department standings, location
  // sharing / H&S tracking).
  isSubcontractor?: boolean
}) {
  const supabase = await createClient()

  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const firstName = (profile.full_name || 'there').split(' ')[0]

  const taskSelect = `
    id,
    scheduled_date,
    status,
    is_emergency,
    booked_start_time,
    booked_end_time,
    site_service:site_services(
      worker_type,
      site:sites(name, address, postcode),
      service_type:service_types(name, default_worker_type)
    )
  `

  const [{ data: todayRows }, weekAheadCount] = await Promise.all([
    supabase
      .from('tasks')
      .select(taskSelect)
      .eq('assigned_engineer_id', profile.id)
      .eq('scheduled_date', todayStr)
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('booked_start_time', { ascending: true, nullsFirst: false }),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_engineer_id', profile.id)
      .in('status', ['pending', 'in_progress'])
      .gt('scheduled_date', todayStr),
  ])

  // CDO isolation + hide sub-contracted work (matches the Calls list rules).
  const todayTasks = ((todayRows as unknown as EngineerTask[]) ?? []).filter((t) =>
    isTaskVisibleToEngineer(t, profile.discipline),
  )
  const remaining = todayTasks.filter((t) => t.status !== 'completed')
  const doneToday = todayTasks.length - remaining.length

  // Encouragement: the engineer's own standing within their department. Null when
  // the feature is switched off, or they have no department / not enough data.
  // Sub-contractors are external and excluded from internal standings.
  const engagementStats = isSubcontractor
    ? null
    : await getEngineerEngagementStats(supabase, profile)

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-balance">
          {greeting(now)}, {firstName}
          {engagementStats?.isLeader && (
            <Crown
              className="h-7 w-7 text-primary"
              aria-label={`Department leader in ${engagementStats.departmentName}`}
            />
          )}
        </h1>
        <p className="text-muted-foreground">
          {format(now, 'EEEE, d MMMM yyyy')}
        </p>
      </div>

      {/* Lone worker safety — start/finish shift and check-in frequency.
          Internal staff only; not shown to external sub-contractors. */}
      {!isSubcontractor && <LoneWorkerShiftCard />}

      {/* Outstanding internal quality/management tasks (toolbox talks etc). */}
      <YourTasksTile />

      {/* Today's schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              Your day ahead
            </CardTitle>
            <CardDescription>
              {todayTasks.length > 0
                ? `${todayTasks.length} call${todayTasks.length === 1 ? '' : 's'} scheduled for today`
                : 'Nothing booked for today'}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/schedule">
              Open schedule
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {todayTasks.length > 0 ? (
            <div className="space-y-3">
              {todayTasks.map((task) => {
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
                      <span className="text-sm font-semibold tabular-nums">
                        {start ?? '--:--'}
                      </span>
                      {end && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {end}
                        </span>
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
                      {(site?.address || site?.postcode) && (
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[site?.address, site?.postcode].filter(Boolean).join(', ')}
                        </p>
                      )}
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
              <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                You have no calls booked for today.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/dashboard/schedule">View your schedule</Link>
              </Button>
            </div>
          )}

          {(weekAheadCount.count || 0) > 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Plus{' '}
              <span className="font-medium text-foreground">{weekAheadCount.count}</span>{' '}
              more upcoming call{weekAheadCount.count === 1 ? '' : 's'} after today.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Call count summary — compact so it doesn't dominate the home screen */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          icon={Calendar}
          label="Calls today"
          value={todayTasks.length}
        />
        <SummaryTile
          icon={Clock}
          label="Still to do"
          value={remaining.length}
          alert={remaining.length > 0}
        />
        <SummaryTile
          icon={CheckCircle2}
          label="Completed today"
          value={doneToday}
        />
      </div>

      {/* Encouragement: your standing in the department */}
      {engagementStats && <EngineerStandingCard stats={engagementStats} />}

      {/* Location sharing — internal engineers only. Kept on for health &
          safety. Not shown to external sub-contractors. */}
      {!isSubcontractor && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Signal className="h-4 w-4" />
              Location sharing
            </CardTitle>
            <CardDescription>
              Kept on for health &amp; safety reasons, so we can reach you quickly and
              send help to your location if something goes wrong on the road.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LocationSharingToggle
              initialEnabled={profile.location_sharing_enabled ?? false}
            />
          </CardContent>
        </Card>
      )}

      {/* Daily fact (shared with the office/admin dashboard) */}
      <DidYouKnowTile />
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: typeof Calendar
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <Card className={alert ? 'border-primary/40' : ''}>
      <CardContent className="flex flex-col items-center gap-1 px-2 py-3 text-center sm:flex-row sm:gap-3 sm:text-left">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            alert ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-lg font-bold leading-none">{value}</div>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

import { createClient } from '@/lib/supabase/server'
import { syncUkBankHolidays } from '@/lib/bank-holidays'
import { getBranchScope, type BranchScope } from '@/lib/branches'
import type {
  CalendarItem,
  CalendarEntryType,
  Profile,
  RouteCalendarSource,
  LeaveApprovalStatus,
} from '@/lib/types/database'

// Default colour used for booked service tasks on the calendar.
export const TASK_COLOR = '#2563eb'
// Accent colour for jobs that are currently underway (commenced, in progress).
export const COMMENCED_COLOR = '#f59e0b'

// Maps an English weekday name to its JS index (0 = Sunday … 6 = Saturday).
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

// Derives the recurring weekday from a route name such as "Friday 01".
// Returns null when no weekday word is present.
export function parseRouteWeekday(name: string): number | null {
  const lower = name.toLowerCase()
  for (const [day, idx] of Object.entries(WEEKDAY_INDEX)) {
    if (lower.includes(day)) return idx
  }
  return null
}

// Combine a date (yyyy-mm-dd) and an optional time (HH:MM[:SS]) into an ISO
// datetime string. When no time is given, defaults to the provided fallback.
function combineDateTime(date: string, time: string | null, fallback: string): string {
  const t = time ?? fallback
  // Normalise to HH:MM:SS
  const parts = t.split(':')
  const hh = (parts[0] ?? '00').padStart(2, '0')
  const mm = (parts[1] ?? '00').padStart(2, '0')
  const ss = (parts[2] ?? '00').padStart(2, '0')
  return `${date}T${hh}:${mm}:${ss}`
}

interface TaskRow {
  id: string
  scheduled_date: string
  booked_start_time: string | null
  booked_end_time: string | null
  status: string
  // Actual on-site commencement timestamp, set when an engineer taps "Start".
  started_at: string | null
  assigned_engineer_id: string | null
  assigned_engineer: { id: string; full_name: string | null; email: string; branch_id: string | null } | null
  site_service: {
    site: { name: string; branch_id: string | null } | null
    service_type: { name: string } | null
  } | null
  visit_type: { name: string } | null
  // Actual on-site times submitted when the task is executed. Used to place
  // completed tasks on the calendar "in hindsight" even without a booked slot.
  // Supabase may return this embed as an array (to-many) or a single object
  // (to-one), so it is normalised before use.
  task_results:
    | { testing_start_time: string | null; testing_end_time: string | null }[]
    | { testing_start_time: string | null; testing_end_time: string | null }
    | null
}

interface RouteRow {
  id: string
  name: string
  color: string | null
  assigned_engineer_id: string | null
  assigned_engineer: { id: string; full_name: string | null; email: string; branch_id: string | null } | null
}

type AttendeeProfile = {
  id: string
  full_name: string | null
  email: string
  branch_id: string | null
}

interface EntryRow {
  id: string
  entry_type_id: string
  user_id: string | null
  title: string | null
  start_at: string
  end_at: string
  all_day: boolean
  is_public: boolean
  notes: string | null
  approval_status: LeaveApprovalStatus | null
  entry_type: CalendarEntryType | null
  user: AttendeeProfile | null
  // Every person invited to this entry (the entry shows on each of their calendars).
  attendees: { user: AttendeeProfile | null }[] | null
}

export interface CalendarData {
  items: CalendarItem[]
  // Recurring weekly routes, expanded into occurrences on the client per view.
  routes: RouteCalendarSource[]
  entryTypes: CalendarEntryType[]
  // Staff who can own items (for the user filter). Engineers get an empty list.
  people: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]
  // Active departments, used to invite a whole team at once. Managers only.
  departments: { id: string; name: string }[]
  profile: Profile
  canManageOthers: boolean
  branchScope: BranchScope
}

// Fetches everything the master calendar needs, scoped by the viewer's role.
// RLS already restricts what an engineer can read; we additionally constrain
// the task query to their own jobs.
export async function getCalendarData(branchId?: string | null): Promise<CalendarData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profileData) return null
  const profile = profileData as Profile
  const isEngineer = profile.role === 'engineer'
  const canManageOthers = profile.role === 'admin' || profile.role === 'office'

  // Resolve the active branch (respects role: engineers are locked to theirs).
  const branchScope = await getBranchScope(profile, branchId)
  const activeBranchId = branchScope.activeBranchId

  // Ensure UK bank holidays are imported (throttled + idempotent internally).
  await syncUkBankHolidays()

  // --- Tasks (only those with a scheduled date) ---
  let taskQuery = supabase
    .from('tasks')
    .select(
      `id, scheduled_date, booked_start_time, booked_end_time, status, started_at, assigned_engineer_id,
       assigned_engineer:profiles(id, full_name, email, branch_id),
       site_service:site_services(
         site:sites(name, branch_id),
         service_type:service_types(name)
       ),
       visit_type:service_visit_types(name),
       task_results(testing_start_time, testing_end_time)`,
    )
    .not('scheduled_date', 'is', null)
    .neq('status', 'cancelled')

  if (isEngineer) {
    taskQuery = taskQuery.eq('assigned_engineer_id', user.id)
  }

  // --- Routes (recurring weekly). Engineers only see their own routes. ---
  let routeQuery = supabase
    .from('routes')
    .select('id, name, color, assigned_engineer_id, assigned_engineer:profiles(id, full_name, email, branch_id)')
    .order('name', { ascending: true })

  if (isEngineer) {
    routeQuery = routeQuery.eq('assigned_engineer_id', user.id)
  }

  // --- General entries (RLS scopes visibility automatically) ---
  const [
    { data: taskData },
    { data: entryData },
    { data: typeData },
    { data: routeData },
  ] = await Promise.all([
    taskQuery,
    supabase
      .from('calendar_entries')
      .select(
        `id, entry_type_id, user_id, title, start_at, end_at, all_day, is_public, notes, approval_status,
           entry_type:calendar_entry_types(*),
           user:profiles(id, full_name, email, branch_id),
           attendees:calendar_entry_attendees(user:profiles(id, full_name, email, branch_id))`,
      )
      .order('start_at', { ascending: true }),
    supabase
      .from('calendar_entry_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    routeQuery,
  ])

  let tasks = (taskData || []) as unknown as TaskRow[]
  const entries = (entryData || []) as unknown as EntryRow[]
  const entryTypes = (typeData || []) as CalendarEntryType[]
  let routeRows = (routeData || []) as unknown as RouteRow[]

  // When a branch is active, scope each source by its branch:
  // - tasks: by the task's site branch
  // - routes: by the assigned engineer's branch
  // - entries: scoped per attendee below (company-wide entries always show)
  if (activeBranchId) {
    tasks = tasks.filter((t) => t.site_service?.site?.branch_id === activeBranchId)
    routeRows = routeRows.filter((r) => r.assigned_engineer?.branch_id === activeBranchId)
  }
  const scopedEntries = entries

  // Build the recurring-route sources (weekday parsed from the name).
  const routes: RouteCalendarSource[] = routeRows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color || TASK_COLOR,
    weekday: parseRouteWeekday(r.name),
    engineerId: r.assigned_engineer_id,
    engineerName: r.assigned_engineer
      ? r.assigned_engineer.full_name || r.assigned_engineer.email
      : null,
  }))

  const items: CalendarItem[] = []

  for (const t of tasks) {
    // Prefer a forward-booked slot; otherwise fall back to the actual on-site
    // times submitted when the task was executed, so completed tasks are added
    // to the calendar "in hindsight".
    const taskResults = Array.isArray(t.task_results)
      ? t.task_results
      : t.task_results
        ? [t.task_results]
        : []
    const result = taskResults.find((r) => r.testing_start_time)
    const hasSlot = !!t.booked_start_time
    const hasActual = !!result?.testing_start_time
    // A job is "commenced" once the engineer taps Start (status in_progress with
    // a recorded started_at) but hasn't yet submitted its final on-site times.
    const hasCommenced = t.status === 'in_progress' && !!t.started_at

    let start: string
    let end: string
    let allDay: boolean
    let timeNote: string | null = null

    if (hasSlot) {
      start = combineDateTime(t.scheduled_date, t.booked_start_time, '00:00:00')
      end = combineDateTime(t.scheduled_date, t.booked_end_time ?? t.booked_start_time, '23:59:00')
      allDay = false
      // Keep the booked window but flag that the job is already underway.
      if (hasCommenced) timeNote = 'Commenced'
    } else if (hasCommenced) {
      // Unbooked job that has been started: drop it onto the calendar at its
      // actual commencement time so it appears live as soon as Start is tapped.
      start = t.started_at as string
      end = t.started_at as string
      allDay = false
      timeNote = 'Commenced'
    } else if (hasActual) {
      // Actual timestamps carry their own date/time.
      start = result!.testing_start_time as string
      end = (result!.testing_end_time as string) || (result!.testing_start_time as string)
      allDay = false
      timeNote = 'Actual time'
    } else {
      start = combineDateTime(t.scheduled_date, null, '00:00:00')
      end = combineDateTime(t.scheduled_date, null, '23:59:00')
      allDay = true
    }

    const siteName = t.site_service?.site?.name ?? 'Service task'
    const serviceName = t.site_service?.service_type?.name ?? ''
    const ownerName = t.assigned_engineer
      ? t.assigned_engineer.full_name || t.assigned_engineer.email
      : null
    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      title: siteName,
      start,
      end,
      allDay,
      color: hasCommenced ? COMMENCED_COLOR : TASK_COLOR,
      ownerId: t.assigned_engineer_id,
      ownerName,
      subtitle:
        [serviceName, t.visit_type?.name, timeNote].filter(Boolean).join(' · ') || null,
      taskId: t.id,
    })
  }

  for (const e of scopedEntries) {
    // Resolve the people this entry sits with. Each attendee gets their own
    // calendar block so the entry appears on every invited person's calendar.
    const attendeeProfiles = (e.attendees || [])
      .map((a) => a.user)
      .filter((u): u is AttendeeProfile => Boolean(u))

    // Legacy / company-wide entries with no attendee rows fall back to a single
    // block owned by the entry's user (or company-wide when unowned).
    const owners: (AttendeeProfile | null)[] =
      attendeeProfiles.length > 0 ? attendeeProfiles : [e.user]

    const base = {
      kind: 'entry' as const,
      title: e.title || e.entry_type?.name || 'Entry',
      start: e.start_at,
      end: e.end_at,
      allDay: e.all_day,
      color: e.entry_type?.color || '#64748b',
      subtitle: e.entry_type?.name ?? null,
      entryId: e.id,
      entryTypeName: e.entry_type?.name,
      isPublic: e.is_public,
      approvalStatus: e.approval_status,
    }

    for (const owner of owners) {
      // Branch scope: hide attendees who belong to a different branch, but never
      // hide the viewer's own entries or entries owned by someone with no branch
      // (e.g. admins/office) — otherwise a branch filter would make them vanish.
      if (
        activeBranchId &&
        owner &&
        owner.id !== user.id &&
        owner.branch_id != null &&
        owner.branch_id !== activeBranchId
      )
        continue

      items.push({
        ...base,
        id: owner ? `entry-${e.id}-${owner.id}` : `entry-${e.id}`,
        ownerId: owner?.id ?? null,
        ownerName: owner ? owner.full_name || owner.email : 'Company-wide',
      })
    }
  }

  // People + departments lists for the user filter and the invite picker
  // (managers only).
  let people: CalendarData['people'] = []
  let departments: CalendarData['departments'] = []
  if (canManageOthers) {
    const [{ data: peopleData }, { data: deptData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name', { ascending: true }),
      supabase
        .from('departments')
        .select('id, name')
        .eq('active', true)
        .order('name', { ascending: true }),
    ])
    people = (peopleData || []) as CalendarData['people']
    departments = (deptData || []) as CalendarData['departments']
  }

  return { items, routes, entryTypes, people, departments, profile, canManageOthers, branchScope }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile, Timesheet, TimesheetManualEntry, Role } from '@/lib/types/database'
import { isTimesheetRequired, resolveExplicitTimesheetActors } from '@/lib/types/database'
import { notifyUsers } from '@/lib/notifications'
import {
  computeTimesheet,
  parseTimesheetConfig,
  weekDates,
  weekEndingFor,
  deadlineFor,
  fmtDate,
  type TimesheetInputs,
  type TimesheetSummary,
  type RawJob,
  type RawCalendarEntry,
  type RawManualEntry,
  type RawShift,
  type RawOncall,
} from '@/lib/timesheets/compute'

// Server actions for the Timesheets module. A user builds + views their own
// weekly timesheet live, then confirms + submits before the Mon 09:00 deadline.
// Their manager (profiles.manager_id) and admin/office review + approve.

const TIMESHEET_PATH = '/dashboard/timesheet'
const REVIEW_PATH = '/dashboard/timesheet/review'
const APPROVALS_PATH = '/dashboard/approvals'

async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  return { supabase, userId: user.id }
}

export interface TimesheetView {
  timesheet: Timesheet
  summary: TimesheetSummary
  manualEntries: TimesheetManualEntry[]
  deadline: string
  isLocked: boolean // draft edits closed (submitted/approved, or past deadline)
  canEdit: boolean
}

/**
 * Ensures a draft timesheet exists for the given week (default: current week),
 * then returns the LIVE computed view. While the sheet is still a draft the
 * summary is recomputed from source every open; once submitted the frozen
 * snapshot is returned instead.
 */
export async function getOrBuildTimesheet(
  weekEndingInput?: string,
): Promise<{ ok: false; error: string } | ({ ok: true } & TimesheetView)> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { supabase, userId } = auth

  const weekEnding = weekEndingInput ?? weekEndingFor(new Date())

  // Confirm timesheets apply to this user.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, timesheet_required, role, work_days, work_day_hours, work_start_time, work_end_time, lunch_minutes, role_id',
    )
    .eq('id', userId)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }

  let roleRef: Role | null = null
  if ((profile as { role_id?: string }).role_id) {
    const { data: r } = await supabase
      .from('roles')
      .select('*')
      .eq('id', (profile as { role_id: string }).role_id)
      .maybeSingle()
    roleRef = (r as Role) ?? null
  }
  if (!isTimesheetRequired({ ...(profile as any), role_ref: roleRef })) {
    return { ok: false, error: 'Timesheets are not enabled for your account.' }
  }

  // Find or create the draft.
  let { data: timesheet } = await supabase
    .from('timesheets')
    .select('*')
    .eq('user_id', userId)
    .eq('week_ending', weekEnding)
    .maybeSingle()

  if (!timesheet) {
    const { data: created, error } = await supabase
      .from('timesheets')
      .insert({ user_id: userId, week_ending: weekEnding, status: 'draft' })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    timesheet = created
  }
  const ts = timesheet as Timesheet

  // Manual entries.
  const { data: manual } = await supabase
    .from('timesheet_manual_entries')
    .select('*')
    .eq('timesheet_id', ts.id)
    .order('start_at', { ascending: true })
  const manualEntries = (manual as TimesheetManualEntry[]) ?? []

  const deadline = deadlineFor(weekEnding)
  const pastDeadline = new Date() > deadline
  const submitted = ts.status !== 'draft'
  const isLocked = submitted
  const canEdit = ts.status === 'draft' || ts.status === 'rejected'

  // Submitted/approved: return the frozen snapshot.
  if (submitted && ts.summary) {
    return {
      ok: true,
      timesheet: ts,
      summary: ts.summary as TimesheetSummary,
      manualEntries,
      deadline: deadline.toISOString(),
      isLocked,
      canEdit: false,
    }
  }

  // Otherwise compute live.
  const summary = await buildSummary(supabase, {
    id: userId,
    work_days: (profile as any).work_days,
    work_day_hours: (profile as any).work_day_hours,
    work_start_time: (profile as any).work_start_time,
    work_end_time: (profile as any).work_end_time,
    lunch_minutes: (profile as any).lunch_minutes,
  }, weekEnding, manualEntries, ts.night_shift_dates)

  return {
    ok: true,
    timesheet: ts,
    summary,
    manualEntries,
    deadline: deadline.toISOString(),
    isLocked: pastDeadline && ts.status === 'draft' ? false : isLocked,
    canEdit,
  }
}

/** Gather all source data for a week and run the pure compute engine. */
async function buildSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: TimesheetInputs['profile'],
  weekEnding: string,
  manualEntries: TimesheetManualEntry[],
  nightShiftDates?: string[] | null,
): Promise<TimesheetSummary> {
  const dates = weekDates(weekEnding)
  const from = dates[0]
  const to = dates[6]
  const fromTs = `${from}T00:00:00.000Z`
  const toTs = `${to}T23:59:59.999Z`

  // Config
  const { data: cfgRow } = await supabase
    .from('global_config')
    .select('value')
    .eq('key', 'timesheet_config')
    .maybeSingle()
  const config = parseTimesheetConfig((cfgRow as { value?: unknown } | null)?.value)

  // Shifts (lone-worker sessions started within the week).
  const { data: shiftRows } = await supabase
    .from('lone_worker_sessions')
    .select('shift_start, finished_at, shift_end')
    .eq('user_id', profile.id)
    .gte('shift_start', fromTs)
    .lte('shift_start', toTs)
  const shifts = (shiftRows as RawShift[]) ?? []

  // On-call shifts in the week.
  const { data: oncallRows } = await supabase
    .from('oncall_shifts')
    .select('shift_date, band')
    .eq('engineer_id', profile.id)
    .gte('shift_date', from)
    .lte('shift_date', to)
  const oncall = (oncallRows as RawOncall[]) ?? []

  // Jobs (tasks) assigned to the user in the week, with actual on-site times.
  const { data: taskRows } = await supabase
    .from('tasks')
    .select(
      `id, scheduled_date, booked_start_time, booked_end_time, booked_duration_minutes,
       task_results ( testing_start_time, testing_end_time ),
       direct_site:sites!tasks_site_id_fkey ( name ),
       direct_service_type:service_types!tasks_service_type_id_fkey ( name ),
       site_service:site_services (
         site:sites ( name ),
         service_type:service_types ( name )
       )`,
    )
    .eq('assigned_engineer_id', profile.id)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
  const jobs: RawJob[] = ((taskRows as any[]) ?? []).map((t) => {
    const result = Array.isArray(t.task_results) ? t.task_results[0] : t.task_results
    const siteName = t.direct_site?.name ?? t.site_service?.site?.name ?? null
    const serviceName =
      t.direct_service_type?.name ?? t.site_service?.service_type?.name ?? null
    return {
      id: t.id,
      scheduled_date: t.scheduled_date,
      booked_start_time: t.booked_start_time,
      booked_end_time: t.booked_end_time,
      booked_duration_minutes: t.booked_duration_minutes,
      testing_start_time: result?.testing_start_time ?? null,
      testing_end_time: result?.testing_end_time ?? null,
      site_label: siteName,
      service_label: serviceName,
    }
  })

  // Calendar entries overlapping the week.
  const { data: calRows } = await supabase
    .from('calendar_entries')
    .select('id, title, start_at, end_at, all_day, calendar_entry_types ( name )')
    .eq('user_id', profile.id)
    .lte('start_at', toTs)
    .gte('end_at', fromTs)
  const calendar: RawCalendarEntry[] = ((calRows as any[]) ?? []).map((c) => ({
    id: c.id,
    type_name: c.calendar_entry_types?.name ?? 'Entry',
    title: c.title,
    start_at: c.start_at,
    end_at: c.end_at,
    all_day: c.all_day,
  }))

  const manual: RawManualEntry[] = manualEntries.map((m) => ({
    id: m.id,
    entry_date: m.entry_date,
    start_at: m.start_at,
    end_at: m.end_at,
    description: m.description,
  }))

  return computeTimesheet({
    profile,
    weekEnding,
    shifts,
    oncall,
    jobs,
    calendar,
    manual,
    config,
    nightShiftDates: nightShiftDates ?? null,
  })
}

// --- Manual entries ---------------------------------------------------------

export async function addManualEntry(input: {
  timesheetId: string
  entryDate: string
  startAt: string
  endAt: string
  description?: string
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { supabase } = auth

  if (new Date(input.endAt) <= new Date(input.startAt)) {
    return { ok: false, error: 'End time must be after start time.' }
  }

  // Owner + draft guard (RLS also enforces ownership).
  const { data: ts } = await supabase
    .from('timesheets')
    .select('id, status')
    .eq('id', input.timesheetId)
    .maybeSingle()
  if (!ts) return { ok: false, error: 'Timesheet not found' }
  if ((ts as Timesheet).status !== 'draft' && (ts as Timesheet).status !== 'rejected') {
    return { ok: false, error: 'This timesheet is locked.' }
  }

  const { error } = await supabase.from('timesheet_manual_entries').insert({
    timesheet_id: input.timesheetId,
    entry_date: input.entryDate,
    start_at: input.startAt,
    end_at: input.endAt,
    description: input.description ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(TIMESHEET_PATH)
  return { ok: true }
}

export async function deleteManualEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { error } = await auth.supabase.from('timesheet_manual_entries').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(TIMESHEET_PATH)
  return { ok: true }
}

// --- Night-shift confirmation -----------------------------------------------

/**
 * Saves the user's explicit set of night-shift dates for a draft timesheet.
 * A night shift no longer defaults on just because work ran into the evening;
 * the user ticks each day that was genuinely night-shift working. Passing the
 * full (possibly empty) list makes the choice explicit so the summary stops
 * falling back to the auto-suggestion.
 */
export async function setNightShiftDates(input: {
  timesheetId: string
  dates: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { supabase, userId } = auth

  const { data: ts } = await supabase
    .from('timesheets')
    .select('id, user_id, status')
    .eq('id', input.timesheetId)
    .maybeSingle()
  if (!ts) return { ok: false, error: 'Timesheet not found' }
  if ((ts as Timesheet).user_id !== userId) return { ok: false, error: 'Not authorised' }
  if ((ts as Timesheet).status !== 'draft' && (ts as Timesheet).status !== 'rejected') {
    return { ok: false, error: 'This timesheet is locked.' }
  }

  // Constrain to this week's dates and de-dupe.
  const valid = new Set(weekDates((ts as Timesheet).week_ending))
  const cleaned = Array.from(new Set(input.dates.filter((d) => valid.has(d)))).sort()

  const { error } = await supabase
    .from('timesheets')
    .update({ night_shift_dates: cleaned, updated_at: new Date().toISOString() })
    .eq('id', input.timesheetId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(TIMESHEET_PATH)
  return { ok: true }
}

// --- Submit / review --------------------------------------------------------

/**
 * Confirms + submits a timesheet. Freezes the computed summary snapshot, records
 * which internal-task instances the user confirmed (e.g. weekly toolbox talk +
 * its reference number), flags `late` if after the Mon 09:00 deadline, and
 * notifies the user's manager.
 */
export async function submitTimesheet(input: {
  id: string
  confirmedTaskInstanceIds: string[]
  toolboxReference?: string
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth()
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { supabase, userId } = auth

  const { data: tsRow } = await supabase
    .from('timesheets')
    .select('*')
    .eq('id', input.id)
    .maybeSingle()
  if (!tsRow) return { ok: false, error: 'Timesheet not found' }
  const ts = tsRow as Timesheet
  if (ts.user_id !== userId) return { ok: false, error: 'Not authorised' }
  if (ts.status === 'submitted' || ts.status === 'approved') {
    return { ok: false, error: 'Already submitted.' }
  }

  // Load profile for the freeze compute.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, work_days, work_day_hours, work_start_time, work_end_time, lunch_minutes, full_name, manager_id')
    .eq('id', userId)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }

  const { data: manual } = await supabase
    .from('timesheet_manual_entries')
    .select('*')
    .eq('timesheet_id', ts.id)
  const summary = await buildSummary(supabase, profile as any, ts.week_ending, (manual as TimesheetManualEntry[]) ?? [], ts.night_shift_dates)

  const late = new Date() > deadlineFor(ts.week_ending)

  const { error } = await supabase
    .from('timesheets')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      summary,
      confirmed_task_instance_ids: input.confirmedTaskInstanceIds,
      toolbox_reference: input.toolboxReference ?? null,
      late,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ts.id)
  if (error) return { ok: false, error: error.message }

  // Notify the resolved approver(s) — per-user/role nominees, else the manager.
  const { approverIds } = await resolveTimesheetActors(supabase, userId)
  if (approverIds.length > 0) {
    await notifyUsers({
      userIds: approverIds,
      title: 'Timesheet submitted for review',
      body: `${(profile as { full_name?: string }).full_name ?? 'A team member'} submitted their timesheet for week ending ${ts.week_ending}${late ? ' (late)' : ''}.`,
      url: REVIEW_PATH,
      category: 'timesheet',
      createdBy: userId,
    })
  }

  revalidatePath(TIMESHEET_PATH)
  revalidatePath(REVIEW_PATH)
  return { ok: true }
}

/**
 * Resolve the effective approver + processor user-ids for a timesheet owner.
 *   - Approvers: per-user list > role list > [manager] (fallback).
 *   - Processors: per-user list > role list > all office/admin users (fallback).
 * Returns de-duplicated id arrays. Used both to notify the right people and to
 * authorise approve/process actions.
 */
async function resolveTimesheetActors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
): Promise<{ approverIds: string[]; processorIds: string[] }> {
  const { data: owner } = await supabase
    .from('profiles')
    .select(
      'id, manager_id, role_id, timesheet_approver_ids, timesheet_processor_ids',
    )
    .eq('id', ownerId)
    .maybeSingle()
  if (!owner) return { approverIds: [], processorIds: [] }

  const o = owner as {
    manager_id: string | null
    role_id: string | null
    timesheet_approver_ids: string[] | null
    timesheet_processor_ids: string[] | null
  }

  let roleApprovers: string[] = []
  let roleProcessors: string[] = []
  if (o.role_id) {
    const { data: role } = await supabase
      .from('roles')
      .select('timesheet_approver_ids, timesheet_processor_ids')
      .eq('id', o.role_id)
      .maybeSingle()
    roleApprovers = (role as { timesheet_approver_ids?: string[] } | null)?.timesheet_approver_ids ?? []
    roleProcessors = (role as { timesheet_processor_ids?: string[] } | null)?.timesheet_processor_ids ?? []
  }

  // Approvers.
  let approverIds = resolveExplicitTimesheetActors(o.timesheet_approver_ids, roleApprovers)
  if (approverIds.length === 0 && o.manager_id) approverIds = [o.manager_id]

  // Processors.
  let processorIds = resolveExplicitTimesheetActors(o.timesheet_processor_ids, roleProcessors)
  if (processorIds.length === 0) {
    const { data: officeAdmin } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'office'])
      .eq('status', 'active')
    processorIds = ((officeAdmin as { id: string }[]) ?? []).map((p) => p.id)
  }

  return {
    approverIds: Array.from(new Set(approverIds)),
    processorIds: Array.from(new Set(processorIds)),
  }
}

async function requireReviewer(timesheetUserId: string) {
  const auth = await getAuth()
  if ('error' in auth) return auth
  const { supabase, userId } = auth
  const { data: me } = await supabase.from('profiles').select('role').eq('id', userId).single()
  const role = (me as { role?: string } | null)?.role
  if (role === 'admin' || role === 'office') return auth
  // A nominated approver for this owner (per-user list, role list, or the
  // fallback manager)?
  const { approverIds } = await resolveTimesheetActors(supabase, timesheetUserId)
  if (approverIds.includes(userId)) return auth
  return { error: 'Not authorised' as const }
}

/** Authorise the caller as a processor for the given timesheet owner. */
async function requireProcessor(timesheetUserId: string) {
  const auth = await getAuth()
  if ('error' in auth) return auth
  const { supabase, userId } = auth
  const { data: me } = await supabase.from('profiles').select('role').eq('id', userId).single()
  const role = (me as { role?: string } | null)?.role
  if (role === 'admin' || role === 'office') return auth
  const { processorIds } = await resolveTimesheetActors(supabase, timesheetUserId)
  if (processorIds.includes(userId)) return auth
  return { error: 'Not authorised' as const }
}

export async function approveTimesheet(id: string): Promise<{ ok: boolean; error?: string }> {
  const base = await getAuth()
  if ('error' in base) return { ok: false, error: base.error }
  const { data: ts } = await base.supabase.from('timesheets').select('user_id, status').eq('id', id).maybeSingle()
  if (!ts) return { ok: false, error: 'Not found' }
  const auth = await requireReviewer((ts as Timesheet).user_id)
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { error } = await auth.supabase
    .from('timesheets')
    .update({ status: 'approved', approved_by: auth.userId, approved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  await notifyUsers({
    userIds: [(ts as Timesheet).user_id],
    title: 'Timesheet approved',
    body: 'Your timesheet has been approved.',
    url: TIMESHEET_PATH,
    category: 'timesheet',
    createdBy: auth.userId,
  })
  revalidatePath(REVIEW_PATH)
  revalidatePath(TIMESHEET_PATH)
  return { ok: true }
}

export async function rejectTimesheet(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = await getAuth()
  if ('error' in base) return { ok: false, error: base.error }
  const { data: ts } = await base.supabase.from('timesheets').select('user_id').eq('id', id).maybeSingle()
  if (!ts) return { ok: false, error: 'Not found' }
  const auth = await requireReviewer((ts as Timesheet).user_id)
  if ('error' in auth) return { ok: false, error: auth.error as string }
  const { error } = await auth.supabase
    .from('timesheets')
    .update({ status: 'rejected', rejection_reason: reason || 'No reason given', approved_by: null, approved_at: null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  await notifyUsers({
    userIds: [(ts as Timesheet).user_id],
    title: 'Timesheet needs changes',
    body: reason ? `Your timesheet was returned: ${reason}` : 'Your timesheet was returned for changes.',
    url: TIMESHEET_PATH,
    category: 'timesheet',
    createdBy: auth.userId,
  })
  revalidatePath(REVIEW_PATH)
  revalidatePath(TIMESHEET_PATH)
  return { ok: true }
}

/** Timesheets awaiting review for the signed-in reviewer (manager/admin/office). */
export async function getReviewQueue(): Promise<
  Array<Timesheet & { user_name: string | null }>
> {
  const auth = await getAuth()
  if ('error' in auth) return []
  const { supabase, userId } = auth
  const { data: me } = await supabase.from('profiles').select('role').eq('id', userId).single()
  const role = (me as { role?: string } | null)?.role
  const isOfficeAdmin = role === 'admin' || role === 'office'

  let query = supabase
    .from('timesheets')
    .select('*, profiles!timesheets_user_id_fkey ( full_name, manager_id )')
    .in('status', ['submitted', 'rejected'])
    .order('week_ending', { ascending: false })

  const { data } = await query
  const rows = ((data as any[]) ?? [])
    .filter((t) => isOfficeAdmin || t.profiles?.manager_id === userId)
    .map((t) => ({ ...(t as Timesheet), user_name: t.profiles?.full_name ?? null }))
  return rows
}

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ANNUAL_LEAVE_TYPE_ID } from '@/lib/constants/leave'
import { computeLeaveSpan, type WorkDayHours } from '@/lib/leave'
import type { LeavePortion } from '@/lib/types/database'

// A single leave request row shown in the Approvals area. RLS scopes what the
// caller can see: a manager sees their reports' requests; accounts/admins see all.
export interface LeaveRequestRow {
  id: string
  userId: string
  userName: string
  departmentName: string | null
  branchName: string | null
  startAt: string
  endAt: string
  allDay: boolean
  notes: string | null
  status: 'requested' | 'approved' | 'rejected'
  approvedAt: string | null
  approverName: string | null
  rejectionReason: string | null
  // Working days this request covers (weekends/bank holidays/non-working days
  // excluded). Fractional for half-day / custom-hour bookings.
  workingDays: number
  // Net working hours this request covers (for part-time / hourly staff).
  workingHours: number
  // Partial-day portions for the first/last day (for display).
  startPortion: LeavePortion
  endPortion: LeavePortion
  startHours: number | null
  endHours: number | null
}

interface LeaveRequestQueryRow {
  id: string
  user_id: string
  start_at: string
  end_at: string
  all_day: boolean
  notes: string | null
  approval_status: 'requested' | 'approved' | 'rejected' | null
  approved_at: string | null
  rejection_reason: string | null
  start_portion: LeavePortion | null
  end_portion: LeavePortion | null
  start_hours: number | null
  end_hours: number | null
  user: {
    full_name: string | null
    work_days: number[] | null
    work_day_hours: WorkDayHours | null
    department: { name: string | null } | null
    branch: { name: string | null } | null
  } | null
  approver: { full_name: string | null } | null
}

// Fetches leave requests visible to the current user, split into pending and
// decided (approved/rejected) buckets. Bank holidays are needed to compute the
// working-day span of each request.
export async function getVisibleLeaveRequests(): Promise<{
  pending: LeaveRequestRow[]
  decided: LeaveRequestRow[]
}> {
  const supabase = await createClient()

  const [{ data: rows }, bankHolidays] = await Promise.all([
    supabase
      .from('calendar_entries')
      .select(
        `id, user_id, start_at, end_at, all_day, notes, approval_status, approved_at, rejection_reason,
         start_portion, end_portion, start_hours, end_hours,
         user:profiles!calendar_entries_user_id_fkey(
           full_name, work_days, work_day_hours,
           department:departments(name),
           branch:branches(name)
         ),
         approver:profiles!calendar_entries_approved_by_fkey(full_name)`,
      )
      .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
      .not('approval_status', 'is', null)
      .order('start_at', { ascending: false }),
    getBankHolidaySet(supabase),
  ])

  const mapped: LeaveRequestRow[] = ((rows as LeaveRequestQueryRow[] | null) ?? []).map((r) => {
    const startPortion = r.start_portion ?? 'full'
    const endPortion = r.end_portion ?? 'full'
    const { days, hours } = computeLeaveSpan(r.start_at, r.end_at, bankHolidays, {
      workDays: r.user?.work_days ?? undefined,
      workDayHours: r.user?.work_day_hours ?? null,
      startPortion,
      endPortion,
      startHours: r.start_hours,
      endHours: r.end_hours,
    })
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.user?.full_name ?? 'Unknown',
      departmentName: r.user?.department?.name ?? null,
      branchName: r.user?.branch?.name ?? null,
      startAt: r.start_at,
      endAt: r.end_at,
      allDay: r.all_day,
      notes: r.notes,
      status: (r.approval_status ?? 'requested') as LeaveRequestRow['status'],
      approvedAt: r.approved_at,
      approverName: r.approver?.full_name ?? null,
      rejectionReason: r.rejection_reason,
      workingDays: days,
      workingHours: hours,
      startPortion,
      endPortion,
      startHours: r.start_hours,
      endHours: r.end_hours,
    }
  })

  return {
    pending: mapped.filter((r) => r.status === 'requested'),
    decided: mapped.filter((r) => r.status !== 'requested'),
  }
}

// Builds a Set of 'yyyy-MM-dd' bank holiday dates for working-day exclusion.
async function getBankHolidaySet(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { BANK_HOLIDAY_TYPE_ID } = await import('@/lib/constants/leave')
  const { data } = await supabase
    .from('calendar_entries')
    .select('start_at')
    .eq('entry_type_id', BANK_HOLIDAY_TYPE_ID)
  const set = new Set<string>()
  for (const row of (data as { start_at: string }[] | null) ?? []) {
    set.add(row.start_at.slice(0, 10))
  }
  return set
}

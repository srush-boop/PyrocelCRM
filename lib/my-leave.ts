import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { computeLeaveBalances, computeLeaveSpan, type LeaveBalance } from '@/lib/leave'
import { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID } from '@/lib/constants/leave'
import type { LeavePortion, WorkDayHours } from '@/lib/types/database'

export interface MyLeaveRequest {
  id: string
  startAt: string
  endAt: string
  allDay: boolean
  notes: string | null
  status: 'requested' | 'approved' | 'rejected'
  approverName: string | null
  approvedAt: string | null
  rejectionReason: string | null
  // Fractional working days (0.5 for a half-day, etc.) and net hours consumed.
  workingDays: number
  workingHours: number
  startPortion: LeavePortion
  endPortion: LeavePortion
  startHours: number | null
  endHours: number | null
}

export interface MyLeaveData {
  userId: string
  balance: LeaveBalance | null
  requests: MyLeaveRequest[]
}

interface MyLeaveQueryRow {
  id: string
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
  approver: { full_name: string | null } | null
}

// Loads the signed-in user's own annual-leave balance and their request history.
export async function getMyLeave(): Promise<MyLeaveData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [balances, { data: rows }, { data: profile }, bankHolidays] = await Promise.all([
    computeLeaveBalances(),
    supabase
      .from('calendar_entries')
      .select(
        `id, start_at, end_at, all_day, notes, approval_status, approved_at, rejection_reason,
         start_portion, end_portion, start_hours, end_hours,
         approver:profiles!calendar_entries_approved_by_fkey(full_name)`,
      )
      .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
      .eq('user_id', user.id)
      .not('approval_status', 'is', null)
      .order('start_at', { ascending: false }),
    supabase.from('profiles').select('work_days, work_day_hours').eq('id', user.id).single(),
    getBankHolidaySet(supabase),
  ])

  const workDays = (profile?.work_days as number[] | null) ?? undefined
  const workDayHours = (profile?.work_day_hours as WorkDayHours | null) ?? null

  const requests: MyLeaveRequest[] = ((rows as MyLeaveQueryRow[] | null) ?? []).map((r) => {
    const startPortion = r.start_portion ?? 'full'
    const endPortion = r.end_portion ?? 'full'
    const { days, hours } = computeLeaveSpan(r.start_at, r.end_at, bankHolidays, {
      workDays,
      workDayHours,
      startPortion,
      endPortion,
      startHours: r.start_hours,
      endHours: r.end_hours,
    })
    return {
      id: r.id,
      startAt: r.start_at,
      endAt: r.end_at,
      allDay: r.all_day,
      notes: r.notes,
      status: (r.approval_status ?? 'requested') as MyLeaveRequest['status'],
      approverName: r.approver?.full_name ?? null,
      approvedAt: r.approved_at,
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
    userId: user.id,
    balance: balances.get(user.id) ?? null,
    requests,
  }
}

async function getBankHolidaySet(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
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

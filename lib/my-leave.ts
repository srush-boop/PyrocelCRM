import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { computeLeaveBalances, countWorkingDays, type LeaveBalance } from '@/lib/leave'
import { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID } from '@/lib/constants/leave'

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
  workingDays: number
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
  approver: { full_name: string | null } | null
}

// Loads the signed-in user's own annual-leave balance and their request history.
export async function getMyLeave(): Promise<MyLeaveData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [balances, { data: rows }, bankHolidays] = await Promise.all([
    computeLeaveBalances(),
    supabase
      .from('calendar_entries')
      .select(
        `id, start_at, end_at, all_day, notes, approval_status, approved_at, rejection_reason,
         approver:profiles!calendar_entries_approved_by_fkey(full_name)`,
      )
      .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
      .eq('user_id', user.id)
      .not('approval_status', 'is', null)
      .order('start_at', { ascending: false }),
    getBankHolidaySet(supabase),
  ])

  const requests: MyLeaveRequest[] = ((rows as MyLeaveQueryRow[] | null) ?? []).map((r) => ({
    id: r.id,
    startAt: r.start_at,
    endAt: r.end_at,
    allDay: r.all_day,
    notes: r.notes,
    status: (r.approval_status ?? 'requested') as MyLeaveRequest['status'],
    approverName: r.approver?.full_name ?? null,
    approvedAt: r.approved_at,
    rejectionReason: r.rejection_reason,
    workingDays: countWorkingDays(r.start_at, r.end_at, bankHolidays),
  }))

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

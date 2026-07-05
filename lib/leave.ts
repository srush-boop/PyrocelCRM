import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeavePortion, WorkDayHours } from '@/lib/types/database'
import { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID } from '@/lib/constants/leave'
import { computeLeaveSpan, dayKey, DEFAULT_WORK_DAYS, type LeaveBalance } from '@/lib/leave-utils'

// Re-export constants for existing server-side importers.
export { ANNUAL_LEAVE_TYPE_ID, BANK_HOLIDAY_TYPE_ID }
// Re-export the pure, client-safe helpers/types so server-side importers of
// `@/lib/leave` keep working unchanged. Client components must import these
// from `@/lib/leave-utils` directly (this module is server-only).
export * from '@/lib/leave-utils'

/**
 * Computes each user's annual-leave balance for the given calendar year.
 * Only APPROVED Annual Leave entries count. "Taken" is derived from those
 * entries overlapping the year, so on 1 Jan the balance naturally refreshes to
 * the full entitlement without any stored value being reset. Weekends, bank
 * holidays and non-working days are excluded. Returns a map keyed by user id.
 */
export async function computeLeaveBalances(
  year: number = new Date().getUTCFullYear(),
): Promise<Map<string, LeaveBalance>> {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, work_days, work_day_hours, holiday_entitlement_days, holiday_entitlement_hours')

  const balances = new Map<string, LeaveBalance>()
  const workDaysByUser = new Map<string, number[]>()
  const workHoursByUser = new Map<string, WorkDayHours | null>()
  for (const p of profiles ?? []) {
    balances.set(p.id as string, {
      entitlementDays: (p.holiday_entitlement_days as number | null) ?? null,
      entitlementHours: (p.holiday_entitlement_hours as number | null) ?? null,
      takenDays: 0,
      takenHours: 0,
      remainingDays: null,
      remainingHours: null,
    })
    const wd = p.work_days as number[] | null
    workDaysByUser.set(p.id as string, wd && wd.length > 0 ? wd : DEFAULT_WORK_DAYS)
    workHoursByUser.set(p.id as string, (p.work_day_hours as WorkDayHours | null) ?? null)
  }

  const rangeStart = `${year}-01-01T00:00:00.000Z`
  const rangeEnd = `${year}-12-31T23:59:59.999Z`

  // Bank holidays in the year (company-wide, so exclude their calendar days).
  const { data: holidays } = await admin
    .from('calendar_entries')
    .select('start_at, end_at')
    .eq('entry_type_id', BANK_HOLIDAY_TYPE_ID)
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  const bankHolidays = new Set<string>()
  for (const h of holidays ?? []) {
    const s = new Date(h.start_at as string)
    const e = new Date(h.end_at as string)
    let cur = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())
    const end = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
    while (cur <= end) {
      bankHolidays.add(dayKey(cur))
      cur += 24 * 60 * 60 * 1000
    }
  }

  // Only APPROVED annual leave counts towards taken balances.
  const { data: entries } = await admin
    .from('calendar_entries')
    .select('user_id, start_at, end_at, start_portion, end_portion, start_hours, end_hours')
    .eq('entry_type_id', ANNUAL_LEAVE_TYPE_ID)
    .eq('approval_status', 'approved')
    .lte('start_at', rangeEnd)
    .gte('end_at', rangeStart)

  for (const e of entries ?? []) {
    const userId = e.user_id as string
    const bal = balances.get(userId)
    if (!bal) continue
    const { days, hours } = computeLeaveSpan(
      e.start_at as string,
      e.end_at as string,
      bankHolidays,
      {
        year,
        workDays: workDaysByUser.get(userId) ?? DEFAULT_WORK_DAYS,
        workDayHours: workHoursByUser.get(userId) ?? null,
        startPortion: (e.start_portion as LeavePortion) ?? 'full',
        endPortion: (e.end_portion as LeavePortion) ?? 'full',
        startHours: (e.start_hours as number | null) ?? null,
        endHours: (e.end_hours as number | null) ?? null,
      },
    )
    bal.takenDays += days
    bal.takenHours += hours
  }

  for (const bal of balances.values()) {
    // Round to avoid float noise now that days can be fractional (0.5, etc.).
    bal.takenHours = Math.round(bal.takenHours * 100) / 100
    bal.takenDays = Math.round(bal.takenDays * 100) / 100
    if (bal.entitlementDays != null) {
      bal.remainingDays = Math.max(0, Math.round((bal.entitlementDays - bal.takenDays) * 100) / 100)
    }
    if (bal.entitlementHours != null) {
      bal.remainingHours = Math.max(0, Math.round((bal.entitlementHours - bal.takenHours) * 100) / 100)
    }
  }

  return balances
}

/**
 * Resolves who should approve a user's leave request: their nominated manager,
 * or all admins as a fallback when no manager is set. Returns user ids.
 */
export async function getLeaveApprovers(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('manager_id')
    .eq('id', userId)
    .single()

  if (profile?.manager_id) return [profile.manager_id as string]

  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active')
  return (admins ?? []).map((a) => a.id as string)
}

/**
 * Returns the user ids of Accounts-department members plus admins, used to
 * notify "accounts" when leave is approved.
 */
export async function getAccountsAndAdminIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data: dept } = await admin
    .from('departments')
    .select('id')
    .ilike('name', 'accounts')
    .maybeSingle()

  const ids = new Set<string>()
  if (dept?.id) {
    const { data: accts } = await admin
      .from('profiles')
      .select('id')
      .eq('department_id', dept.id as string)
      .eq('status', 'active')
    for (const a of accts ?? []) ids.add(a.id as string)
  }
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active')
  for (const a of admins ?? []) ids.add(a.id as string)
  return [...ids]
}

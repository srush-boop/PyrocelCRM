import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type CoverRequest,
  type ChangeLogEntry,
  type OncallShift,
  type OncallSummaryRow,
  type OncallRates,
  type RotaMember,
  type OncallBand,
  deriveBand,
  rateForBand,
} from './types'
import {
  OPENING_HOURS_KEY,
  DEFAULT_OPENING_HOURS,
  parseOpeningHours,
  parseTime,
  type OpeningHours,
} from './opening-hours'

export interface BranchRef {
  id: string
  name: string
}

/** All branches (id + name), ordered by name. */
export async function getBranches(): Promise<BranchRef[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('branches').select('id, name').order('name')
  return (data ?? []) as BranchRef[]
}

/**
 * Returns the set of yyyy-mm-dd bank-holiday dates between two dates
 * (inclusive), read from the imported gov.uk calendar entries.
 */
export async function getBankHolidaySet(fromISO: string, toISO: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('calendar_entries')
    .select('start_at')
    .eq('source', 'uk-bank-holiday')
    .gte('start_at', `${fromISO}T00:00:00Z`)
    .lte('start_at', `${toISO}T23:59:59Z`)
  const set = new Set<string>()
  for (const row of (data ?? []) as { start_at: string }[]) {
    set.add(row.start_at.slice(0, 10))
  }
  return set
}

/** Company on-call pay rates (single-row company_info). */
export async function getOncallRates(): Promise<OncallRates> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('company_info')
    .select('oncall_rate_weekday_evening, oncall_rate_weekend, oncall_rate_bank_holiday')
    .limit(1)
    .maybeSingle()
  const row = data as {
    oncall_rate_weekday_evening: number | null
    oncall_rate_weekend: number | null
    oncall_rate_bank_holiday: number | null
  } | null
  return {
    weekdayEvening: row?.oncall_rate_weekday_evening ?? null,
    weekend: row?.oncall_rate_weekend ?? null,
    bankHoliday: row?.oncall_rate_bank_holiday ?? null,
  }
}

/**
 * The current external call-handler token (for managers to reveal/copy the
 * public link). Returns null when none has been generated yet. RLS restricts
 * company_info reads to staff.
 */
export async function getExternalToken(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('company_info')
    .select('oncall_external_token')
    .limit(1)
    .maybeSingle()
  return (data as { oncall_external_token: string | null } | null)?.oncall_external_token ?? null
}

interface RawEngineer {
  id: string
  full_name: string | null
  phone: string | null
  secondary_phone: string | null
}

function engRef(e: RawEngineer | null) {
  return e
    ? { id: e.id, fullName: e.full_name, phone: e.phone, secondaryPhone: e.secondary_phone }
    : null
}

/** Rota members for a branch (or all branches when branchId omitted). */
export async function listRota(branchId?: string): Promise<RotaMember[]> {
  const supabase = await createClient()
  let q = supabase
    .from('oncall_rota_members')
    .select('id, branch_id, engineer_id, active, engineer:profiles(id, full_name, phone, secondary_phone)')
    .order('created_at')
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  return ((data ?? []) as unknown as {
    id: string
    branch_id: string
    engineer_id: string
    active: boolean
    engineer: RawEngineer | null
  }[]).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    engineerId: r.engineer_id,
    active: r.active,
    engineer: engRef(r.engineer),
  }))
}

interface RawShift {
  id: string
  branch_id: string
  shift_date: string
  band: OncallBand
  engineer_id: string | null
  original_engineer_id: string | null
  notes: string | null
  engineer: RawEngineer | null
  branch: { name: string } | null
}

function mapShift(r: RawShift): OncallShift {
  return {
    id: r.id,
    branchId: r.branch_id,
    branchName: r.branch?.name ?? null,
    shiftDate: r.shift_date,
    band: r.band,
    engineerId: r.engineer_id,
    engineer: engRef(r.engineer),
    originalEngineerId: r.original_engineer_id,
    notes: r.notes,
  }
}

/** On-call shifts in a date range (inclusive), optionally scoped to a branch. */
export async function listShifts(
  fromISO: string,
  toISO: string,
  branchId?: string,
): Promise<OncallShift[]> {
  const supabase = await createClient()
  let q = supabase
    .from('oncall_shifts')
    .select(
      'id, branch_id, shift_date, band, engineer_id, original_engineer_id, notes, engineer:profiles!oncall_shifts_engineer_id_fkey(id, full_name, phone, secondary_phone), branch:branches(name)',
    )
    .gte('shift_date', fromISO)
    .lte('shift_date', toISO)
    .order('shift_date')
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  return ((data ?? []) as unknown as RawShift[]).map(mapShift)
}

/** Cover requests (open by default), with message threads. */
export async function listCoverRequests(opts?: {
  branchId?: string
  status?: string
  includeMessages?: boolean
}): Promise<CoverRequest[]> {
  const supabase = await createClient()
  let q = supabase
    .from('oncall_cover_requests')
    .select(
      `id, requester_id, branch_id, kind, status, shift_id, date_from, date_to, message,
       accepted_by, accepted_at, created_at,
       requester:profiles!oncall_cover_requests_requester_id_fkey(id, full_name),
       accepter:profiles!oncall_cover_requests_accepted_by_fkey(id, full_name),
       branch:branches(name),
       shift:oncall_shifts(shift_date),
       messages:oncall_cover_messages(id, request_id, sender_id, body, created_at, sender:profiles!oncall_cover_messages_sender_id_fkey(id, full_name))`,
    )
    .order('created_at', { ascending: false })
  if (opts?.branchId) q = q.eq('branch_id', opts.branchId)
  if (opts?.status) q = q.eq('status', opts.status)
  const { data } = await q

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const requester = r.requester as { id: string; full_name: string | null } | null
    const accepter = r.accepter as { id: string; full_name: string | null } | null
    const branch = r.branch as { name: string } | null
    const shift = r.shift as { shift_date: string } | null
    const rawMsgs = (r.messages ?? []) as {
      id: string
      request_id: string
      sender_id: string
      body: string
      created_at: string
      sender: { id: string; full_name: string | null } | null
    }[]
    return {
      id: r.id as string,
      requesterId: r.requester_id as string,
      requesterName: requester?.full_name ?? null,
      branchId: r.branch_id as string,
      branchName: branch?.name ?? null,
      kind: r.kind as CoverRequest['kind'],
      status: r.status as CoverRequest['status'],
      shiftId: (r.shift_id as string | null) ?? null,
      shiftDate: shift?.shift_date ?? null,
      dateFrom: (r.date_from as string | null) ?? null,
      dateTo: (r.date_to as string | null) ?? null,
      message: (r.message as string | null) ?? null,
      acceptedBy: (r.accepted_by as string | null) ?? null,
      acceptedByName: accepter?.full_name ?? null,
      acceptedAt: (r.accepted_at as string | null) ?? null,
      createdAt: r.created_at as string,
      messages: rawMsgs
        .map((m) => ({
          id: m.id,
          requestId: m.request_id,
          senderId: m.sender_id,
          senderName: m.sender?.full_name ?? null,
          body: m.body,
          createdAt: m.created_at,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }
  })
}

/** Audit log of shift swaps/changes. */
export async function listChangeLog(branchId?: string, limit = 100): Promise<ChangeLogEntry[]> {
  const supabase = await createClient()
  let q = supabase
    .from('oncall_change_log')
    .select(
      `id, branch_id, shift_id, reason, created_at,
       branch:branches(name),
       shift:oncall_shifts(shift_date),
       from_eng:profiles!oncall_change_log_from_engineer_id_fkey(full_name),
       to_eng:profiles!oncall_change_log_to_engineer_id_fkey(full_name),
       changed_by_p:profiles!oncall_change_log_changed_by_fkey(full_name)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const branch = r.branch as { name: string } | null
    const shift = r.shift as { shift_date: string } | null
    return {
      id: r.id as string,
      branchId: r.branch_id as string,
      branchName: branch?.name ?? null,
      shiftId: (r.shift_id as string | null) ?? null,
      shiftDate: shift?.shift_date ?? null,
      fromEngineerName: (r.from_eng as { full_name: string | null } | null)?.full_name ?? null,
      toEngineerName: (r.to_eng as { full_name: string | null } | null)?.full_name ?? null,
      changedByName: (r.changed_by_p as { full_name: string | null } | null)?.full_name ?? null,
      reason: (r.reason as string | null) ?? null,
      createdAt: r.created_at as string,
    }
  })
}

/** Per-engineer shift counts + £ by band for a period (timesheet feed). */
export async function getOncallSummary(
  fromISO: string,
  toISO: string,
  branchId?: string,
): Promise<OncallSummaryRow[]> {
  const [shifts, rates] = await Promise.all([
    listShifts(fromISO, toISO, branchId),
    getOncallRates(),
  ])
  const byEngineer = new Map<string, OncallSummaryRow>()
  for (const s of shifts) {
    if (!s.engineerId) continue
    let row = byEngineer.get(s.engineerId)
    if (!row) {
      row = {
        engineerId: s.engineerId,
        engineerName: s.engineer?.fullName ?? null,
        weekdayEvening: 0,
        weekend: 0,
        bankHoliday: 0,
        total: 0,
        pay: null,
      }
      byEngineer.set(s.engineerId, row)
    }
    if (s.band === 'weekday_evening') row.weekdayEvening += 1
    else if (s.band === 'weekend') row.weekend += 1
    else row.bankHoliday += 1
    row.total += 1
  }
  const anyRate =
    rates.weekdayEvening != null || rates.weekend != null || rates.bankHoliday != null
  for (const row of byEngineer.values()) {
    if (!anyRate) continue
    row.pay =
      row.weekdayEvening * (rates.weekdayEvening ?? 0) +
      row.weekend * (rates.weekend ?? 0) +
      row.bankHoliday * (rates.bankHoliday ?? 0)
  }
  return Array.from(byEngineer.values()).sort((a, b) =>
    (a.engineerName ?? '').localeCompare(b.engineerName ?? ''),
  )
}

/**
 * Shifts the given engineer is covering from today onward (limited window),
 * used for the "you're on call" reminder banner.
 */
export async function getMyUpcomingOncall(engineerId: string, days = 14): Promise<OncallShift[]> {
  const today = new Date()
  const fromISO = today.toISOString().slice(0, 10)
  const to = new Date(today)
  to.setDate(to.getDate() + days)
  const toISO = to.toISOString().slice(0, 10)
  const supabase = await createClient()
  const { data } = await supabase
    .from('oncall_shifts')
    .select(
      'id, branch_id, shift_date, band, engineer_id, original_engineer_id, notes, engineer:profiles!oncall_shifts_engineer_id_fkey(id, full_name, phone, secondary_phone), branch:branches(name)',
    )
    .eq('engineer_id', engineerId)
    .gte('shift_date', fromISO)
    .lte('shift_date', toISO)
    .order('shift_date')
  return ((data ?? []) as unknown as RawShift[]).map(mapShift)
}

export interface ExternalRotaBranch {
  branchId: string
  branchName: string
  today: {
    engineerName: string | null
    phone: string | null
    secondaryPhone: string | null
    band: OncallBand
  } | null
  upcoming: {
    shiftDate: string
    engineerName: string | null
    phone: string | null
    secondaryPhone: string | null
    band: OncallBand
  }[]
}

/**
 * Public (no-auth) rota view for the sub-contracted call-handling station,
 * keyed by an unguessable token. Uses the admin client (RLS bypassed) but only
 * ever returns on-call contact info — nothing else. Returns null for a bad
 * token.
 */
export async function getExternalRota(token: string): Promise<ExternalRotaBranch[] | null> {
  if (!token) return null
  const admin = createAdminClient()
  const { data: company } = await admin
    .from('company_info')
    .select('oncall_external_token')
    .limit(1)
    .maybeSingle()
  const stored = (company as { oncall_external_token: string | null } | null)?.oncall_external_token
  if (!stored || stored !== token) return null

  const today = new Date()
  const fromISO = today.toISOString().slice(0, 10)
  const to = new Date(today)
  to.setDate(to.getDate() + 14)
  const toISO = to.toISOString().slice(0, 10)

  const [{ data: branches }, { data: shifts }] = await Promise.all([
    admin.from('branches').select('id, name').order('name'),
    admin
      .from('oncall_shifts')
      .select(
        'branch_id, shift_date, band, engineer:profiles!oncall_shifts_engineer_id_fkey(full_name, phone, secondary_phone)',
      )
      .gte('shift_date', fromISO)
      .lte('shift_date', toISO)
      .order('shift_date'),
  ])

  const rows = (shifts ?? []) as unknown as {
    branch_id: string
    shift_date: string
    band: OncallBand
    engineer: { full_name: string | null; phone: string | null; secondary_phone: string | null } | null
  }[]

  return ((branches ?? []) as BranchRef[]).map((b) => {
    const branchShifts = rows.filter((r) => r.branch_id === b.id)
    const todayRow = branchShifts.find((r) => r.shift_date === fromISO) ?? null
    return {
      branchId: b.id,
      branchName: b.name,
      today: todayRow
        ? {
            engineerName: todayRow.engineer?.full_name ?? null,
            phone: todayRow.engineer?.phone ?? null,
            secondaryPhone: todayRow.engineer?.secondary_phone ?? null,
            band: todayRow.band,
          }
        : null,
      upcoming: branchShifts.map((r) => ({
        shiftDate: r.shift_date,
        engineerName: r.engineer?.full_name ?? null,
        phone: r.engineer?.phone ?? null,
        secondaryPhone: r.engineer?.secondary_phone ?? null,
        band: r.band,
      })),
    }
  })
}

// On-call engineers may act 1 hour either side of their actual shift window, to
// cover a call that comes in just before hand-over or runs slightly late.
const ONCALL_GRACE_MS = 60 * 60 * 1000

/**
 * The active on-call window for a shift, in epoch ms, driven by the company
 * opening hours. Weekday-evening cover starts at closing time; weekend /
 * bank-holiday cover starts at opening time (out-of-hours cover spans the whole
 * day). Every shift hands over at the next morning's opening time.
 */
function oncallWindow(
  shiftDateISO: string,
  band: OncallBand,
  hours: OpeningHours,
): { start: number; end: number } {
  const [y, m, d] = shiftDateISO.split('-').map(Number)
  const { h: openH, m: openM } = parseTime(hours.open, DEFAULT_OPENING_HOURS.open)
  const { h: closeH, m: closeM } = parseTime(hours.close, DEFAULT_OPENING_HOURS.close)
  // Weekday-evening shifts begin at close; weekend/bank-holiday shifts begin at
  // the day's opening time (cover runs from morning).
  const startH = band === 'weekday_evening' ? closeH : openH
  const startM = band === 'weekday_evening' ? closeM : openM
  const start = new Date(y, m - 1, d, startH, startM, 0, 0).getTime()
  const end = new Date(y, m - 1, d + 1, openH, openM, 0, 0).getTime()
  return { start, end }
}

/**
 * Whether the signed-in user is on call RIGHT NOW for an out-of-hours shift,
 * within a 1-hour grace either side of the shift window. The evening shift runs
 * into the next morning, so we consider both today's and yesterday's shift and
 * test each band-specific window. Returns the branch + band when on call, else
 * null. Drives the reminder banner AND the on-call "Log Call" permission, so the
 * two always agree.
 */
export async function getMyCurrentOncall(): Promise<{
  branchName: string
  band: OncallBand
  shiftDate: string
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const now = Date.now()
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const { data } = await supabase
    .from('oncall_shifts')
    .select('band, shift_date, branch:branches(name)')
    .eq('engineer_id', user.id)
    .in('shift_date', [ymd(yesterday), ymd(today)])

  const rows = (data ?? []) as unknown as {
    band: OncallBand
    shift_date: string
    branch: { name: string } | null
  }[]

  const { data: hoursRow } = await supabase
    .from('global_config')
    .select('value')
    .eq('key', OPENING_HOURS_KEY)
    .maybeSingle()
  const hours = parseOpeningHours((hoursRow as { value: unknown } | null)?.value)

  for (const row of rows) {
    const { start, end } = oncallWindow(row.shift_date, row.band, hours)
    if (now >= start - ONCALL_GRACE_MS && now <= end + ONCALL_GRACE_MS) {
      return { branchName: row.branch?.name ?? 'your branch', band: row.band, shiftDate: row.shift_date }
    }
  }
  return null
}

/** Re-export a couple of pure helpers for server consumers' convenience. */
export { deriveBand, rateForBand }

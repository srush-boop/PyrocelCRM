'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import { deriveBand, type OncallBand } from './types'

type Result = { ok: boolean; error?: string; id?: string }

interface AuthContext {
  userId: string
  role: string
  isManager: boolean
  branchId: string | null
  fullName: string | null
}

async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, auth: null as AuthContext | null, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, branch_id, full_name')
    .eq('id', user.id)
    .single()
  const p = (profile ?? {}) as { role?: string; branch_id?: string | null; full_name?: string | null }
  const role = p.role ?? ''
  const auth: AuthContext = {
    userId: user.id,
    role,
    isManager: ['admin', 'office'].includes(role),
    branchId: p.branch_id ?? null,
    fullName: p.full_name ?? null,
  }
  return { supabase, auth, error: null }
}

async function requireManager() {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { supabase: null, auth: null, error: error || 'Not authenticated' }
  if (!auth.isManager) return { supabase: null, auth: null, error: 'Not authorised' }
  return { supabase, auth, error: null }
}

/** Bank-holiday lookup for a single yyyy-mm-dd date. */
async function isBankHoliday(dateISO: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('calendar_entries')
    .select('id')
    .eq('source', 'uk-bank-holiday')
    .gte('start_at', `${dateISO}T00:00:00Z`)
    .lte('start_at', `${dateISO}T23:59:59Z`)
    .limit(1)
  return (data ?? []).length > 0
}

async function bandForDate(dateISO: string): Promise<OncallBand> {
  const bh = await isBankHoliday(dateISO)
  return deriveBand(dateISO, bh ? new Set([dateISO]) : new Set())
}

function revalidateOncall() {
  revalidatePath('/dashboard/oncall')
  revalidatePath('/dashboard/calendar')
}

// --------------------------------------------------------------------------
// Rota members
// --------------------------------------------------------------------------

export async function addRotaMember(branchId: string, engineerId: string): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  if (!branchId || !engineerId) return { ok: false, error: 'Branch and engineer are required' }
  const { error: insErr } = await supabase
    .from('oncall_rota_members')
    .upsert(
      { branch_id: branchId, engineer_id: engineerId, active: true },
      { onConflict: 'branch_id,engineer_id' },
    )
  if (insErr) return { ok: false, error: insErr.message }
  revalidateOncall()
  return { ok: true }
}

export async function setRotaMemberActive(id: string, active: boolean): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  const { error: upErr } = await supabase
    .from('oncall_rota_members')
    .update({ active })
    .eq('id', id)
  if (upErr) return { ok: false, error: upErr.message }
  revalidateOncall()
  return { ok: true }
}

export async function removeRotaMember(id: string): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  const { error: delErr } = await supabase.from('oncall_rota_members').delete().eq('id', id)
  if (delErr) return { ok: false, error: delErr.message }
  revalidateOncall()
  return { ok: true }
}

// --------------------------------------------------------------------------
// Shifts
// --------------------------------------------------------------------------

/**
 * Assign (or reassign) the on-call engineer for a branch on a date. The unique
 * (branch_id, shift_date) constraint guarantees one engineer per branch per
 * shift. Reassignments are recorded in the change log.
 */
export async function assignShift(input: {
  branchId: string
  shiftDate: string
  engineerId: string | null
  notes?: string | null
}): Promise<Result> {
  const { supabase, auth, error } = await requireManager()
  if (error || !supabase || !auth) return { ok: false, error: error! }
  const { branchId, shiftDate, engineerId } = input
  if (!branchId || !shiftDate) return { ok: false, error: 'Branch and date are required' }

  const band = await bandForDate(shiftDate)

  const { data: existing } = await supabase
    .from('oncall_shifts')
    .select('id, engineer_id, original_engineer_id')
    .eq('branch_id', branchId)
    .eq('shift_date', shiftDate)
    .maybeSingle()
  const prev = existing as { id: string; engineer_id: string | null; original_engineer_id: string | null } | null

  if (prev) {
    const { error: upErr } = await supabase
      .from('oncall_shifts')
      .update({
        engineer_id: engineerId,
        band,
        notes: input.notes ?? null,
        original_engineer_id: prev.original_engineer_id ?? prev.engineer_id ?? engineerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prev.id)
    if (upErr) return { ok: false, error: upErr.message }
    if (prev.engineer_id !== engineerId) {
      await logChange(supabase, {
        shiftId: prev.id,
        branchId,
        fromEngineerId: prev.engineer_id,
        toEngineerId: engineerId,
        changedBy: auth.userId,
        reason: 'Shift reassigned',
      })
    }
    revalidateOncall()
    return { ok: true, id: prev.id }
  }

  const { data: created, error: insErr } = await supabase
    .from('oncall_shifts')
    .insert({
      branch_id: branchId,
      shift_date: shiftDate,
      engineer_id: engineerId,
      original_engineer_id: engineerId,
      band,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: insErr?.message || 'Failed to create shift' }
  revalidateOncall()
  return { ok: true, id: (created as { id: string }).id }
}

export async function clearShift(shiftId: string): Promise<Result> {
  const { supabase, auth, error } = await requireManager()
  if (error || !supabase || !auth) return { ok: false, error: error! }
  const { data: shift } = await supabase
    .from('oncall_shifts')
    .select('id, branch_id, engineer_id')
    .eq('id', shiftId)
    .maybeSingle()
  const s = shift as { id: string; branch_id: string; engineer_id: string | null } | null
  if (!s) return { ok: false, error: 'Shift not found' }
  const { error: delErr } = await supabase.from('oncall_shifts').delete().eq('id', shiftId)
  if (delErr) return { ok: false, error: delErr.message }
  if (s.engineer_id) {
    await logChange(supabase, {
      shiftId: null,
      branchId: s.branch_id,
      fromEngineerId: s.engineer_id,
      toEngineerId: null,
      changedBy: auth.userId,
      reason: 'Shift cleared',
    })
  }
  revalidateOncall()
  return { ok: true }
}

// --------------------------------------------------------------------------
// Cover requests + messages
// --------------------------------------------------------------------------

/**
 * Raise a cover request. An on-call engineer (or a manager on their behalf)
 * asks their branch rota to cover a specific shift, a leave date-range, or a
 * general ask. All other active rota members in the branch are notified.
 */
export async function createCoverRequest(input: {
  kind: 'shift_cover' | 'leave_range' | 'general'
  shiftId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  message?: string | null
  branchId?: string | null
}): Promise<Result> {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { ok: false, error: error || 'Not authenticated' }

  // Resolve the branch: managers may pass one; engineers use their own.
  const branchId = (auth.isManager ? input.branchId : null) ?? auth.branchId
  if (!branchId) return { ok: false, error: 'No branch to raise the request for' }

  if (input.kind === 'shift_cover' && !input.shiftId)
    return { ok: false, error: 'Select the shift you need covered' }
  if (input.kind === 'leave_range' && (!input.dateFrom || !input.dateTo))
    return { ok: false, error: 'Enter the leave start and end dates' }

  const { data: created, error: insErr } = await supabase
    .from('oncall_cover_requests')
    .insert({
      requester_id: auth.userId,
      branch_id: branchId,
      kind: input.kind,
      status: 'open',
      shift_id: input.shiftId ?? null,
      date_from: input.dateFrom ?? null,
      date_to: input.dateTo ?? null,
      message: input.message?.trim() || null,
    })
    .select('id')
    .single()
  if (insErr || !created) return { ok: false, error: insErr?.message || 'Failed to raise request' }

  // Notify other active rota members in the branch.
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('oncall_rota_members')
    .select('engineer_id')
    .eq('branch_id', branchId)
    .eq('active', true)
  const recipients = ((members ?? []) as { engineer_id: string }[])
    .map((m) => m.engineer_id)
    .filter((id) => id !== auth.userId)
  if (recipients.length > 0) {
    await notifyUsers({
      userIds: recipients,
      title: 'On-call cover requested',
      body: `${auth.fullName ?? 'A colleague'} is looking for on-call cover.`,
      url: '/dashboard/oncall',
      category: 'oncall',
      data: { kind: 'oncall_cover_request', requestId: (created as { id: string }).id },
    })
  }
  revalidateOncall()
  return { ok: true, id: (created as { id: string }).id }
}

/**
 * Accept an open cover request. Reassigns the relevant shift(s) to the accepter
 * and records each change in the log, then notifies the requester.
 */
export async function acceptCoverRequest(requestId: string): Promise<Result> {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { ok: false, error: error || 'Not authenticated' }

  const { data: reqRow } = await supabase
    .from('oncall_cover_requests')
    .select('id, requester_id, branch_id, kind, status, shift_id, date_from, date_to')
    .eq('id', requestId)
    .maybeSingle()
  const req = reqRow as {
    id: string
    requester_id: string
    branch_id: string
    kind: string
    status: string
    shift_id: string | null
    date_from: string | null
    date_to: string | null
  } | null
  if (!req) return { ok: false, error: 'Request not found' }
  if (req.status !== 'open') return { ok: false, error: 'This request is no longer open' }
  if (req.requester_id === auth.userId) return { ok: false, error: 'You cannot cover your own request' }

  // Reassign the affected shifts to the accepter.
  if (req.kind === 'shift_cover' && req.shift_id) {
    await reassignShift(supabase, req.shift_id, auth.userId, requestId)
  } else if (req.date_from && req.date_to) {
    const { data: shifts } = await supabase
      .from('oncall_shifts')
      .select('id')
      .eq('branch_id', req.branch_id)
      .eq('engineer_id', req.requester_id)
      .gte('shift_date', req.date_from)
      .lte('shift_date', req.date_to)
    for (const s of (shifts ?? []) as { id: string }[]) {
      await reassignShift(supabase, s.id, auth.userId, requestId)
    }
  }

  const { error: upErr } = await supabase
    .from('oncall_cover_requests')
    .update({ status: 'accepted', accepted_by: auth.userId, accepted_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'open')
  if (upErr) return { ok: false, error: upErr.message }

  await notifyUsers({
    userIds: [req.requester_id],
    title: 'On-call cover accepted',
    body: `${auth.fullName ?? 'A colleague'} has accepted your on-call cover request.`,
    url: '/dashboard/oncall',
    category: 'oncall',
    data: { kind: 'oncall_cover_accepted', requestId },
  })
  revalidateOncall()
  return { ok: true }
}

export async function cancelCoverRequest(requestId: string): Promise<Result> {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { ok: false, error: error || 'Not authenticated' }
  const { error: upErr } = await supabase
    .from('oncall_cover_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
  if (upErr) return { ok: false, error: upErr.message }
  revalidateOncall()
  return { ok: true }
}

export async function sendCoverMessage(requestId: string, body: string): Promise<Result> {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { ok: false, error: error || 'Not authenticated' }
  const text = body.trim()
  if (!text) return { ok: false, error: 'Message is empty' }
  const { error: insErr } = await supabase
    .from('oncall_cover_messages')
    .insert({ request_id: requestId, sender_id: auth.userId, body: text })
  if (insErr) return { ok: false, error: insErr.message }

  // Notify the requester (if the sender isn't them).
  const { data: reqRow } = await supabase
    .from('oncall_cover_requests')
    .select('requester_id')
    .eq('id', requestId)
    .maybeSingle()
  const requesterId = (reqRow as { requester_id: string } | null)?.requester_id
  if (requesterId && requesterId !== auth.userId) {
    await notifyUsers({
      userIds: [requesterId],
      title: 'New message on your cover request',
      body: `${auth.fullName ?? 'A colleague'}: ${text.slice(0, 80)}`,
      url: '/dashboard/oncall',
      category: 'oncall',
      data: { kind: 'oncall_cover_message', requestId },
    })
  }
  revalidateOncall()
  return { ok: true }
}

// --------------------------------------------------------------------------
// Company settings: pay rates + external token
// --------------------------------------------------------------------------

export async function updateOncallRates(input: {
  weekdayEvening: number | null
  weekend: number | null
  bankHoliday: number | null
}): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  const { data: company } = await supabase.from('company_info').select('id').limit(1).maybeSingle()
  const companyId = (company as { id: string } | null)?.id
  const patch = {
    oncall_rate_weekday_evening: input.weekdayEvening,
    oncall_rate_weekend: input.weekend,
    oncall_rate_bank_holiday: input.bankHoliday,
  }
  const query = companyId
    ? supabase.from('company_info').update(patch).eq('id', companyId)
    : supabase.from('company_info').insert(patch)
  const { error: upErr } = await query
  if (upErr) return { ok: false, error: upErr.message }
  revalidatePath('/dashboard/oncall')
  revalidatePath('/dashboard/settings')
  return { ok: true }
}

/** Generate (or rotate) the unguessable external call-handler view token. */
export async function regenerateExternalToken(): Promise<Result & { token?: string }> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  const token = randomBytes(24).toString('base64url')
  const { data: company } = await supabase.from('company_info').select('id').limit(1).maybeSingle()
  const companyId = (company as { id: string } | null)?.id
  const query = companyId
    ? supabase.from('company_info').update({ oncall_external_token: token }).eq('id', companyId)
    : supabase.from('company_info').insert({ oncall_external_token: token })
  const { error: upErr } = await query
  if (upErr) return { ok: false, error: upErr.message }
  revalidatePath('/dashboard/oncall')
  revalidatePath('/dashboard/settings')
  return { ok: true, token }
}

// --------------------------------------------------------------------------
// internal helpers
// --------------------------------------------------------------------------

type DbClient = Awaited<ReturnType<typeof createClient>>

async function reassignShift(
  supabase: DbClient,
  shiftId: string,
  toEngineerId: string,
  requestId: string | null,
) {
  const { data: shift } = await supabase
    .from('oncall_shifts')
    .select('id, branch_id, engineer_id')
    .eq('id', shiftId)
    .maybeSingle()
  const s = shift as { id: string; branch_id: string; engineer_id: string | null } | null
  if (!s) return
  await supabase
    .from('oncall_shifts')
    .update({ engineer_id: toEngineerId, updated_at: new Date().toISOString() })
    .eq('id', shiftId)
  await logChange(supabase, {
    shiftId,
    branchId: s.branch_id,
    fromEngineerId: s.engineer_id,
    toEngineerId,
    changedBy: toEngineerId,
    reason: 'Cover accepted',
    requestId,
  })
}

async function logChange(
  supabase: DbClient,
  input: {
    shiftId: string | null
    branchId: string
    fromEngineerId: string | null
    toEngineerId: string | null
    changedBy: string
    reason: string
    requestId?: string | null
  },
) {
  await supabase.from('oncall_change_log').insert({
    shift_id: input.shiftId,
    branch_id: input.branchId,
    from_engineer_id: input.fromEngineerId,
    to_engineer_id: input.toEngineerId,
    changed_by: input.changedBy,
    reason: input.reason,
    request_id: input.requestId ?? null,
  })
}

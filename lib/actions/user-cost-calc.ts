'use server'

import { revalidatePath } from 'next/cache'
import { requireQueryToolsUser } from '@/lib/auth/query-tools'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/types/database'
import {
  parseIsoDate,
  workingTimeInRange,
  hourlyCostPence,
  normaliseName,
} from '@/lib/billing/user-cost-calc'

/** One parsed spreadsheet row: a person's name + their total cost (pounds). */
export interface CostUploadRow {
  name: string
  cost: number
}

export interface CostPreviewRow {
  name: string
  matched: boolean
  userId: string | null
  matchedName: string | null
  cost: number
  workingDays: number
  totalHours: number
  currentPence: number | null
  computedPence: number | null
  note: string | null
}

export interface CostPreviewResult {
  ok: boolean
  error?: string
  from?: string
  to?: string
  rows?: CostPreviewRow[]
  matchedCount?: number
  unmatchedCount?: number
}

type CostProfile = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'work_days'
  | 'work_day_hours'
  | 'work_start_time'
  | 'work_end_time'
  | 'lunch_minutes'
  | 'cost_per_hour_pence'
  | 'status'
>

async function loadProfiles(): Promise<CostProfile[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select(
      'id, full_name, work_days, work_day_hours, work_start_time, work_end_time, lunch_minutes, cost_per_hour_pence, status',
    )
  return (data as CostProfile[] | null) ?? []
}

/**
 * Compute, per uploaded row, the working days/hours in the range and the
 * resulting hourly cost — WITHOUT writing anything. Matches users by name.
 */
export async function previewUserCosts(
  rows: CostUploadRow[],
  from: string,
  to: string,
): Promise<CostPreviewResult> {
  const access = await requireQueryToolsUser()
  if (!access) return { ok: false, error: 'You do not have access to this tool.' }

  const fromDate = parseIsoDate(from)
  const toDate = parseIsoDate(to)
  if (!fromDate || !toDate) return { ok: false, error: 'Choose a valid date range.' }
  if (toDate < fromDate) return { ok: false, error: 'The end date must be on or after the start date.' }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'The spreadsheet contained no usable rows.' }
  }

  const profiles = await loadProfiles()
  // Build a name -> profile lookup. Collisions (two people, same name) are
  // flagged so the operator can resolve them rather than silently pick one.
  const byName = new Map<string, CostProfile[]>()
  for (const p of profiles) {
    const key = normaliseName(p.full_name ?? '')
    if (!key) continue
    const list = byName.get(key) ?? []
    list.push(p)
    byName.set(key, list)
  }

  const out: CostPreviewRow[] = []
  for (const raw of rows) {
    const name = (raw.name ?? '').trim()
    const cost = Number(raw.cost)
    if (!name) continue

    const matches = byName.get(normaliseName(name)) ?? []
    if (matches.length === 0) {
      out.push({
        name,
        matched: false,
        userId: null,
        matchedName: null,
        cost: Number.isFinite(cost) ? cost : 0,
        workingDays: 0,
        totalHours: 0,
        currentPence: null,
        computedPence: null,
        note: 'No matching user',
      })
      continue
    }
    if (matches.length > 1) {
      out.push({
        name,
        matched: false,
        userId: null,
        matchedName: null,
        cost: Number.isFinite(cost) ? cost : 0,
        workingDays: 0,
        totalHours: 0,
        currentPence: null,
        computedPence: null,
        note: `Ambiguous — ${matches.length} users share this name`,
      })
      continue
    }

    const p = matches[0]
    const { workingDays, totalHours } = workingTimeInRange(p, fromDate, toDate)
    const computedPence = hourlyCostPence(cost, totalHours)
    let note: string | null = null
    if (!Number.isFinite(cost) || cost < 0) note = 'Invalid cost value'
    else if (totalHours <= 0) note = 'No working hours in range'
    else if (p.status !== 'active') note = 'User is inactive'

    out.push({
      name,
      matched: true,
      userId: p.id,
      matchedName: p.full_name,
      cost: Number.isFinite(cost) ? cost : 0,
      workingDays,
      totalHours,
      currentPence: p.cost_per_hour_pence,
      computedPence,
      note,
    })
  }

  const matchedCount = out.filter((r) => r.matched && r.computedPence != null).length
  const unmatchedCount = out.length - matchedCount
  return { ok: true, from, to, rows: out, matchedCount, unmatchedCount }
}

export interface ApplyResult {
  ok: boolean
  error?: string
  updated?: number
}

/**
 * Write computed hourly costs onto the matched users' `cost_per_hour_pence`.
 * Only rows with a resolved user + computed value are applied.
 */
export async function applyUserCosts(
  updates: { userId: string; computedPence: number }[],
): Promise<ApplyResult> {
  const access = await requireQueryToolsUser()
  if (!access) return { ok: false, error: 'You do not have access to this tool.' }

  const clean = (updates ?? []).filter(
    (u) => u.userId && Number.isFinite(u.computedPence) && u.computedPence >= 0,
  )
  if (clean.length === 0) return { ok: false, error: 'Nothing to apply.' }

  const admin = createAdminClient()
  let updated = 0
  const now = new Date().toISOString()
  for (const u of clean) {
    const { error } = await admin
      .from('profiles')
      .update({ cost_per_hour_pence: Math.round(u.computedPence), updated_at: now })
      .eq('id', u.userId)
    if (!error) updated += 1
  }

  revalidatePath('/dashboard/labour-costs')
  revalidatePath('/dashboard/labour-costs/user-cost-calculator')
  return { ok: true, updated }
}

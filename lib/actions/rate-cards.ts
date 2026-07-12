'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'
import { RATE_BANDS, type RateBand, type RateCard } from '@/lib/billing/rate-cards'

// Server actions for managing banded call-out + labour rate cards (Settings ->
// Rates). Office/admin only; RLS also enforces this at the database level.

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'id' | 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return { supabase, userId: user.id }
}

interface RateCardRow {
  id: string
  name: string
  is_default: boolean
  include_travel_time: boolean
  min_labour_hours: number | string
  round_increment_hours: number | string
  active: boolean
  bands:
    | {
        band: string
        attendance_fee_pence: number
        attendance_included_hours: number | string
        hourly_rate_pence: number
      }[]
    | null
}

function mapRateCard(row: RateCardRow): RateCard {
  // Order bands consistently (standard, evening, weekend, bank_holiday).
  const byBand = new Map((row.bands ?? []).map((b) => [b.band, b]))
  const bands = RATE_BANDS.map((band) => {
    const b = byBand.get(band)
    return {
      band,
      attendance_fee_pence: Number(b?.attendance_fee_pence) || 0,
      attendance_included_hours: Number(b?.attendance_included_hours) || 0,
      hourly_rate_pence: Number(b?.hourly_rate_pence) || 0,
    }
  })
  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
    include_travel_time: row.include_travel_time,
    min_labour_hours: Number(row.min_labour_hours) || 0,
    round_increment_hours: Number(row.round_increment_hours) || 0,
    active: row.active,
    bands,
  }
}

export async function getRateCards(): Promise<RateCard[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rate_cards')
    .select(
      '*, bands:rate_card_bands(band, attendance_fee_pence, attendance_included_hours, hourly_rate_pence)',
    )
    .order('is_default', { ascending: false })
    .order('name')
  return ((data ?? []) as RateCardRow[]).map(mapRateCard)
}

// Ensure exactly one default: clears the flag on every other card.
async function clearOtherDefaults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keepId: string | null,
): Promise<void> {
  let q = supabase.from('rate_cards').update({ is_default: false }).eq('is_default', true)
  if (keepId) q = q.neq('id', keepId)
  await q
}

export async function createRateCard(input: {
  name: string
  includeTravelTime: boolean
  minLabourHours: number
  roundIncrementHours: number
  isDefault: boolean
}): Promise<{ error: string | null; id?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const name = input.name?.trim()
  if (!name) return { error: 'A name is required' }

  // A default must exist; force the very first card to be the default.
  const { count } = await supabase
    .from('rate_cards')
    .select('id', { count: 'exact', head: true })
  const isFirst = (count ?? 0) === 0
  const isDefault = input.isDefault || isFirst

  if (isDefault) await clearOtherDefaults(supabase, null)

  const { data: card, error } = await supabase
    .from('rate_cards')
    .insert({
      name,
      include_travel_time: !!input.includeTravelTime,
      min_labour_hours: clampHours(input.minLabourHours, 1),
      round_increment_hours: clampHours(input.roundIncrementHours, 0.5),
      is_default: isDefault,
      active: true,
    })
    .select('id')
    .single()
  if (error || !card) return { error: error?.message || 'Could not create the rate card' }

  const cardId = card.id as string
  const { error: bandError } = await supabase.from('rate_card_bands').insert(
    RATE_BANDS.map((band) => ({
      rate_card_id: cardId,
      band,
      attendance_fee_pence: 0,
      attendance_included_hours: 0,
      hourly_rate_pence: 0,
    })),
  )
  if (bandError) {
    await supabase.from('rate_cards').delete().eq('id', cardId)
    return { error: bandError.message }
  }

  revalidatePath('/dashboard/settings')
  return { error: null, id: cardId }
}

export async function updateRateCard(
  id: string,
  input: {
    name: string
    includeTravelTime: boolean
    minLabourHours: number
    roundIncrementHours: number
    isDefault: boolean
    active: boolean
  },
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const name = input.name?.trim()
  if (!name) return { error: 'A name is required' }

  // The default card must stay active and remain the default.
  const { data: existing } = await supabase
    .from('rate_cards')
    .select('is_default')
    .eq('id', id)
    .single()
  const wasDefault = (existing as { is_default: boolean } | null)?.is_default ?? false
  if (wasDefault && !input.isDefault) {
    return { error: 'Set another card as default first' }
  }
  // wasDefault implies input.isDefault here, so this collapses to input.isDefault.
  const nextDefault = input.isDefault || wasDefault

  if (nextDefault) await clearOtherDefaults(supabase, id)

  const { error } = await supabase
    .from('rate_cards')
    .update({
      name,
      include_travel_time: !!input.includeTravelTime,
      min_labour_hours: clampHours(input.minLabourHours, 1),
      round_increment_hours: clampHours(input.roundIncrementHours, 0.5),
      is_default: nextDefault,
      // The default card must stay active so pricing always resolves.
      active: nextDefault ? true : !!input.active,
    })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

export async function updateRateCardBand(
  cardId: string,
  band: RateBand,
  input: { attendanceFeePence: number; attendanceIncludedHours: number; hourlyRatePence: number },
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  if (!RATE_BANDS.includes(band)) return { error: 'Invalid band' }

  const { error } = await supabase
    .from('rate_card_bands')
    .update({
      attendance_fee_pence: Math.max(0, Math.round(Number(input.attendanceFeePence) || 0)),
      attendance_included_hours: Math.max(0, Number(input.attendanceIncludedHours) || 0),
      hourly_rate_pence: Math.max(0, Math.round(Number(input.hourlyRatePence) || 0)),
    })
    .eq('rate_card_id', cardId)
    .eq('band', band)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

export async function deleteRateCard(id: string): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { data: card } = await supabase
    .from('rate_cards')
    .select('is_default')
    .eq('id', id)
    .single()
  if ((card as { is_default: boolean } | null)?.is_default) {
    return { error: 'The default rate card cannot be deleted' }
  }

  // FK on billing_accounts.rate_card_id is ON DELETE SET NULL, so overrides
  // gracefully fall back to the default card.
  const { error } = await supabase.from('rate_cards').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}

// Clamp an hours value to a sensible non-negative number with a fallback.
function clampHours(value: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n * 100) / 100
}

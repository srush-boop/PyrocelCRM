'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MAX_SHORTCUTS } from '@/lib/dashboard/shortcuts'
import { DASHBOARD_BACKGROUND_KEYS } from '@/lib/dashboard/backgrounds'

/**
 * Persist a single dashboard tile's colour for the signed-in user. Passing a
 * null/empty colour clears the override so the tile falls back to the theme
 * default. Colours are stored as a { tileKey: hex } map on the user's profile
 * (RLS `profiles_update_own` scopes writes to their own row).
 */
export async function setTileColor(tileKey: string, color: string | null) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('dashboard_tile_colors')
    .eq('id', user.id)
    .single()

  if (readError) return { ok: false as const, error: readError.message }

  const colors: Record<string, string> = {
    ...((profile?.dashboard_tile_colors as Record<string, string> | null) ?? {}),
  }

  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    colors[tileKey] = color
  } else {
    delete colors[tileKey]
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ dashboard_tile_colors: colors })
    .eq('id', user.id)

  if (writeError) return { ok: false as const, error: writeError.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * Persist the signed-in user's preferred dashboard module tile order. Stored as
 * an ordered array of tile titles on their profile (RLS `profiles_update_own`).
 * Passing an empty array resets to the default order. Titles are stored as-is;
 * unknown/removed titles are ignored when the dashboard renders, and any new
 * tiles not present in the saved order are appended in their natural position.
 */
export async function setTileOrder(order: string[]) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  // De-duplicate while preserving order and drop non-string entries.
  const seen = new Set<string>()
  const clean = order.filter((t) => {
    if (typeof t !== 'string' || seen.has(t)) return false
    seen.add(t)
    return true
  })

  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_tile_positions: clean })
    .eq('id', user.id)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * Persist the signed-in user's dashboard background preset. `key` is a preset
 * key from the background catalogue; null (or "none") clears the preference back
 * to the default clean background. Stored on the profile (RLS
 * `profiles_update_own`).
 */
export async function setDashboardBackground(key: string | null) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  // Validate against the known catalogue; anything else clears the preference.
  const value = key && key !== 'none' && DASHBOARD_BACKGROUND_KEYS.has(key) ? key : null

  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_background: value })
    .eq('id', user.id)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * Set (or clear) one of the signed-in user's dashboard quick-shortcut slots.
 * `slot` is 0..MAX_SHORTCUTS-1; `key` is a catalogue key or null to clear the
 * slot. Stored as a compact array on the profile (RLS `profiles_update_own`).
 * Selecting a key already pinned to another slot moves it (clears the old slot)
 * so there are no duplicates.
 */
export async function setShortcut(slot: number, key: string | null) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SHORTCUTS) {
    return { ok: false as const, error: 'Invalid slot' }
  }
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('dashboard_shortcuts')
    .eq('id', user.id)
    .single()

  const current = ((profile?.dashboard_shortcuts as string[] | null) ?? []).slice(0, MAX_SHORTCUTS)
  while (current.length < MAX_SHORTCUTS) current.push('')
  // Clear the chosen key from any other slot to avoid duplicates.
  if (key) {
    for (let i = 0; i < current.length; i++) if (current[i] === key) current[i] = ''
  }
  current[slot] = key ?? ''
  // Trim trailing empties so the stored array stays compact.
  const next = current.filter((k, i) => k || current.slice(i + 1).some(Boolean))

  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_shortcuts: next })
    .eq('id', user.id)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

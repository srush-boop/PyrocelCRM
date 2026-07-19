'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

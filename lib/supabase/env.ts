/**
 * Central resolver for the Supabase URL + public (client-safe) key.
 *
 * Supabase is migrating from the legacy JWT "anon" key
 * (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, format `eyJ...`) to the new publishable key
 * (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, format `sb_publishable_...`). Both are
 * public, RLS-scoped keys and are interchangeable for `@supabase/ssr`, so we
 * accept whichever the environment provides. This keeps the app working across
 * the key transition instead of hard-failing when only one is present.
 *
 * Only `NEXT_PUBLIC_*` vars are referenced here (statically, not via a computed
 * key) so the values are inlined into both the browser bundle AND the edge
 * middleware bundle. Keep this module side-effect free for edge compatibility.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// Prefer the legacy anon key (currently configured + working here), fall back
// to the modern publishable key for environments that only provide the new one.
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

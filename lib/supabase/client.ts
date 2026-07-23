import { createBrowserClient } from '@supabase/ssr'

// Accept either public key: the legacy anon key (`eyJ...`) or the modern
// publishable key (`sb_publishable_...`). Both are client-safe + RLS-scoped and
// interchangeable for @supabase/ssr. Referencing process.env.NEXT_PUBLIC_*
// directly lets Next/Turbopack inline the values into the browser bundle.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '',
  )
}

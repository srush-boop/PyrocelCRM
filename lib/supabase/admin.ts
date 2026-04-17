import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses RLS.
 * NEVER expose this on the client side.
 * Only use in server-side code (API routes, Server Actions).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

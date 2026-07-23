import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

/**
 * Service-role client — bypasses RLS.
 * NEVER expose this on the client side.
 * Only use in server-side code (API routes, Server Actions).
 */
export function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

/**
 * Resolve the authenticated user + profile for the current request.
 *
 * Wrapped in React `cache()` so that the dashboard layout and the page it
 * renders (which run in parallel) share a SINGLE `getUser()` + profile lookup
 * per request, instead of each making their own network round-trip to the
 * Supabase auth server. Those duplicate, concurrent calls were the cause of
 * users being intermittently bounced to the login page on heavy/slow pages:
 * if one of the parallel auth calls timed out or lost a refresh-token rotation
 * race it returned `user = null`, logging out an otherwise-valid session.
 *
 * `getUser()` validates the token over the network, so a transient failure is
 * retried once before we treat the session as genuinely signed out.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient()

  let {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // A network/timeout error (rather than a real "no session") should not log a
  // valid user out — retry once before giving up.
  if (!user && error) {
    const retry = await supabase.auth.getUser()
    user = retry.data.user
  }

  if (!user) {
    return { supabase, user: null, profile: null as Profile | null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { supabase, user, profile: (profile as Profile) ?? null }
})

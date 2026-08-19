'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Clears the forced-password-change flag for the signed-in user.
 *
 * Called from the forced change-password screen AFTER the browser client has
 * successfully set a new password. RLS `profiles_update_own` scopes the write to
 * their own row, so a user can only ever clear their own flag.
 */
export async function clearMustChangePassword() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  const { error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true as const }
}

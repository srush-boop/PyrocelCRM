'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Persist the signed-in user's display name during the first-login walkthrough.
 * RLS `profiles_update_own` scopes the write to their own row.
 */
export async function saveOnboardingName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: 'Please enter your name' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: trimmed })
    .eq('id', user.id)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

/**
 * Mark the first-login profile walkthrough as finished (or skipped) by stamping
 * `onboarded_at`. Idempotent — only writes when the flag is still null so a
 * repeat call can't reset it. After this the wizard never shows again.
 */
export async function completeOnboarding() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in' }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('onboarded_at', null)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true as const }
}

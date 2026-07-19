import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAalState, mfaRequiredForRole } from '@/lib/auth/mfa'
import { MfaGate } from '@/components/auth/mfa-gate'
import type { Profile } from '@/lib/types/database'

export default async function MfaSetupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'role'> | null)?.role ?? null
  const aal = await getAalState(supabase)

  // Only force setup for roles that require MFA and haven't enrolled yet.
  if (!mfaRequiredForRole(role) || aal.hasVerifiedFactor) redirect('/dashboard')

  return <MfaGate mode="setup" />
}

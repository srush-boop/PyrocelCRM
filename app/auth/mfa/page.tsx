import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAalState } from '@/lib/auth/mfa'
import { MfaGate } from '@/components/auth/mfa-gate'

export default async function MfaChallengePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const aal = await getAalState(supabase)
  // Nothing to challenge — either already at aal2 or no factor at all.
  if (!aal.needsChallenge) redirect('/dashboard')

  return <MfaGate mode="challenge" />
}

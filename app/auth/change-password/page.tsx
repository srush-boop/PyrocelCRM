import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ForceChangePasswordForm } from '@/components/auth/force-change-password-form'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'Set your password',
}

// Renders at request time — the form uses a Supabase browser client and the gate
// below reads the live session.
export const dynamic = 'force-dynamic'

/**
 * Forced first-login password change. Only reachable while the signed-in user
 * still has `must_change_password` set; otherwise we bounce them to where they
 * belong. The dashboard layout redirects here whenever the flag is set.
 */
export default async function ChangePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, must_change_password')
    .eq('id', user.id)
    .single()

  const typed = profile as Pick<Profile, 'role' | 'must_change_password'> | null

  // Nothing to do — send them home rather than showing an orphan screen.
  if (!typed?.must_change_password) {
    redirect(typed?.role === 'client' ? '/portal' : '/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ForceChangePasswordForm />
    </div>
  )
}

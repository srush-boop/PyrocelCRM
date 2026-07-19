'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MfaChallenge } from '@/components/auth/mfa-challenge'
import { MfaEnroll } from '@/components/auth/mfa-enroll'

/**
 * Full-page gate shown when a signed-in user must either complete a TOTP
 * challenge (`mode="challenge"`) or set up MFA before continuing
 * (`mode="setup"`). On success it returns the user to the app.
 */
export function MfaGate({ mode }: { mode: 'challenge' | 'setup' }) {
  const router = useRouter()
  const supabase = createClient()

  const done = () => {
    router.push('/dashboard')
    router.refresh()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {mode === 'challenge' ? 'Two-factor authentication' : 'Set up two-factor authentication'}
          </CardTitle>
          <CardDescription>
            {mode === 'challenge'
              ? 'Confirm your identity to continue.'
              : 'Your role requires an authenticator app to protect this account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'challenge' ? (
            <MfaChallenge onVerified={done} />
          ) : (
            <MfaEnroll onEnrolled={done} />
          )}
          <Button variant="ghost" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

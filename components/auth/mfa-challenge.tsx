'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2 } from 'lucide-react'

interface MfaChallengeProps {
  /** Called once a TOTP challenge has been verified (session is now aal2). */
  onVerified: () => void
}

/**
 * Prompts for a TOTP code and verifies it against the user's first verified
 * factor, upgrading the current session from aal1 to aal2.
 */
export function MfaChallenge({ onVerified }: MfaChallengeProps) {
  const supabase = createClient()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async () => {
    if (code.length !== 6) return
    setLoading(true)
    setError(null)

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setLoading(false)
      setError(listError.message)
      return
    }
    const factor = (factors?.totp ?? []).find((f) => f.status === 'verified')
    if (!factor) {
      setLoading(false)
      setError('No authenticator is set up on this account.')
      return
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    })
    if (challengeError) {
      setLoading(false)
      setError(challengeError.message)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    })
    setLoading(false)
    if (verifyError) {
      setError('That code was not accepted. Check your authenticator app and try again.')
      setCode('')
      return
    }
    onVerified()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app to continue.
        </p>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          onComplete={verify}
          autoFocus
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }).map((_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={verify} disabled={loading || code.length !== 6} className="w-full gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Verify
      </Button>
    </div>
  )
}

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
    // Re-entrancy guard: the OTP field auto-submits via onComplete AND the
    // button can be clicked. TOTP codes are single-use, so a double-submit
    // would consume the code on the first request and fail the second — which
    // used to surface as "fails first time every time". Never run twice.
    if (loading) return
    // Authenticator apps (and paste) can include spaces; keep digits only.
    const cleanCode = code.replace(/\D/g, '')
    if (cleanCode.length !== 6) return
    setLoading(true)
    setError(null)

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      setLoading(false)
      setError(listError.message)
      return
    }
    // Try EVERY verified factor, not just the first. A user may have more than
    // one authenticator enrolled (e.g. Google + Microsoft), and the code only
    // matches the factor it was generated from. Only challenging the first
    // factor meant codes from any additional authenticator never verified.
    const verifiedFactors = (factors?.totp ?? []).filter((f) => f.status === 'verified')
    if (verifiedFactors.length === 0) {
      setLoading(false)
      setError('No authenticator is set up on this account.')
      return
    }

    let lastError: string | null = null
    for (const factor of verifiedFactors) {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      })
      if (challengeError) {
        lastError = challengeError.message
        continue
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: cleanCode,
      })
      if (!verifyError) {
        // Matched this factor — session is now aal2.
        onVerified()
        return
      }
      lastError = verifyError.message
    }

    // None of the enrolled authenticators accepted the code.
    setLoading(false)
    setError(
      'That code was not accepted. Enter the current code from your authenticator app. If it keeps failing, check that your phone\u2019s date & time is set to automatic.',
    )
    setCode('')
    void lastError
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

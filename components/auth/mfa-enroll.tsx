'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2, ShieldCheck } from 'lucide-react'

interface MfaEnrollProps {
  /** Called once a factor has been enrolled AND verified (session is now aal2). */
  onEnrolled?: () => void
}

/**
 * Reusable TOTP enrolment flow: enroll -> show QR + secret -> verify a 6-digit
 * code -> factor becomes verified and the session is upgraded to aal2.
 * Used by both Settings → Security and the forced MFA setup page.
 */
export function MfaEnroll({ onEnrolled }: MfaEnrollProps) {
  const supabase = createClient()
  const [step, setStep] = useState<'idle' | 'scan'>('idle')
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEnroll = async () => {
    setLoading(true)
    setError(null)
    // Clean up any half-finished (unverified) factors first so re-enrolling
    // doesn't accumulate stale factors or hit the factor limit.
    const { data: factors } = await supabase.auth.mfa.listFactors()
    for (const f of factors?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator (${new Date().toLocaleDateString()})`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setStep('scan')
  }

  const verify = async () => {
    if (!factorId || code.length !== 6) return
    setLoading(true)
    setError(null)
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    })
    if (challengeError) {
      setLoading(false)
      setError(challengeError.message)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    })
    setLoading(false)
    if (verifyError) {
      setError('That code was not accepted. Check your authenticator app and try again.')
      setCode('')
      return
    }
    onEnrolled?.()
  }

  if (step === 'idle') {
    return (
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button onClick={startEnroll} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Set up authenticator app
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open your authenticator app (Google Authenticator, Authy, 1Password, etc.).</li>
        <li>Scan the QR code below, or enter the setup key manually.</li>
        <li>Enter the 6-digit code the app shows to confirm.</li>
      </ol>

      {qr && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
          {/* Supabase returns the QR as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr || '/placeholder.svg'} alt="MFA QR code" className="h-44 w-44" />
          {secret && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Setup key</p>
              <code className="break-all text-sm font-medium">{secret}</code>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Enter the 6-digit code</p>
        <InputOTP maxLength={6} value={code} onChange={setCode}>
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

      <Button onClick={verify} disabled={loading || code.length !== 6} className="gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Verify and enable
      </Button>
    </div>
  )
}

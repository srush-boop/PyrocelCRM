'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { MfaEnroll } from '@/components/auth/mfa-enroll'
import { ShieldCheck, ShieldAlert, Loader2, Trash2 } from 'lucide-react'

interface MfaFactorSummary {
  id: string
  friendlyName: string | null
  createdAt: string
}

interface SecuritySettingsProps {
  /** Verified TOTP factors the user currently has. */
  initialFactors: MfaFactorSummary[]
  /** Whether this user's role is required to have MFA enabled. */
  required: boolean
}

export function SecuritySettings({ initialFactors, required }: SecuritySettingsProps) {
  const supabase = createClient()
  const [factors, setFactors] = useState<MfaFactorSummary[]>(initialFactors)
  const [enrolling, setEnrolling] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    const verified = (data?.totp ?? [])
      .filter((f) => f.status === 'verified')
      .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at }))
    setFactors(verified)
  }

  const handleEnrolled = async () => {
    setEnrolling(false)
    await refresh()
  }

  const handleRemove = async (factorId: string) => {
    setRemovingId(factorId)
    setError(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    setRemovingId(null)
    if (error) {
      setError(
        error.message.includes('aal2')
          ? 'Please sign out and back in (completing your code) before removing an authenticator.'
          : error.message,
      )
      return
    }
    await refresh()
  }

  const hasMfa = factors.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-Factor Authentication
          {hasMfa ? (
            <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
              <ShieldCheck className="h-3 w-3" /> Enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> Not set up
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Add a time-based one-time code from an authenticator app as a second step when signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {required && !hasMfa && (
          <Alert variant="destructive">
            <AlertDescription>
              Your role requires two-factor authentication. Please set it up now to keep access to
              your account.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {hasMfa && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {factors.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">
                      {f.friendlyName || 'Authenticator app'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(f.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive"
                  onClick={() => handleRemove(f.id)}
                  disabled={removingId === f.id}
                >
                  {removingId === f.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {enrolling ? (
          <div className="rounded-lg border border-border p-4">
            <MfaEnroll onEnrolled={handleEnrolled} />
          </div>
        ) : (
          <Button
            variant={hasMfa ? 'outline' : 'default'}
            className="gap-2"
            onClick={() => setEnrolling(true)}
          >
            <ShieldCheck className="h-4 w-4" />
            {hasMfa ? 'Add another authenticator' : 'Set up authenticator app'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

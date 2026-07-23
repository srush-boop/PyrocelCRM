'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { MfaChallenge } from '@/components/auth/mfa-challenge'

interface LoginFormProps {
  /** Logo shown above the form. Defaults to the Pyrocel logo. */
  logoUrl?: string
  /** Alt text / accessible label for the logo. */
  logoAlt?: string
  /** Bold title under the logo. */
  title?: string
  /** Muted description under the title. */
  subtitle?: string
  /** Optional positive tagline shown beneath the card header. */
  tagline?: string
  /** Optional notice (e.g. an inactive-account message) shown above the form. */
  notice?: string
}

export function LoginForm({
  logoUrl = '/images/pyrocel-logo.png',
  logoAlt = 'Pyrocel logo',
  title = 'PYROCEL LTD',
  subtitle = 'Service & Compliance Management',
  tagline,
  notice,
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // When the account has MFA enabled we switch to a second step to collect the
  // authenticator code before completing the login.
  const [needsChallenge, setNeedsChallenge] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Resolve where to land (portal for clients, dashboard for staff) and go.
  const finishLogin = async (userId?: string) => {
    // Record the successful login in the app audit trail (best-effort; never
    // blocks the redirect). The session cookie is set by now so the server
    // route can resolve the user and capture IP + user-agent.
    void fetch('/api/audit/login', { method: 'POST' }).catch(() => {})

    let destination = '/dashboard'
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      if (profile?.role === 'client') destination = '/portal'
    }
    router.push(destination)
    router.refresh()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If the account has a verified TOTP factor, the session starts at aal1 and
    // must be upgraded via a challenge before we let them in.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
      setLoading(false)
      setNeedsChallenge(true)
      return
    }

    await finishLogin(data.user?.id)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-56 w-56 items-center justify-center bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl || '/placeholder.svg'} alt={logoAlt} className="h-full w-full object-contain" />
        </div>
        <CardDescription>{subtitle}</CardDescription>
        {tagline && (
          <p className="mt-2 text-sm font-medium text-primary text-balance">{tagline}</p>
        )}
      </CardHeader>
      <CardContent>
        {needsChallenge ? (
          <div className="space-y-4">
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">Two-factor authentication</p>
            </div>
            <MfaChallenge onVerified={() => finishLogin()} />
          </div>
        ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          {notice && !error && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
        )}
      </CardContent>
    </Card>
  )
}

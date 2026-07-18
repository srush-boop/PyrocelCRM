'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

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
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Route client logins to the read-only portal, staff to the dashboard.
      let destination = '/dashboard'
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()
        if (profile?.role === 'client') destination = '/portal'
      }
      router.push(destination)
      router.refresh()
    }
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
            <Label htmlFor="password">Password</Label>
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
      </CardContent>
    </Card>
  )
}

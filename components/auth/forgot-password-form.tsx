'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, MailCheck } from 'lucide-react'

/**
 * Self-service "forgot password" step 1: request a reset email.
 *
 * We always show the same success message whether or not the address exists,
 * so the form can't be used to enumerate which emails have accounts. The email
 * link lands on /auth/callback which exchanges the recovery code for a session
 * and forwards to /auth/update-password to set the new password.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

    setLoading(false)
    // Deliberately do not surface "user not found" — treat all outcomes the
    // same to avoid account enumeration. Only show genuine transport errors.
    if (error && error.status && error.status >= 500) {
      setError('Something went wrong sending the email. Please try again shortly.')
      return
    }
    setSent(true)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          {sent
            ? 'Check your inbox for a reset link.'
            : 'Enter your email and we&apos;ll send you a link to set a new password.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              {'If an account exists for '}
              <span className="font-medium text-foreground">{email.trim()}</span>
              {', a password reset link is on its way. The link expires shortly, so use it soon.'}
            </p>
            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending link...
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
            <div className="text-center">
              <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

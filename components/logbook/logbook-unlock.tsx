'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { unlockLogbook } from '@/app/logbook/[siteId]/actions'
import { Lock, ShieldCheck } from 'lucide-react'

export function LogbookUnlock({ siteId, siteName }: { siteId: string; siteName: string }) {
  const router = useRouter()
  const [postcode, setPostcode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await unlockLogbook(siteId, postcode)
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? 'Unable to unlock the log book.')
      }
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-balance">Fire Safety Log Book</CardTitle>
          <CardDescription className="text-pretty">{siteName}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="postcode">Site postcode</Label>
              <Input
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="e.g. AB12 3CD"
                autoComplete="off"
                autoCapitalize="characters"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the site postcode to view and add log book entries.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Checking…' : 'Unlock log book'}
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Access is recorded and protected.
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

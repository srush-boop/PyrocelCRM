'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Shared error-boundary UI for dashboard route segments. Rendered by each
 * segment's `error.tsx`, which Next.js mounts (inside the surrounding layout,
 * so the sidebar/nav stay intact) when a Server Component throws. Gives the
 * user a clear message and a one-click retry instead of a blank/broken screen.
 */
export function RouteError({
  error,
  reset,
  title = 'Something went wrong',
  description = 'We couldn’t load this page. This is usually temporary — try again.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  useEffect(() => {
    // Surface the error for debugging/observability.
    console.error('[v0] route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md border-destructive/30">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          </div>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
          )}
          <Button onClick={reset} className="gap-2">
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

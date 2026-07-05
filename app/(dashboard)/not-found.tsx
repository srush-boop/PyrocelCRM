import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Home, RotateCcw } from 'lucide-react'

/**
 * Friendly recovery page for any not-found route inside the dashboard.
 *
 * This most commonly appears when an engineer has kept the app open for a long
 * time (e.g. added to their phone home screen) and a new version has since been
 * deployed — the old page tries to load assets that no longer exist. Rather than
 * a dead-end 404, give them clear ways back to work.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-balance text-xl">This page could not be found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-pretty text-sm text-muted-foreground">
            The page may have moved, or the app was updated while it was open. Reload to get the
            latest version, or jump straight back to your calls.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full gap-2">
              <Link href="/dashboard/schedule">
                <CalendarDays className="h-4 w-4" />
                Go to my calls
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href="/dashboard" prefetch={false}>
                <Home className="h-4 w-4" />
                Dashboard home
              </Link>
            </Button>
            {/* A full document navigation clears any stale client bundle. */}
            <Button asChild variant="ghost" className="w-full gap-2">
              <a href="/dashboard/schedule">
                <RotateCcw className="h-4 w-4" />
                Reload the app
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

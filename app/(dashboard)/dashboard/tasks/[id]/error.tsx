'use client'

import { RouteError } from '@/components/dashboard/route-error'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Couldn’t load this call"
      description="There was a problem loading the call details. Try again, or go back to the schedule."
    />
  )
}

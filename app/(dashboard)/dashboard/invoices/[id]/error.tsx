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
      title="Couldn’t load this invoice"
      description="There was a problem loading the invoice. Try again, or head back to the invoices list."
    />
  )
}

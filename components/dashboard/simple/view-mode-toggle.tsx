'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Persists the user's manual override in a cookie the server reads on the next
// paint, so switching views never flashes. `full` forces the full dashboard on
// mobile; clearing it returns to the device-default Simple Mode.
const COOKIE = 'app_view'
const ONE_YEAR = 60 * 60 * 24 * 365

function setView(value: 'full' | null) {
  if (value === 'full') {
    document.cookie = `${COOKIE}=full; path=/; max-age=${ONE_YEAR}; samesite=lax`
  } else {
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`
  }
}

/**
 * `mode="to-full"` renders a "View full site" control (shown in the simple top
 * bar); `mode="to-simple"` renders a "Back to simple app" control (shown when a
 * mobile user has forced the full site).
 */
export function ViewModeToggle({
  mode,
  className,
}: {
  mode: 'to-full' | 'to-simple'
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    setView(mode === 'to-full' ? 'full' : null)
    startTransition(() => router.refresh())
  }

  if (mode === 'to-full') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={pending}
        className={className}
      >
        <Monitor className="mr-2 h-4 w-4" />
        Full site
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className={className}
    >
      <Smartphone className="mr-2 h-4 w-4" />
      Back to simple app
    </Button>
  )
}

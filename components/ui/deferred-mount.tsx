'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'

/**
 * Defers rendering of a heavy subtree by one tick so the triggering
 * interaction (e.g. switching to a tab that mounts a large component) can
 * paint immediately instead of blocking on the expensive mount.
 *
 * On first render it shows `fallback`, then mounts `children` inside a
 * transition (low priority, interruptible) after the initial paint. This keeps
 * INP low without changing any surrounding state/URL logic.
 */
export function DeferredMount({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const [ready, setReady] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    startTransition(() => setReady(true))
  }, [])

  return <>{ready ? children : fallback}</>
}

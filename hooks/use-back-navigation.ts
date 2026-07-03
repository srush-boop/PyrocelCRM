'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Returns a handler that navigates the user to the previous page.
 *
 * It uses the real browser history when there is an in-app entry to go back to
 * (e.g. the user arrived here from the Calls list, a site page, defects, etc.),
 * so "Back" always returns to wherever they came from. When there is no such
 * history — a direct link, a fresh load, or a hard refresh — it falls back to a
 * sensible parent route instead of doing nothing.
 */
export function useBackNavigation(fallback = '/dashboard') {
  const router = useRouter()

  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallback)
    }
  }, [router, fallback])
}

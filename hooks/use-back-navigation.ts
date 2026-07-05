'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Returns a handler that navigates the user back to where they came from.
 *
 * Resolution order (most reliable first):
 *  1. An explicit `?from=` query param on the current URL. Callers that link
 *     into a detail screen (e.g. the schedule opening a call) pass the origin
 *     route here, which makes "Back" deterministic even after a hard refresh,
 *     when opened in a new tab, or inside an embedded preview — cases where
 *     `router.back()` / `window.history` are unreliable.
 *  2. Genuine in-app browser history via `router.back()`.
 *  3. A sensible `fallback` parent route.
 */
export function useBackNavigation(fallback = '/dashboard') {
  const router = useRouter()
  const searchParams = useSearchParams()

  return useCallback(() => {
    // 1. Prefer an explicit origin passed by the linking page. Only honour
    //    same-origin in-app paths to avoid open-redirect style navigation.
    const from = searchParams.get('from')
    if (from && from.startsWith('/') && !from.startsWith('//')) {
      router.push(from)
      return
    }

    // 2. Use real history only when there is an entry to go back to.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    // 3. Otherwise fall back to a known parent route.
    router.push(fallback)
  }, [router, searchParams, fallback])
}

'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { labelForPath } from '@/lib/navigation-labels'

/**
 * Resolves back-navigation for a detail screen and returns both the handler
 * and a human-friendly label for the destination, so callers can render
 * "Back to X".
 *
 * Resolution order (most reliable first):
 *  1. An explicit `?from=` query param on the current URL. Callers that link
 *     into a detail screen (e.g. the schedule opening a call) pass the origin
 *     route here, which makes "Back" deterministic even after a hard refresh,
 *     when opened in a new tab, or inside an embedded preview — cases where
 *     `router.back()` / `window.history` are unreliable.
 *  2. Genuine in-app browser history via `router.back()`.
 *  3. A sensible `fallback` parent route.
 *
 * The returned `label` reflects the best-known destination: the `?from=`
 * origin when present, otherwise the `fallback` (history is not a resolvable
 * path, so the fallback is the most accurate name we can show).
 */
export function useBackNavigation(fallback = '/dashboard') {
  const router = useRouter()
  const searchParams = useSearchParams()

  const from = searchParams.get('from')
  const isSafeFrom = !!from && from.startsWith('/') && !from.startsWith('//')

  const goBack = useCallback(() => {
    // 1. Prefer an explicit origin passed by the linking page. Only honour
    //    same-origin in-app paths to avoid open-redirect style navigation.
    if (isSafeFrom && from) {
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
  }, [router, from, isSafeFrom, fallback])

  const destination = isSafeFrom && from ? from : fallback
  const label = useMemo(() => labelForPath(destination), [destination])

  return { goBack, destination, label }
}

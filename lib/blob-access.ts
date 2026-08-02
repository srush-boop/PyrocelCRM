import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-object authorization policy for the two GENERIC blob delivery proxies
 * (`/api/blob` and `/api/file`).
 *
 * Both routes take an arbitrary `?pathname=` and stream the bytes, so without a
 * policy any signed-in user — including a read-only portal CLIENT — could fetch
 * *any* private object by guessing its pathname (e.g. `tender-vault/…`, another
 * user's `signatures/…`, internal team `chat/…` images). Sensitive stores each
 * have their own dedicated, authorization-checked file route; these generic
 * proxies must therefore only serve the handful of low-sensitivity prefixes
 * they were built for, and only to the right audience.
 *
 * `staffOnly` prefixes are refused for `role === 'client'` so nothing internal
 * leaks into the customer portal.
 */
interface PrefixRule {
  prefix: string
  staffOnly: boolean
}

const ROUTE_POLICIES: Record<'blob' | 'file', PrefixRule[]> = {
  // /api/blob — referenced by blobSrc(): profile avatars + internal chat images.
  blob: [
    { prefix: 'avatars/', staffOnly: false },
    { prefix: 'chat/', staffOnly: true },
    // Supporting documents attached to inbound requests (admin/office inbox).
    { prefix: 'requests/', staffOnly: true },
    // Author-uploaded reference images on internal task / form templates. Shown
    // to every user filling the form (incl. subcontractors), so not staff-only.
    { prefix: 'internal-task-templates/', staffOnly: false },
  ],
  // /api/file — internal sales/product assets.
  file: [
    { prefix: 'catalogue/', staffOnly: true },
    { prefix: 'spec-templates/', staffOnly: true },
  ],
}

export type BlobRoute = keyof typeof ROUTE_POLICIES

/**
 * Decide whether the current user may read `pathname` through the given generic
 * route. Returns null when allowed, or an HTTP status + message when not.
 */
export async function authorizeBlobAccess(
  route: BlobRoute,
  pathname: string,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ status: number; message: string } | null> {
  // Defensive: reject anything that isn't a plain forward key.
  if (!pathname || pathname.startsWith('/') || pathname.includes('..')) {
    return { status: 400, message: 'Invalid pathname' }
  }

  const rule = ROUTE_POLICIES[route].find((r) => pathname.startsWith(r.prefix))
  if (!rule) {
    // Not a prefix this proxy is allowed to serve — force callers to the
    // dedicated, authorization-checked route for that store instead.
    return { status: 403, message: 'Forbidden' }
  }

  if (rule.staffOnly) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (!profile || profile.role === 'client') {
      return { status: 403, message: 'Forbidden' }
    }
  }

  return null
}

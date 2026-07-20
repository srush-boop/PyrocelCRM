import { getPublicBaseUrl } from '@/lib/rams/base-url'

/**
 * Converts a stored Blob reference into a usable <img>/<a> src.
 *
 * The Blob store is private, so we persist the object *pathname* (not a public
 * URL) and stream bytes through the authenticated `/api/blob` route. Legacy rows
 * may still hold a full `http(s)` URL from before the store was private — those
 * are passed through unchanged so existing content keeps working.
 */
export function blobSrc(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (
    ref.startsWith('http://') ||
    ref.startsWith('https://') ||
    ref.startsWith('/api/blob') ||
    ref.startsWith('data:')
  ) {
    return ref
  }
  return `/api/blob?pathname=${encodeURIComponent(ref)}`
}

/**
 * Like `blobSrc`, but for signatures. Signatures are rendered on CLIENT-FACING,
 * unauthenticated surfaces (public token reports at /r/[token]) and inside
 * server-generated RAMS PDFs, so they are streamed through the PUBLIC delivery
 * route `/api/signature` rather than the session-gated `/api/blob`.
 *
 * Pass `absolute` when the URL is consumed off-page (e.g. @react-pdf fetching the
 * image server-side), which needs a fully-qualified origin.
 */
export function signatureSrc(
  ref: string | null | undefined,
  opts: { absolute?: boolean } = {},
): string | null {
  if (!ref) return null
  // Client sign-off signatures are captured on-device and stored inline as a PNG
  // data URL — render them directly (works on public token reports + PDFs too).
  if (ref.startsWith('data:')) return ref
  // Legacy rows may hold a full public URL from before the store was private.
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref

  const path = ref.startsWith('/api/signature')
    ? ref
    : `/api/signature?pathname=${encodeURIComponent(ref)}`

  if (opts.absolute) {
    return `${getPublicBaseUrl()}${path}`
  }
  return path
}

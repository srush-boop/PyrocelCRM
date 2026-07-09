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
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/api/blob')) {
    return ref
  }
  return `/api/blob?pathname=${encodeURIComponent(ref)}`
}

// Shared VAPID public-key resolver.
//
// A VAPID *public* key is public by design — it is shipped to every browser to
// create a push subscription — so it is safe to embed in code. The private key
// is NEVER placed here; it stays in the VAPID_PRIVATE_KEY env var (server only).
//
// This resolver exists because the public key has repeatedly been corrupted
// when pasted into the env-var UI (e.g. a password landed in the field),
// producing atob "string contains invalid characters" failures. We therefore
// prefer the env value ONLY when it is a structurally valid P-256 VAPID key,
// and otherwise fall back to the known-good key generated for this project.

// Known-good public key (matched pair to the configured VAPID_PRIVATE_KEY).
const FALLBACK_VAPID_PUBLIC_KEY =
  'BAp-jCRhpMAOd0ahbVu5KTQxK7JDGWdDYsKyG_RV6giut_G1HABw7-bP8fSyEZPPwq1k8Y3W29MOLkzBOOXTjAc'

/** Strip accidental surrounding quotes/whitespace from an env value. */
function clean(value: string | undefined | null): string {
  if (!value) return ''
  return value.trim().replace(/^['"]|['"]$/g, '').trim()
}

/**
 * Decode a base64url string to bytes in both browser and Node without throwing
 * on the common padding/charset differences. Returns null when it cannot be
 * decoded as valid base64url.
 */
function decodeBase64Url(input: string): Uint8Array | null {
  if (!input || /[^A-Za-z0-9\-_]/.test(input)) return null
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  try {
    if (typeof atob === 'function') {
      const raw = atob(base64)
      const out = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
      return out
    }
    return new Uint8Array(Buffer.from(base64, 'base64'))
  } catch {
    return null
  }
}

/** A valid VAPID public key is an uncompressed P-256 point: 65 bytes, 0x04 lead. */
export function isValidVapidPublicKey(value: string | undefined | null): boolean {
  const bytes = decodeBase64Url(clean(value))
  return !!bytes && bytes.length === 65 && bytes[0] === 0x04
}

/**
 * The public key to use everywhere. Prefers a valid env value, else the
 * baked-in known-good key. Never returns an invalid value.
 */
export function getVapidPublicKey(): string {
  const fromEnv = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  if (isValidVapidPublicKey(fromEnv)) return fromEnv
  return FALLBACK_VAPID_PUBLIC_KEY
}

/** Base64url → Uint8Array for `applicationServerKey`. Throws only if truly unusable. */
export function vapidPublicKeyToBytes(): Uint8Array {
  const bytes = decodeBase64Url(getVapidPublicKey())
  if (!bytes) throw new Error('VAPID public key could not be decoded')
  return bytes
}

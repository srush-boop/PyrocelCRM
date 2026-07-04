// Resolves the public base URL for building links in outbound emails.
// Prefers an explicitly configured site URL, then falls back to the Vercel
// deployment URL, then to localhost for local development.
export function getPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'http://localhost:3000'
}

// Resolves the public base URL for building links in outbound emails.
// Prefers an explicitly configured site URL, then falls back to the Vercel
// deployment URL, then to localhost for local development.
export function getPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const crm = process.env.CRM_URL?.trim()
  if (crm) return crm.replace(/\/$/, '')

  // The production domain is public; per-deployment VERCEL_URLs sit behind
  // Vercel Authentication and send recipients to the Vercel login page.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) return `https://${production.replace(/\/$/, '')}`

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'http://localhost:3000'
}

const isProd = process.env.NODE_ENV === 'production'

// Derive the Supabase origins so the browser is allowed to talk to the REST
// API (https) and Realtime (wss) endpoints, but nothing else off-origin.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseHttp = supabaseUrl || ''
const supabaseWss = supabaseUrl ? supabaseUrl.replace(/^https:\/\//, 'wss://') : ''

// Content-Security-Policy. This is intentionally a "reasonable" policy rather
// than a strict nonce-based one: Next.js injects inline bootstrap/hydration
// scripts and some UI (e.g. the shadcn chart) injects an inline <style>, and a
// per-request nonce would force every page into dynamic rendering. So we keep
// 'unsafe-inline' for script/style but lock down everything else — object-src,
// base-uri, form-action, frame-ancestors and scoped connect/img sources — which
// still removes the most common injection vectors.
const cspDirectives = [
  ["default-src", ["'self'"]],
  // 'unsafe-eval' is only needed by the dev server (React Refresh); never in prod.
  ["script-src", ["'self'", "'unsafe-inline'", ...(isProd ? [] : ["'unsafe-eval'"])]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  // Same-origin images plus data/blob URIs (canvas, signatures) and OSM map tiles.
  [
    "img-src",
    ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', supabaseHttp].filter(Boolean),
  ],
  ["font-src", ["'self'", 'data:']],
  // XHR/fetch/websocket targets: our own origin + Supabase REST and Realtime.
  ["connect-src", ["'self'", supabaseHttp, supabaseWss].filter(Boolean)],
  ["media-src", ["'self'", 'blob:', 'data:']],
  ["worker-src", ["'self'", 'blob:']],
  ["manifest-src", ["'self'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  // Anti-clickjacking. In dev the v0 preview renders us inside an iframe, so we
  // must not restrict framing there or the preview goes blank.
  ...(isProd ? [["frame-ancestors", ["'self'"]]] : []),
  ...(isProd ? [["upgrade-insecure-requests", []]] : []),
]

const contentSecurityPolicy = cspDirectives
  .map(([directive, values]) => (values.length ? `${directive} ${values.join(' ')}` : directive))
  .join('; ')

// Security headers applied to every response. These are safe defaults that
// don't change app behaviour.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Stop browsers MIME-sniffing responses away from the declared content-type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full URLs (which can contain ids) to other origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down powerful browser features we don't use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()',
  },
  // Legacy XSS filter switch for older browsers.
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  ...(isProd
    ? [
        // Clickjacking protection — only in production so the dev preview iframe still works.
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // Force HTTPS for two years, including subdomains.
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  // Friendly aliases: the real login route lives at /auth/login, but /login and
  // similar are common paths people (and old bookmarks) hit — forward them so
  // they never 404. Public sign-up is intentionally disabled, so sign-up style
  // paths also land on the login page.
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signin', destination: '/auth/login', permanent: true },
      { source: '/sign-in', destination: '/auth/login', permanent: true },
    ]
  },
}

export default nextConfig

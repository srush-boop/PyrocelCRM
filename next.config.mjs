const isProd = process.env.NODE_ENV === 'production'

// Security headers applied to every response. These are safe defaults that
// don't change app behaviour. Note: the anti-framing header is only sent in
// production, because the v0/dev preview renders the app inside an iframe and
// would be blocked by it otherwise.
const securityHeaders = [
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
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
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
  typescript: {
    ignoreBuildErrors: true,
  },
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
}

export default nextConfig

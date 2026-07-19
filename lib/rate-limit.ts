import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { NextResponse } from 'next/server'

/**
 * Centralised application-level rate limiting backed by Upstash Redis.
 *
 * Supabase Auth has its own built-in limits, but our custom API routes
 * (AI endpoints, public webhooks, external-API proxies) are otherwise
 * unthrottled. These sliding-window limiters protect them from abuse and
 * runaway cost.
 *
 * If the Upstash env vars are absent (e.g. local dev without the integration)
 * we fail OPEN — rate limiting is skipped rather than blocking all traffic.
 */
const hasRedis = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

const redis = hasRedis
  ? new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : null

function make(tokens: number, window: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix: `rl:${prefix}`,
  })
}

/**
 * Named limiters. Tune per surface:
 *  - `auth`   — credential/reset attempts (per IP). Strict.
 *  - `ai`     — expensive LLM calls (per user/IP). Moderate.
 *  - `public` — unauthenticated endpoints e.g. address search, webhooks.
 */
export const limiters = {
  auth: make(10, '10 m', 'auth'),
  ai: make(20, '1 m', 'ai'),
  public: make(30, '1 m', 'public'),
} as const

export type LimiterName = keyof typeof limiters

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

/**
 * Enforce a named limiter for a given identifier. Returns a 429 NextResponse
 * when the caller is over the limit, or null when the request may proceed.
 */
export async function enforceRateLimit(
  name: LimiterName,
  identifier: string,
): Promise<NextResponse | null> {
  const limiter = limiters[name]
  if (!limiter) return null // fail open when Redis isn't configured

  const { success, limit, remaining, reset } = await limiter.limit(identifier)
  if (success) return null

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset),
      },
    },
  )
}

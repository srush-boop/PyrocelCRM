import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Background GPS ingest for the native lone-worker apps.
 *
 * The Transistorsoft background-geolocation plugin posts fixes here directly from
 * native code — including while the app is closed or the phone is locked — with
 * an `Authorization: Bearer <deviceSecret>` header. We authenticate by matching
 * the secret's hash to a registered device (no session cookie is available on
 * this native background request), then stamp the worker's active session with
 * fresh coordinates. This also serves as a heartbeat, since a live native app is
 * posting even when the WebView is suspended.
 *
 * Always returns 200 on success so the plugin marks the record synced and does
 * not retry indefinitely.
 */
function extractFix(
  body: unknown,
): { lat: number; lng: number; accuracy: number | null } | null {
  // The plugin can post a single location object or an array of them; accept the
  // most recent and be defensive about the exact shape.
  const record = Array.isArray(body) ? body[body.length - 1] : body
  if (!record || typeof record !== 'object') return null
  const r = record as Record<string, unknown>
  const coords = (r.coords ?? (r.location as Record<string, unknown> | undefined)?.coords) as
    | Record<string, unknown>
    | undefined
  if (!coords) return null
  const lat = Number(coords.latitude)
  const lng = Number(coords.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const acc = Number(coords.accuracy)
  return { lat, lng, accuracy: Number.isFinite(acc) ? acc : null }
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Missing credentials' }, { status: 401 })
  }

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex')
  const admin = createAdminClient()

  const { data: device } = await admin
    .from('lone_worker_devices')
    .select('id, user_id')
    .eq('device_secret_hash', secretHash)
    .is('revoked_at', null)
    .maybeSingle()

  if (!device) {
    return NextResponse.json({ ok: false, error: 'Unknown device' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const fix = extractFix(body)
  const nowIso = new Date().toISOString()

  // Keep the device's last-seen fresh regardless of whether this post carried a
  // usable fix (some posts are motion-activity or heartbeat records).
  await admin.from('lone_worker_devices').update({ last_seen_at: nowIso }).eq('id', device.id)

  if (fix) {
    await admin
      .from('lone_worker_sessions')
      .update({
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_accuracy: fix.accuracy,
        location_updated_at: nowIso,
        last_heartbeat_at: nowIso,
      })
      .eq('user_id', device.user_id)
      .eq('status', 'active')
  }

  return NextResponse.json({ ok: true })
}

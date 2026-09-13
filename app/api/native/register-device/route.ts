import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicBaseUrl } from '@/lib/rams/base-url'

/**
 * Registers a native app install for the lone-worker safety feature. Called from
 * the client (inside the native shell) once per app open, authenticated by the
 * WebView's Supabase session cookie.
 *
 * Returns a freshly minted `deviceSecret` (stored only as a hash) that the
 * native background-geolocation plugin uses to authenticate GPS pings it posts
 * directly to the ingest endpoint while the app is closed, plus the absolute
 * `ingestUrl` to post them to.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body: {
    platform?: string
    pushToken?: string | null
    pushProvider?: string | null
    deviceModel?: string | null
    appVersion?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null
  if (!platform) {
    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
  }

  const secret = crypto.randomBytes(32).toString('hex')
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex')
  const pushToken = body.pushToken || null
  const pushProvider =
    body.pushProvider === 'fcm' || body.pushProvider === 'apns' ? body.pushProvider : null
  const nowIso = new Date().toISOString()

  const admin = createAdminClient()

  // Rotate the secret on the existing row for this push token if we have one, so
  // repeat opens don't pile up device rows; otherwise insert a fresh row.
  let updatedExisting = false
  if (pushToken) {
    const { data: existing } = await admin
      .from('lone_worker_devices')
      .select('id')
      .eq('user_id', user.id)
      .eq('push_token', pushToken)
      .maybeSingle()
    if (existing?.id) {
      await admin
        .from('lone_worker_devices')
        .update({
          platform,
          push_provider: pushProvider,
          device_secret_hash: secretHash,
          device_model: body.deviceModel || null,
          app_version: body.appVersion || null,
          last_seen_at: nowIso,
          revoked_at: null,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
      updatedExisting = true
    }
  }

  if (!updatedExisting) {
    await admin.from('lone_worker_devices').insert({
      user_id: user.id,
      platform,
      push_token: pushToken,
      push_provider: pushProvider,
      device_secret_hash: secretHash,
      device_model: body.deviceModel || null,
      app_version: body.appVersion || null,
      last_seen_at: nowIso,
    })
  }

  return NextResponse.json({
    deviceSecret: secret,
    ingestUrl: `${getPublicBaseUrl()}/api/lone-worker/location`,
  })
}

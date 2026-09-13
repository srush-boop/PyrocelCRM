import 'server-only'
import crypto from 'node:crypto'

/**
 * Server-side native push sender (Firebase Cloud Messaging HTTP v1).
 *
 * FCM delivers to Android directly and to iOS via APNs once an APNs auth key is
 * uploaded to the Firebase project (see the native-app runbook), so a single
 * sender covers both native platforms. This is the channel that pops a native
 * notification on a locked phone with the app closed.
 *
 * Config-gated like the SMS backstop: if `FCM_SERVICE_ACCOUNT` /
 * `FCM_PROJECT_ID` are absent it is a clean no-op and never breaks the
 * escalation state machine. Every send is best-effort.
 */

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id?: string
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ServiceAccount
    if (!parsed.client_email || !parsed.private_key) return null
    return parsed
  } catch {
    return null
  }
}

function projectId(sa: ServiceAccount): string | null {
  return process.env.FCM_PROJECT_ID || sa.project_id || null
}

export const nativePushConfigured = serviceAccount() !== null

// --- OAuth2 access token (cached ~55 min) ---------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const signature = base64url(signer.sign(sa.private_key))
  const assertion = `${header}.${claim}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    console.log('[v0] FCM token exchange failed:', res.status)
    return null
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

export interface NativePushTarget {
  token: string
}

export async function sendNativePush(
  targets: NativePushTarget[],
  message: { title: string; body: string; url?: string; critical?: boolean },
): Promise<{ sent: number; failed: number; skipped?: boolean }> {
  const sa = serviceAccount()
  const tokens = targets.map((t) => t.token).filter(Boolean)
  if (!sa || tokens.length === 0) return { sent: 0, failed: 0, skipped: true }
  const pid = projectId(sa)
  if (!pid) return { sent: 0, failed: 0, skipped: true }

  const accessToken = await getAccessToken(sa)
  if (!accessToken) return { sent: 0, failed: tokens.length }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${pid}/messages:send`
  let sent = 0
  let failed = 0

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.url ? { url: message.url } : undefined,
              android: {
                priority: 'HIGH',
                notification: { channelId: 'lone-worker', sound: 'default' },
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                  ...(message.critical ? { 'apns-push-type': 'alert' } : {}),
                },
                payload: {
                  aps: {
                    sound: message.critical
                      ? { critical: 1, name: 'default', volume: 1 }
                      : 'default',
                    'interruption-level': message.critical ? 'critical' : 'time-sensitive',
                  },
                },
              },
            },
          }),
        })
        if (res.ok) sent += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }),
  )

  return { sent, failed }
}

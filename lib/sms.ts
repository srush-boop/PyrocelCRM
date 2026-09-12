import 'server-only'

/**
 * Minimal outbound SMS via Twilio's REST API (no SDK — a single fetch keeps the
 * dependency surface small). SMS is the out-of-band channel that reaches a
 * locked phone with the browser closed, which is exactly the failure mode the
 * lone-worker feature needs to survive.
 *
 * Activates only when Twilio credentials are configured, mirroring how web push
 * activates only when VAPID keys are present. When unconfigured, sends are
 * no-ops that report `skipped` so callers (e.g. the escalation backstop) never
 * break — the email + push channels still fire.
 *
 * Required env vars:
 *  - TWILIO_ACCOUNT_SID
 *  - TWILIO_AUTH_TOKEN
 *  - TWILIO_FROM_NUMBER      (an SMS-capable Twilio number, E.164, e.g. +447...)
 *      OR
 *  - TWILIO_MESSAGING_SERVICE_SID (preferred for pools / UK sender IDs)
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID

export const smsConfigured = Boolean(
  ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SERVICE_SID),
)

/**
 * Best-effort normalisation to E.164. Assumes UK (+44) numbers when a national
 * format is given, since this is a UK operation. Returns null when the value
 * can't be turned into something plausibly diallable.
 */
export function normalisePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/[\s()\-.]/g, '')
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '')
    return digits.length >= 8 ? `+${digits}` : null
  }
  // 00 international prefix → +
  if (s.startsWith('00')) {
    const digits = s.slice(2).replace(/\D/g, '')
    return digits.length >= 8 ? `+${digits}` : null
  }
  // UK national: leading 0 → +44
  s = s.replace(/\D/g, '')
  if (s.startsWith('0')) {
    const digits = s.slice(1)
    return digits.length >= 9 ? `+44${digits}` : null
  }
  // Bare 44... without +
  if (s.startsWith('44')) {
    return s.length >= 11 ? `+${s}` : null
  }
  return s.length >= 8 ? `+${s}` : null
}

export interface SendSmsResult {
  success: boolean
  skipped?: boolean
  error?: string
  sid?: string
}

/** Send a single SMS. Never throws — returns a result object. */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!smsConfigured) return { success: false, skipped: true, error: 'SMS not configured' }
  const dest = normalisePhoneE164(to)
  if (!dest) return { success: false, error: 'Invalid destination number' }

  const params = new URLSearchParams()
  params.set('To', dest)
  params.set('Body', body)
  if (MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', MESSAGING_SERVICE_SID)
  else if (FROM_NUMBER) params.set('From', FROM_NUMBER)

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )
    if (!res.ok) {
      const detail = await res.text()
      console.log('[v0] SMS send failed:', res.status, detail.slice(0, 200))
      return { success: false, error: `Twilio ${res.status}` }
    }
    const json = (await res.json()) as { sid?: string }
    return { success: true, sid: json.sid }
  } catch (err) {
    console.log('[v0] SMS send error:', (err as Error).message)
    return { success: false, error: (err as Error).message }
  }
}

/** Fan-out helper: send the same message to many numbers, de-duplicated. */
export async function sendSmsBulk(
  numbers: (string | null | undefined)[],
  body: string,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!smsConfigured) return { sent: 0, failed: 0, skipped: true }
  const unique = Array.from(
    new Set(numbers.map((n) => normalisePhoneE164(n)).filter((n): n is string => Boolean(n))),
  )
  let sent = 0
  let failed = 0
  await Promise.all(
    unique.map(async (n) => {
      const r = await sendSms(n, body)
      if (r.success) sent += 1
      else failed += 1
    }),
  )
  return { sent, failed, skipped: false }
}

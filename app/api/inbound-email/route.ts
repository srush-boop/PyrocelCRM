import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triageInboundRequest } from '@/lib/ai/triage-inbound-request'

// Inbound email arrives here from the mail provider (Resend Inbound, Postmark,
// Mailgun, SendGrid, Cloudflare Email Worker, …). The provider is configured to
// POST each received email to this URL. We store it as an `inbound_requests`
// row (source='email') and immediately triage it so a suggested action appears
// in the Requests inbox. Nothing is auto-created — a human still approves.
//
// SECURITY: this endpoint is public (the mail provider is unauthenticated), so
// it is protected by a shared secret. Set INBOUND_EMAIL_SECRET and include it
// either as `?token=<secret>` in the webhook URL or an `x-inbound-secret`
// header. Without the env var configured the route refuses all requests.

export const runtime = 'nodejs'
// Triage calls an LLM; give it room beyond the default.
export const maxDuration = 60

interface NormalizedEmail {
  fromEmail: string | null
  fromName: string | null
  toEmail: string | null
  subject: string | null
  text: string | null
  html: string | null
}

/** Pull "Name <email>" apart into its two parts. */
function parseAddress(raw: unknown): { email: string | null; name: string | null } {
  if (!raw) return { email: null, name: null }
  // Some providers give an object { email, name }.
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const email = typeof o.email === 'string' ? o.email : typeof o.address === 'string' ? o.address : null
    const name = typeof o.name === 'string' ? o.name : null
    return { email: email?.toLowerCase().trim() ?? null, name: name?.trim() ?? null }
  }
  if (typeof raw !== 'string') return { email: null, name: null }
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) {
    return { name: m[1].trim() || null, email: m[2].toLowerCase().trim() }
  }
  return { email: raw.toLowerCase().trim(), name: null }
}

/** First value from something that might be a string or an array of them. */
function firstOf(v: unknown): unknown {
  if (Array.isArray(v)) return v[0]
  return v
}

/**
 * Normalize the many provider payload shapes into one structure. Handles the
 * common JSON shapes (Resend `data.*`, Postmark, Mailgun, generic top-level)
 * and form-encoded bodies (SendGrid Inbound Parse).
 */
function normalize(payload: Record<string, unknown>): NormalizedEmail {
  // Resend wraps the email in `data`; others put fields at the top level.
  const d = (payload.data && typeof payload.data === 'object'
    ? (payload.data as Record<string, unknown>)
    : payload) as Record<string, unknown>

  const from = parseAddress(
    firstOf(d.from) ?? d.From ?? d.sender ?? d.from_email ?? d['From']
  )
  const to = parseAddress(firstOf(d.to) ?? d.To ?? d.recipient ?? d.to_email)

  const subject =
    (typeof d.subject === 'string' && d.subject) ||
    (typeof d.Subject === 'string' && d.Subject) ||
    null

  const text =
    (typeof d.text === 'string' && d.text) ||
    (typeof d.TextBody === 'string' && d.TextBody) ||
    (typeof d['body-plain'] === 'string' && d['body-plain']) ||
    (typeof d.plain === 'string' && d.plain) ||
    null

  const html =
    (typeof d.html === 'string' && d.html) ||
    (typeof d.HtmlBody === 'string' && d.HtmlBody) ||
    (typeof d['body-html'] === 'string' && d['body-html']) ||
    null

  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmail: to.email,
    subject: subject || null,
    text: text || null,
    html: html || null,
  }
}

async function readPayload(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await req.json()) as Record<string, unknown>
  }
  // Form-encoded / multipart (e.g. SendGrid Inbound Parse).
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await req.formData()
    const obj: Record<string, unknown> = {}
    for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : v.name
    return obj
  }
  // Last resort: try JSON.
  try {
    return JSON.parse(await req.text()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  // 1. Auth: shared secret must be configured and must match.
  const expected = process.env.INBOUND_EMAIL_SECRET?.trim()
  if (!expected) {
    console.warn('[v0] inbound-email: INBOUND_EMAIL_SECRET not set; rejecting.')
    return NextResponse.json(
      { error: 'Inbound email is not configured.' },
      { status: 503 },
    )
  }
  const url = new URL(req.url)
  const provided =
    req.headers.get('x-inbound-secret')?.trim() ||
    url.searchParams.get('token')?.trim() ||
    ''
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  // 2. Parse + normalize.
  let payload: Record<string, unknown>
  try {
    payload = await readPayload(req)
  } catch (err) {
    console.log('[v0] inbound-email: failed to parse body:', (err as Error).message)
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const email = normalize(payload)
  if (!email.text && !email.html && !email.subject) {
    return NextResponse.json({ error: 'Empty email.' }, { status: 400 })
  }

  // 3. Store (service role — no authenticated user in a webhook).
  const supabase = createAdminClient()
  const { data: inserted, error: insErr } = await supabase
    .from('inbound_requests')
    .insert({
      source: 'email',
      from_email: email.fromEmail,
      from_name: email.fromName,
      to_email: email.toEmail,
      subject: email.subject,
      body_text: email.text,
      body_html: email.html,
      status: 'new',
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.log('[v0] inbound-email: insert failed:', insErr?.message)
    return NextResponse.json({ error: 'Could not store email.' }, { status: 500 })
  }

  const id = (inserted as { id: string }).id

  // 4. Best-effort triage. Never fail the webhook on triage errors — the row is
  // saved and can be re-triaged from the inbox. Returning 200 quickly also stops
  // providers from retrying/duplicating the delivery.
  try {
    await triageInboundRequest(id)
  } catch (err) {
    console.log('[v0] inbound-email: triage error:', (err as Error).message)
  }

  return NextResponse.json({ ok: true, id }, { status: 200 })
}

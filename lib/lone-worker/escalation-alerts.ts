import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send-email'
import { sendSmsBulk, smsConfigured } from '@/lib/sms'
import { getPublicBaseUrl } from '@/lib/rams/base-url'
import type { SessionRow } from './engine'

/**
 * Out-of-band escalation backstop for lone-worker alerts.
 *
 * Web push is the only channel that reaches a closed browser, and it is
 * unreliable (iOS only delivers to an installed PWA, some Android browsers drop
 * it). For a safety-critical feature that isn't good enough, so amber/red
 * escalations ALSO go out over email (always, via Resend) and SMS (emergencies,
 * via Twilio when configured). Email + SMS reach a locked phone with the app
 * shut, which is exactly the failure mode that was causing missed alerts.
 *
 * Every send is best-effort: a provider failure must never break the state
 * machine. Called once per level from the engine's escalation guard, so it is
 * naturally idempotent (one email/SMS burst per amber and per red).
 */

interface MonitorContact {
  id: string
  name: string
  email: string | null
  phone: string | null
}

// SMS defaults to emergencies (red) only to control cost. Set
// LONE_WORKER_SMS_ON_AMBER=true to also text on the amber warning.
const SMS_ON_AMBER = process.env.LONE_WORKER_SMS_ON_AMBER === 'true'

function mapsLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function alertEmailHtml(opts: {
  heading: string
  intro: string
  workerName: string
  shiftEnd: string
  locationLink: string | null
  accuracy: number | null
  monitorUrl: string
  isRed: boolean
}): string {
  const accent = opts.isRed ? '#b91c1c' : '#b45309'
  const loc = opts.locationLink
    ? `<p style="margin:0 0 8px"><strong>Last known location:</strong> <a href="${opts.locationLink}" style="color:${accent}">Open in Google Maps</a>${
        opts.accuracy != null ? ` (±${Math.round(opts.accuracy)} m GPS accuracy)` : ''
      }</p>`
    : `<p style="margin:0 0 8px;color:#6b7280"><strong>Location:</strong> not available from the worker's device.</p>`
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:${accent};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-size:18px;letter-spacing:.02em">${opts.heading}</h1>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:20px">
      <p style="margin:0 0 12px;font-size:15px">${opts.intro}</p>
      <p style="margin:0 0 8px"><strong>Worker:</strong> ${opts.workerName}</p>
      <p style="margin:0 0 8px"><strong>Shift ends:</strong> ${opts.shiftEnd}</p>
      ${loc}
      <p style="margin:16px 0 0">
        <a href="${opts.monitorUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Open the lone-worker monitor</a>
      </p>
    </div>
  </div>`
}

async function loadContacts(
  admin: SupabaseClient,
  workerId: string,
): Promise<{ worker: MonitorContact | null; monitors: MonitorContact[] }> {
  const [{ data: workerRow }, { data: monRows }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, phone, secondary_phone')
      .eq('id', workerId)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id, full_name, email, phone')
      .or('role.in.(admin,office),can_manage_lone_worker.eq.true')
      .eq('status', 'active'),
  ])

  const w = workerRow as
    | { id: string; full_name: string | null; email: string | null; phone: string | null; secondary_phone: string | null }
    | null
  const worker: MonitorContact | null = w
    ? { id: w.id, name: w.full_name || w.email || 'Lone worker', email: w.email, phone: w.phone || w.secondary_phone }
    : null

  const monitors: MonitorContact[] = (
    (monRows ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null }[]
  )
    .filter((m) => m.id !== workerId)
    .map((m) => ({ id: m.id, name: m.full_name || m.email || 'Monitor', email: m.email, phone: m.phone }))

  return { worker, monitors }
}

function shiftEndLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

export async function sendEscalationAlerts(
  admin: SupabaseClient,
  opts: {
    session: SessionRow
    level: 'amber' | 'red'
    workerName: string
    lat: number | null
    lng: number | null
    accuracy: number | null
    eventId: string | null
  },
): Promise<void> {
  const isRed = opts.level === 'red'
  const { worker, monitors } = await loadContacts(admin, opts.session.user_id)
  const baseUrl = getPublicBaseUrl()
  const monitorUrl = `${baseUrl}/dashboard/lone-worker`
  const link = mapsLink(opts.lat, opts.lng)
  const shiftEnd = shiftEndLabel(opts.session.shift_end)

  // ---- Email (always, both levels) --------------------------------------
  let emailSent = false
  try {
    const monitorHtml = alertEmailHtml({
      heading: isRed ? 'LONE WORKER EMERGENCY' : 'Lone worker warning',
      intro: isRed
        ? `${opts.workerName} has NOT confirmed they are safe after a missed check-in. This is an emergency escalation — please respond immediately.`
        : `${opts.workerName} has missed a safety check-in and has not yet confirmed they are safe. It will escalate to an emergency if not resolved.`,
      workerName: opts.workerName,
      shiftEnd,
      locationLink: link,
      accuracy: opts.accuracy,
      monitorUrl,
      isRed,
    })
    const monitorSubject = isRed
      ? `EMERGENCY: ${opts.workerName} — lone worker not responding`
      : `Warning: ${opts.workerName} missed a lone-worker check-in`

    const sends: Promise<unknown>[] = []
    for (const m of monitors) {
      if (m.email) sends.push(sendEmail(m.email, monitorSubject, monitorHtml))
    }
    // Also nudge the worker's own inbox — a second channel to prompt them.
    if (worker?.email) {
      const workerHtml = alertEmailHtml({
        heading: isRed ? 'Confirm you are safe' : 'Safety check-in overdue',
        intro: isRed
          ? 'An emergency alert has been raised because you have not confirmed you are safe. Open the app and confirm immediately, or contact the office.'
          : 'You have missed a safety check-in. Open the app and confirm you are safe to reset your timer before this escalates.',
        workerName: opts.workerName,
        shiftEnd,
        locationLink: null,
        accuracy: null,
        monitorUrl: `${baseUrl}/dashboard`,
        isRed,
      })
      sends.push(
        sendEmail(
          worker.email,
          isRed ? 'EMERGENCY: confirm you are safe' : 'Your lone-worker check-in is overdue',
          workerHtml,
        ),
      )
    }
    if (sends.length > 0) {
      await Promise.all(sends)
      emailSent = true
    }
  } catch (err) {
    console.log('[v0] lone-worker escalation email failed:', (err as Error).message)
  }

  // ---- SMS (emergencies by default; amber when opted in) -----------------
  let smsSent = false
  if (smsConfigured && (isRed || SMS_ON_AMBER)) {
    try {
      const locPart = link ? ` Location: ${link}` : ' Location unavailable.'
      const monitorMsg = isRed
        ? `PYROCEL EMERGENCY: ${opts.workerName} has not confirmed they are safe (lone worker). Respond now.${locPart}`
        : `PYROCEL: ${opts.workerName} missed a lone-worker check-in and hasn't confirmed safety.${locPart}`
      const workerMsg = isRed
        ? `PYROCEL: An emergency alert was raised because you haven't confirmed you're safe. Open the app to confirm, or call the office.`
        : `PYROCEL: Your lone-worker check-in is overdue. Open the app to confirm you're safe.`

      const results = await Promise.all([
        sendSmsBulk(monitors.map((m) => m.phone), monitorMsg),
        worker?.phone ? sendSmsBulk([worker.phone], workerMsg) : Promise.resolve({ sent: 0, failed: 0, skipped: true }),
      ])
      smsSent = results.some((r) => r.sent > 0)
    } catch (err) {
      console.log('[v0] lone-worker escalation SMS failed:', (err as Error).message)
    }
  }

  // ---- Audit: stamp what actually went out on the event ------------------
  if (opts.eventId && (emailSent || smsSent)) {
    const patch: Record<string, string> = {}
    if (emailSent) patch.email_sent_at = new Date().toISOString()
    if (smsSent) patch.sms_sent_at = new Date().toISOString()
    try {
      await admin.from('lone_worker_events').update(patch).eq('id', opts.eventId)
    } catch (err) {
      console.log('[v0] lone-worker alert audit stamp failed:', (err as Error).message)
    }
  }
}

import { sendEmail } from './send-email'
import {
  buildICS,
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEventInput,
} from '@/lib/calendar-invite'

// Pyrocel brand palette (kept in step with lib/email/templates.ts).
const BRAND = {
  red: '#c8362b',
  charcoal: '#1f2937',
  ink: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
}

export interface BookingConfirmationData {
  /** Recipient greeting name (site or client contact). */
  contactName?: string | null
  siteName: string
  siteAddress?: string | null
  callTypeName: string
  /** Pretty date, e.g. "Tuesday, 14 July 2026". */
  dateLabel: string
  /** Pretty time range, e.g. "09:00 – 11:00", or null when no slot booked. */
  timeLabel?: string | null
  /** Free-text notes shown to the client (optional). */
  notes?: string | null
  companyName: string
  /** Calendar event used for the .ics + add-to-calendar links. */
  event: CalendarEventInput
}

// Escape user-supplied text before dropping it into HTML.
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Build the branded booking confirmation email HTML. */
export function buildBookingConfirmationHtml(data: BookingConfirmationData): string {
  const google = googleCalendarUrl(data.event)
  const outlook = outlookCalendarUrl(data.event)
  const greeting = data.contactName ? `Hi ${esc(data.contactName)},` : 'Hello,'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
      <div style="background:${BRAND.charcoal};padding:20px 24px;">
        <span style="color:#ffffff;font-size:18px;font-weight:bold;">${esc(data.companyName)}</span>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 8px;font-size:20px;color:${BRAND.ink};">Your appointment is booked</h1>
        <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14px;line-height:1.5;">${greeting}</p>
        <p style="margin:0 0 20px;color:${BRAND.ink};font-size:14px;line-height:1.6;">
          We&apos;ve booked a visit to <strong>${esc(data.siteName)}</strong>. The details are below —
          you can add this to your own calendar using the buttons.
        </p>

        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:${BRAND.muted};width:120px;">Visit</td>
            <td style="padding:8px 0;color:${BRAND.ink};font-weight:bold;">${esc(data.callTypeName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:${BRAND.muted};">Date</td>
            <td style="padding:8px 0;color:${BRAND.ink};font-weight:bold;">${esc(data.dateLabel)}</td>
          </tr>
          ${
            data.timeLabel
              ? `<tr><td style="padding:8px 0;color:${BRAND.muted};">Time</td><td style="padding:8px 0;color:${BRAND.ink};font-weight:bold;">${esc(data.timeLabel)}</td></tr>`
              : ''
          }
          <tr>
            <td style="padding:8px 0;color:${BRAND.muted};">Site</td>
            <td style="padding:8px 0;color:${BRAND.ink};">${esc(data.siteName)}${data.siteAddress ? `<br/><span style="color:${BRAND.muted};">${esc(data.siteAddress)}</span>` : ''}</td>
          </tr>
          ${
            data.notes
              ? `<tr><td style="padding:8px 0;color:${BRAND.muted};vertical-align:top;">Notes</td><td style="padding:8px 0;color:${BRAND.ink};">${esc(data.notes)}</td></tr>`
              : ''
          }
        </table>

        <div style="margin:0 0 8px;">
          <a href="${google}" style="display:inline-block;background:${BRAND.red};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:bold;margin:0 8px 8px 0;">Add to Google Calendar</a>
          <a href="${outlook}" style="display:inline-block;background:${BRAND.charcoal};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:bold;margin:0 8px 8px 0;">Add to Outlook</a>
        </div>
        <p style="margin:8px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.5;">
          An .ics calendar file is attached — open it to add the appointment to Apple Calendar or any
          other calendar app.
        </p>
      </div>
      <div style="padding:16px 24px;border-top:1px solid ${BRAND.line};color:${BRAND.muted};font-size:12px;">
        ${esc(data.companyName)} · If you need to rearrange, please reply to this email or call us.
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Send the booking confirmation to one or more recipients with the .ics
 * attached. Best-effort: never throws — returns how many sends succeeded so the
 * caller (booking flow) is never blocked by email problems.
 */
export async function sendBookingConfirmation(
  recipients: string[],
  data: BookingConfirmationData,
): Promise<{ sent: number }> {
  const unique = Array.from(
    new Set(
      recipients
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /.+@.+\..+/.test(e)),
    ),
  )
  if (unique.length === 0) return { sent: 0 }

  const html = buildBookingConfirmationHtml(data)
  const subject = `Appointment booked — ${data.siteName} (${data.dateLabel})`
  const ics = buildICS(data.event)
  const attachments = [{ filename: 'appointment.ics', content: Buffer.from(ics, 'utf-8') }]

  let sent = 0
  for (const to of unique) {
    try {
      const res = await sendEmail(to, subject, html, { attachments })
      if (res.success) sent += 1
    } catch (err) {
      console.log('[v0] Booking confirmation send failed:', (err as Error).message)
    }
  }
  return { sent }
}

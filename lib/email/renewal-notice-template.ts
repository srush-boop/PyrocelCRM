import { formatPence } from '@/lib/billing/invoices'
import { RECURRING_FREQUENCY_LABELS, annualOccurrences } from '@/lib/billing/recurring'
import type { RecurringFrequency } from '@/lib/types/database'

export interface RenewalNoticeLine {
  description: string
  /** The system this charge relates to, e.g. "Fire Alarm". Null if unknown. */
  systemType?: string | null
  frequency: RecurringFrequency
  /** The amount billed on each individual invoice (per period), in pence. */
  newPricePence: number
}

export interface RenewalNoticeContent {
  accountName: string
  contactName: string | null
  periodLabel: string // e.g. "April 2026"
  lines: RenewalNoticeLine[]
}

export function renewalNoticeSubject(content: RenewalNoticeContent): string {
  return `Service renewal — ${content.accountName} (${content.periodLabel})`
}

const BRAND = '#c8102e' // Pyrocel red

export function buildRenewalNoticeHtml(content: RenewalNoticeContent): string {
  const rows = content.lines
    .map((l) => {
      const occurrences = annualOccurrences(l.frequency)
      const annualPence = l.newPricePence * occurrences
      const freqLabel = RECURRING_FREQUENCY_LABELS[l.frequency] ?? l.frequency
      // Plain-English breakdown of how the annual price is invoiced.
      const billingNote =
        occurrences === 1
          ? `Billed as 1 invoice of ${formatPence(l.newPricePence)} per year`
          : `Billed as ${occurrences} invoices of ${formatPence(
              l.newPricePence,
            )} (${freqLabel.toLowerCase()})`
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">
          <div>${escapeHtml(l.description)}</div>
          <div style="color:#777;font-size:12px;margin-top:2px;">${billingNote}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;">${
          l.systemType ? escapeHtml(l.systemType) : '&mdash;'
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;">${freqLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;">
          <div style="font-weight:600;">${formatPence(annualPence)}</div>
          <div style="color:#777;font-size:12px;margin-top:2px;">per year</div>
        </td>
      </tr>`
    })
    .join('')

  // Total proposed annual value across all lines.
  const totalAnnualPence = content.lines.reduce(
    (sum, l) => sum + l.newPricePence * annualOccurrences(l.frequency),
    0,
  )

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:${BRAND};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:18px;">Service Renewal Notice</h1>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin-top:0;">Dear ${escapeHtml(content.contactName || content.accountName)},</p>
        <p>
          Please find below your proposed pricing for the forthcoming service period
          (renewing ${escapeHtml(content.periodLabel)}). These charges will apply from your
          renewal date. The proposed price shown for each service is the annual value, with a
          note detailing how it is invoiced over the year.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #eee;">Service</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #eee;">System</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #eee;">Frequency</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #eee;">Proposed price (annual)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          ${
            content.lines.length > 1
              ? `<tfoot>
            <tr>
              <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:600;">Total proposed annual value</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;">${formatPence(
                totalAnnualPence,
              )}</td>
            </tr>
          </tfoot>`
              : ''
          }
        </table>
        <p style="color:#555;font-size:13px;">
          If you have any questions about your renewal, please contact our office and we will be
          happy to help.
        </p>
        <p style="margin-bottom:0;">Kind regards,<br/>Pyrocel</p>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

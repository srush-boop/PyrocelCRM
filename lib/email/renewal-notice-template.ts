import { formatPence } from '@/lib/billing/invoices'
import { RECURRING_FREQUENCY_LABELS } from '@/lib/billing/recurring'
import type { RecurringFrequency } from '@/lib/types/database'

export interface RenewalNoticeLine {
  description: string
  frequency: RecurringFrequency
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
    .map(
      (l) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">${escapeHtml(l.description)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;">${
          RECURRING_FREQUENCY_LABELS[l.frequency] ?? l.frequency
        }</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatPence(
          l.newPricePence,
        )}</td>
      </tr>`,
    )
    .join('')

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
          renewal date.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #eee;">Service</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #eee;">Frequency</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #eee;">Proposed price</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
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

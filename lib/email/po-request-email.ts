import { sendEmail } from './send-email'

interface PoRequestEmailOptions {
  siteName: string
  clientName: string | null
  contactName: string | null
  serviceName: string
  systemName: string | null
  panelName: string | null
  referenceNumber: string | null
  completedAt: string | null
  clientRef: string | null
  engineerNotes: string | null
  parts: { name: string; quantity: number; unitCostPence: number }[]
  partsTotalPence: number
  specialNote: string | null
  priorRequests: {
    id: string
    created_at: string
    note: string | null
    po_number: string | null
    authorised_at: string | null
    requester: { full_name: string | null; email: string } | null
  }[]
  authorisationToken: string
  companyName: string
  baseUrl: string
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  )
}

export async function sendPoRequestEmail(
  to: string[],
  options: PoRequestEmailOptions,
): Promise<void> {
  const [primaryTo, ...cc] = to

  const authUrl = `${options.baseUrl}/po-authorise/${options.authorisationToken}`

  const partsRows =
    options.parts.length > 0
      ? options.parts
          .map(
            (p) =>
              `<tr>
                <td style="padding:4px 12px 4px 0;border-bottom:1px solid #eee;">${p.name}</td>
                <td style="padding:4px 12px 4px 0;border-bottom:1px solid #eee;text-align:right;">${p.quantity}</td>
                <td style="padding:4px 0;border-bottom:1px solid #eee;text-align:right;">${formatGBP(p.unitCostPence)}</td>
                <td style="padding:4px 0 4px 12px;border-bottom:1px solid #eee;text-align:right;">${formatGBP(p.quantity * p.unitCostPence)}</td>
              </tr>`,
          )
          .join('')
      : '<tr><td colspan="4" style="color:#888;padding:6px 0;">No parts recorded</td></tr>'

  const priorBlock =
    options.priorRequests.length > 1
      ? `<div style="margin:24px 0 0;padding:16px;background:#fff8e7;border:1px solid #f59e0b;border-radius:6px;">
        <p style="margin:0 0 8px;font-weight:600;color:#92400e;">Previous requests for this call:</p>
        <ul style="margin:0;padding-left:18px;color:#444;font-size:14px;">
          ${options.priorRequests
            .slice(0, -1) // exclude the current request
            .map(
              (r) =>
                `<li style="margin-bottom:4px;">
                  Requested ${formatDate(r.created_at)} by ${r.requester?.full_name || r.requester?.email || 'staff'}
                  ${r.note ? ` — <em>${r.note}</em>` : ''}
                  ${r.po_number ? ` <strong>| PO: ${r.po_number}</strong>` : ''}
                  ${r.authorised_at ? ` (authorised ${formatDate(r.authorised_at)})` : ' (awaiting authorisation)'}
                </li>`,
            )
            .join('')}
        </ul>
      </div>`
      : ''

  const specialNoteBlock = options.specialNote
    ? `<div style="margin:20px 0;padding:14px 16px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;">
        <p style="margin:0;font-size:14px;color:#1e40af;"><strong>Note from ${options.companyName}:</strong> ${options.specialNote}</p>
      </div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Purchase Order Request</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#18181b;padding:20px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${options.companyName}</p>
          <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">Purchase Order Request</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          ${options.contactName ? `<p style="margin:0 0 16px;font-size:15px;color:#333;">Dear ${options.contactName},</p>` : ''}
          <p style="margin:0 0 20px;font-size:15px;color:#333;">
            We have completed work at <strong>${options.siteName}</strong>${options.clientName ? ` for <strong>${options.clientName}</strong>` : ''} and kindly request a Purchase Order number to proceed with invoicing.
          </p>

          <!-- Work summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
            <tr><td style="padding:12px 16px;border-bottom:1px solid #e5e5e5;font-weight:600;font-size:14px;background:#f3f4f6;">Work Summary</td></tr>
            <tr><td style="padding:12px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr><td style="color:#666;padding:3px 0;width:40%;">Service:</td><td style="font-weight:500;">${options.serviceName}</td></tr>
                ${options.systemName ? `<tr><td style="color:#666;padding:3px 0;">System:</td><td style="font-weight:500;">${options.systemName}</td></tr>` : ''}
                ${options.panelName ? `<tr><td style="color:#666;padding:3px 0;">Panel(s):</td><td style="font-weight:500;">${options.panelName}</td></tr>` : ''}
                ${options.referenceNumber ? `<tr><td style="color:#666;padding:3px 0;">Call Reference:</td><td style="font-weight:500;">${options.referenceNumber}</td></tr>` : ''}
                <tr><td style="color:#666;padding:3px 0;">Completed:</td><td style="font-weight:500;">${formatDate(options.completedAt)}</td></tr>
                ${options.clientRef ? `<tr><td style="color:#666;padding:3px 0;">Client Ref:</td><td style="font-weight:500;">${options.clientRef}</td></tr>` : ''}
                <tr><td style="color:#666;padding:3px 0;">Total to be invoiced:</td><td style="font-weight:700;">${formatGBP(options.partsTotalPence)}</td></tr>
              </table>
            </td></tr>
          </table>

          ${options.engineerNotes ? `<div style="margin-bottom:20px;padding:12px 16px;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:6px;"><p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#444;">Works carried out:</p><p style="margin:0;font-size:14px;color:#333;white-space:pre-line;">${options.engineerNotes}</p></div>` : ''}

          ${
            options.parts.length > 0
              ? `<div style="margin-bottom:20px;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#333;">Parts &amp; materials:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:6px 12px 6px 0;font-weight:600;">Part</th>
                <th style="text-align:right;padding:6px 12px 6px 0;font-weight:600;">Qty</th>
                <th style="text-align:right;padding:6px 12px 6px 0;font-weight:600;">Unit</th>
                <th style="text-align:right;padding:6px 0 6px 12px;font-weight:600;">Total</th>
              </tr>
              ${partsRows}
              <tr>
                <td colspan="3" style="padding:8px 12px 0 0;font-weight:700;text-align:right;">Total (ex VAT):</td>
                <td style="padding:8px 0 0 12px;font-weight:700;text-align:right;">${formatGBP(options.partsTotalPence)}</td>
              </tr>
            </table>
          </div>`
              : ''
          }

          ${priorBlock}
          ${specialNoteBlock}

          <!-- Auth CTA -->
          <div style="margin:28px 0;text-align:center;padding:24px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;">
            <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#166534;">Authorise this work</p>
            <p style="margin:0 0 16px;font-size:14px;color:#15803d;">Click below to enter your PO number or name, and confirm authorisation.</p>
            <a href="${authUrl}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Authorise &amp; Provide PO</a>
            <p style="margin:12px 0 0;font-size:12px;color:#666;">Or copy this link: <a href="${authUrl}" style="color:#166534;">${authUrl}</a></p>
          </div>

          <p style="margin:0;font-size:14px;color:#666;">
            If you have any questions, please don&apos;t hesitate to contact us.<br>
            <strong>${options.companyName}</strong>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f3f4f6;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#888;">This email was sent by ${options.companyName}. You are receiving this because your details are registered with this site.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await sendEmail(primaryTo, `PO Request — ${options.serviceName} at ${options.siteName}`, html, {
    cc: cc.length > 0 ? cc : undefined,
  })
}

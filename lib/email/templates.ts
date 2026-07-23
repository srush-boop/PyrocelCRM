export interface ChecklistItem {
  id: string
  label: string
  // `passed` is only meaningful for pass/fail items. Summary/informational
  // items (numbers, text) carry `null` and must not be rendered as failures.
  passed: boolean | null
  // Advisory items are observations worth noting, not failures.
  advisory?: boolean
  type?: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value?: boolean | string | number | null
  notes?: string
}

/**
 * A configurable email footer resolved per sending staff user (falling back to
 * a global default). Rendered beneath the report body, above the standard
 * company contact strip. Images must be public URLs so email clients can load
 * them; the message is plain text (newlines preserved) and links are structured.
 */
export interface EmailFooter {
  message?: string | null
  imageUrl?: string | null
  links?: { label: string; url: string }[]
  enabled?: boolean
}

export interface EmailData {
  clientName: string
  clientEmail: string
  referenceNumber?: string
  siteName: string
  serviceType: string
  completedDate: string
  overallStatus: 'pass' | 'fail' | 'partial' | 'no_access'
  checklist: ChecklistItem[]
  engineerName: string
  engineerNotes?: string
  reportUrl?: string
  // Public link to the site's fire safety log book (included on every client report).
  logbookUrl?: string
  // Configurable footer for the staff member who sent this report.
  footer?: EmailFooter
  // ─── "What happens next" facts (optional; computed at send time) ──────────
  // A follow-up call/visit has been logged for the further works identified.
  followUpLogged?: boolean
  // The client's account requires a PO before chargeable works can be invoiced.
  poRequired?: boolean
  // A PO is already on file (client reference recorded or an authorised PO request).
  poProvided?: boolean
  // Public link for the client to provide their PO (logged as the first request).
  poAuthoriseUrl?: string
  // Remedial/failed items were found and a rectification quote will follow.
  remedialQuoteToFollow?: boolean
}

// ─── Brand ───────────────────────────────────────────────────────────────────
// Pyrocel brand palette + company facts (shared across all transactional emails).
const BRAND = {
  red: '#c8362b',
  charcoal: '#1f2937',
  ink: '#111827',
  muted: '#6b7280',
  slate: '#374151',
  border: '#e5e7eb',
  bg: '#f3f4f6',
}

const COMPANY = {
  legalName: 'Pyrocel Ltd',
  tagline: 'Fire & Security Experts since 1989',
  outOfHours: '01670 707070',
  website: 'www.pyrocel.co.uk',
  websiteUrl: 'https://www.pyrocel.co.uk',
}

// Minimal HTML escaping for interpolated dynamic values (names, notes, refs).
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const H3 = `margin:24px 0 8px;font-size:15px;font-weight:700;color:${BRAND.ink};`

// ─── Shared building blocks ────────────────────────────────────────────────

// A branded call-to-action button. Returns empty string when no URL is given.
const ctaButton = (url: string | undefined, label: string, color: string = BRAND.red): string => {
  if (!url) return ''
  return `
    <div style="text-align:center;margin:18px 0 6px;">
      <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;">${label}</a>
    </div>`
}

// Highlights the site's public digital fire safety log book. Included on
// every client report so occupiers always have one place to find their records.
const logbookLink = (data: EmailData): string =>
  data.logbookUrl
    ? `<div style="border:1px solid ${BRAND.border};background:#f9fafb;border-radius:8px;padding:14px 16px;margin:12px 0;">
         <div style="font-size:14px;font-weight:700;color:${BRAND.ink};margin-bottom:4px;">Site fire safety log book</div>
         <div style="font-size:14px;color:${BRAND.slate};line-height:1.5;">View this site&rsquo;s digital fire safety log book &mdash; every service report and routine check for the premises in one place.</div>
         ${ctaButton(data.logbookUrl, 'View site log book', BRAND.charcoal)}
       </div>`
    : ''

// Renders the configurable per-sender footer block (message / image / links).
// Returns an empty string when there is nothing to show.
const footerBlock = (footer?: EmailFooter): string => {
  if (!footer) return ''
  const links = (footer.links ?? [])
    .filter((l) => l && l.url && l.label)
    .map(
      (l) =>
        `<a href="${esc(l.url)}" style="color:${BRAND.red};text-decoration:none;font-weight:600;">${esc(l.label)}</a>`,
    )
    .join(' &middot; ')
  const hasContent = footer.message || footer.imageUrl || links
  if (!hasContent) return ''
  return `
    <tr><td style="background:#ffffff;border-top:1px solid ${BRAND.border};padding:16px 28px;">
      ${footer.imageUrl ? `<img src="${esc(footer.imageUrl)}" alt="" style="max-width:100%;height:auto;display:block;margin:0 0 10px;border:0;" />` : ''}
      ${footer.message ? `<p style="margin:0 0 8px;font-size:13px;color:${BRAND.slate};line-height:1.5;white-space:pre-line;">${esc(footer.message)}</p>` : ''}
      ${links ? `<p style="margin:0;font-size:12px;color:${BRAND.muted};">${links}</p>` : ''}
    </td></tr>`
}

// Wraps body content in the branded shell: charcoal header, coloured status
// ribbon, white content card, an optional configurable footer, and a footer
// with contact + out-of-hours details.
const emailShell = (opts: {
  ribbonLabel: string
  ribbonColor: string
  body: string
  footer?: EmailFooter
}): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(opts.ribbonLabel)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
        <tr><td style="background:${BRAND.charcoal};padding:22px 28px;">
          <div style="font-size:22px;font-weight:800;letter-spacing:1.5px;color:${BRAND.red};">PYROCEL</div>
          <div style="margin-top:3px;font-size:12px;color:#9ca3af;letter-spacing:.4px;">${COMPANY.tagline}</div>
        </td></tr>
        <tr><td style="background:${opts.ribbonColor};padding:12px 28px;">
          <span style="color:#ffffff;font-size:15px;font-weight:700;">${esc(opts.ribbonLabel)}</span>
        </td></tr>
        <tr><td style="padding:24px 28px;line-height:1.55;font-size:14px;color:${BRAND.slate};">
          ${opts.body}
        </td></tr>
        ${footerBlock(opts.footer)}
        <tr><td style="background:#f9fafb;border-top:1px solid ${BRAND.border};padding:18px 28px;">
          <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};">
            <strong style="color:${BRAND.slate};">${COMPANY.legalName}</strong> &middot; Fire &amp; Security Experts &middot; Newcastle &amp; Leeds
          </p>
          <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};">
            24/7 out-of-hours support for contracted customers:
            <a href="tel:${COMPANY.outOfHours.replace(/\s/g, '')}" style="color:${BRAND.red};text-decoration:none;font-weight:600;">${COMPANY.outOfHours}</a>
            &middot;
            <a href="${COMPANY.websiteUrl}" style="color:${BRAND.red};text-decoration:none;font-weight:600;">${COMPANY.website}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated service report. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

// Label/value "Service details" panel.
const detailsPanel = (data: EmailData, attendedLabel = 'Completed'): string => {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.muted};width:42%;vertical-align:top;">${label}</td>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.ink};font-weight:600;">${value}</td>
    </tr>`
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:8px;border-collapse:separate;overflow:hidden;margin:4px 0 8px;">
      <tr><td style="background:#f9fafb;padding:10px 14px;font-size:13px;font-weight:700;color:${BRAND.slate};border-bottom:1px solid ${BRAND.border};">Service details</td></tr>
      <tr><td style="padding:8px 14px 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${data.referenceNumber ? row('Reference', esc(data.referenceNumber)) : ''}
          ${row('Site', esc(data.siteName))}
          ${row('Service', esc(data.serviceType))}
          ${row(attendedLabel, esc(data.completedDate))}
          ${row('Engineer', esc(data.engineerName))}
        </table>
      </td></tr>
    </table>`
}

// Compact coloured summary pills for pass/fail/advisory counts.
const resultsSummary = (checklist: ChecklistItem[]): string => {
  let passed = 0
  let failed = 0
  let advisory = 0
  for (const item of checklist) {
    if (item.advisory) advisory++
    else if (item.passed === true) passed++
    else if (item.passed === false) failed++
  }
  const pill = (label: string, count: number, bg: string, color: string) =>
    count > 0
      ? `<span style="display:inline-block;background:${bg};color:${color};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;margin:0 6px 6px 0;">${label} ${count}</span>`
      : ''
  const pills = [
    pill('Passed', passed, '#dcfce7', '#166534'),
    pill('Requires attention', failed, '#fee2e2', '#991b1b'),
    pill('Advisory', advisory, '#fef3c7', '#92400e'),
  ].join('')
  if (!pills) return ''
  return `<div style="margin:2px 0 6px;">${pills}</div>`
}

// Renders a single checklist row with inline styles (email-client safe).
const checklistItemHtml = (item: ChecklistItem): string => {
  const wrap = (border: string, title: string, notes?: string) => `
    <div style="border:1px solid #eef0f2;border-left:4px solid ${border};border-radius:6px;background:#ffffff;padding:9px 12px;margin:8px 0;">
      <div style="font-size:14px;font-weight:600;color:${BRAND.ink};">${title}</div>
      ${notes ? `<div style="margin-top:3px;font-size:13px;color:${BRAND.muted};">${esc(notes)}</div>` : ''}
    </div>`

  if (item.advisory) {
    return wrap('#f59e0b', `! ${esc(item.label)} (Advisory)`, item.notes)
  }
  const isPassFail = item.type === 'pass_fail' || typeof item.passed === 'boolean'
  if (!isPassFail) {
    const hasValue = item.value !== undefined && item.value !== null && item.value !== ''
    return wrap('#6b7280', `${esc(item.label)}${hasValue ? `: ${esc(item.value)}` : ''}`, item.notes)
  }
  return wrap(
    item.passed ? '#28a745' : '#dc3545',
    `${item.passed ? '&#10003;' : '&times;'} ${esc(item.label)}`,
    item.notes,
  )
}

const engineerNotesHtml = (data: EmailData): string =>
  data.engineerNotes
    ? `<h3 style="${H3}">Engineer notes</h3>
       <p style="margin:0;font-size:14px;color:${BRAND.slate};white-space:pre-line;">${esc(data.engineerNotes)}</p>`
    : ''

// A single "what happens next" card, tinted by intent.
const nextStepCard = (opts: {
  heading: string
  body: string
  tint: 'red' | 'amber' | 'blue' | 'green'
  button?: { url?: string; label: string }
}): string => {
  const tints = {
    red: { bg: '#fef2f2', border: '#fecaca', head: '#991b1b' },
    amber: { bg: '#fffbeb', border: '#fde68a', head: '#92400e' },
    blue: { bg: '#eff6ff', border: '#bfdbfe', head: '#1e40af' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', head: '#166534' },
  }[opts.tint]
  return `
    <div style="border:1px solid ${tints.border};background:${tints.bg};border-radius:8px;padding:14px 16px;margin:10px 0;">
      <div style="font-size:14px;font-weight:700;color:${tints.head};margin-bottom:4px;">${opts.heading}</div>
      <div style="font-size:14px;color:${BRAND.slate};line-height:1.5;">${opts.body}</div>
      ${opts.button ? ctaButton(opts.button.url, opts.button.label) : ''}
    </div>`
}

// Builds the dynamic "What happens next" cards from the computed facts.
// Returns empty string when there is nothing specific to tell the client.
const buildNextStepCards = (data: EmailData): string => {
  const cards: string[] = []

  if (data.followUpLogged) {
    cards.push(
      nextStepCard({
        tint: 'blue',
        heading: 'Follow-up visit arranged',
        body:
          'We&rsquo;ve logged a follow-up call to carry out the further works identified during this visit. ' +
          'Our service desk will be in touch to confirm a convenient date.',
      }),
    )
  }

  if (data.poRequired && !data.poProvided) {
    cards.push(
      nextStepCard({
        tint: 'amber',
        heading: 'Purchase order required',
        body:
          `Your account requires a purchase order number before we can invoice any chargeable works from this visit` +
          `${data.referenceNumber ? ` (Ref ${esc(data.referenceNumber)})` : ''}. ` +
          (data.poAuthoriseUrl
            ? 'Please provide your PO using the button below and we&rsquo;ll log it against this call.'
            : 'Please reply with your PO number so we can log it against this call.'),
        button: data.poAuthoriseUrl
          ? { url: data.poAuthoriseUrl, label: 'Provide your PO number' }
          : undefined,
      }),
    )
  }

  if (data.remedialQuoteToFollow) {
    cards.push(
      nextStepCard({
        tint: 'red',
        heading: 'Remedial quote to follow',
        body:
          'We will prepare a remedial quote to rectify the items identified and send it to you for ' +
          'authorisation, usually within 3 working days.',
      }),
    )
  }

  return cards.join('')
}

// ─── Client-facing templates ───────────────────────────────────────────────

export const generateClientPassEmail = (data: EmailData): { subject: string; html: string } => {
  const nextCards = buildNextStepCards(data)
  const body = `
    <p style="margin:0 0 14px;">Dear ${esc(data.clientName)},</p>
    <p style="margin:0 0 14px;">
      We&rsquo;re pleased to confirm that your <strong>${esc(data.serviceType)}</strong> service at
      <strong>${esc(data.siteName)}</strong> has been completed successfully. All items were found to be
      satisfactory.
    </p>
    ${detailsPanel(data)}
    <h3 style="${H3}">Results</h3>
    ${resultsSummary(data.checklist)}
    <div>${data.checklist.map(checklistItemHtml).join('')}</div>
    ${engineerNotesHtml(data)}
    ${ctaButton(data.reportUrl, 'Open Full Report')}
    ${logbookLink(data)}
    <h3 style="${H3}">What happens next</h3>
    ${
      nextCards ||
      `<p style="margin:0;font-size:14px;color:${BRAND.slate};">No further action is required following this visit. If you have any questions, please contact your account manager or our service desk.</p>`
    }
    <p style="margin:18px 0 0;">Kind regards,<br/><strong>The Pyrocel Team</strong></p>`
  return {
    subject: `Service completed: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html: emailShell({ ribbonLabel: 'Service completed successfully', ribbonColor: '#16a34a', body, footer: data.footer }),
  }
}

export const generateClientFailEmail = (data: EmailData): { subject: string; html: string } => {
  const nextCards = buildNextStepCards(data)
  const body = `
    <p style="margin:0 0 14px;">Dear ${esc(data.clientName)},</p>
    <p style="margin:0 0 14px;">
      We&rsquo;ve completed your <strong>${esc(data.serviceType)}</strong> service at
      <strong>${esc(data.siteName)}</strong>. During the visit we identified one or more items that
      require attention, detailed below.
    </p>
    ${detailsPanel(data)}
    <h3 style="${H3}">Results</h3>
    ${resultsSummary(data.checklist)}
    <div>${data.checklist.map(checklistItemHtml).join('')}</div>
    ${engineerNotesHtml(data)}
    ${ctaButton(data.reportUrl, 'Open Full Report')}
    ${logbookLink(data)}
    <h3 style="${H3}">What happens next</h3>
    ${
      nextCards ||
      `<p style="margin:0;font-size:14px;color:${BRAND.slate};">Please contact our service desk so we can discuss the items identified and arrange any necessary follow-up works.</p>`
    }
    <p style="margin:18px 0 0;">Kind regards,<br/><strong>The Pyrocel Team</strong></p>`
  return {
    subject: `Attention required: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html: emailShell({ ribbonLabel: 'Service requires attention', ribbonColor: BRAND.red, body, footer: data.footer }),
  }
}

// Sent when the engineer attended but could not gain access. Neutral outcome —
// not a failure or defect notice.
export const generateClientNoAccessEmail = (data: EmailData): { subject: string; html: string } => {
  const nextCards = buildNextStepCards(data)
  const body = `
    <p style="margin:0 0 14px;">Dear ${esc(data.clientName)},</p>
    <p style="margin:0 0 14px;">
      Our engineer attended <strong>${esc(data.siteName)}</strong> for the scheduled
      <strong>${esc(data.serviceType)}</strong> but was unable to gain access to carry out the service.
      This visit has <strong>not</strong> been recorded as a service failure.
    </p>
    ${detailsPanel(data, 'Attended')}
    ${engineerNotesHtml(data)}
    ${ctaButton(data.reportUrl, 'Open Full Report')}
    ${logbookLink(data)}
    <h3 style="${H3}">What happens next</h3>
    <p style="margin:0 0 10px;font-size:14px;color:${BRAND.slate};">
      Please contact our service desk to arrange access so we can re-attend and complete the service.
    </p>
    ${nextCards}
    <p style="margin:18px 0 0;">Kind regards,<br/><strong>The Pyrocel Team</strong></p>`
  return {
    subject: `No access: ${data.serviceType} at ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html: emailShell({ ribbonLabel: 'Visit could not be completed', ribbonColor: '#d97706', body, footer: data.footer }),
  }
}

export const generateInternalAlertEmail = (data: EmailData): { subject: string; html: string } => {
  const failedItems = data.checklist.filter((item) => item.passed === false && !item.advisory)
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.muted};width:42%;vertical-align:top;">${label}</td>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.ink};font-weight:600;">${value}</td>
    </tr>`
  const body = `
    <p style="margin:0 0 14px;">A completed inspection has been flagged with items requiring attention.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:8px;border-collapse:separate;overflow:hidden;margin:4px 0 8px;">
      <tr><td style="background:#f9fafb;padding:10px 14px;font-size:13px;font-weight:700;color:${BRAND.slate};border-bottom:1px solid ${BRAND.border};">Call details</td></tr>
      <tr><td style="padding:8px 14px 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${data.referenceNumber ? row('Reference', esc(data.referenceNumber)) : ''}
          ${row('Site', esc(data.siteName))}
          ${row('Client', esc(data.clientName))}
          ${row('Service', esc(data.serviceType))}
          ${row('Engineer', esc(data.engineerName))}
          ${row('Date', esc(data.completedDate))}
        </table>
      </td></tr>
    </table>
    <h3 style="${H3}">Failed items (${failedItems.length})</h3>
    <div>${failedItems.map(checklistItemHtml).join('') || `<p style="margin:0;color:${BRAND.muted};">None recorded.</p>`}</div>
    ${engineerNotesHtml(data)}
    ${ctaButton(data.reportUrl, 'Open Full Report')}
    <h3 style="${H3}">Action required</h3>
    <p style="margin:0;font-size:14px;color:${BRAND.slate};">
      Review the failed items and contact the client to schedule follow-up work or issue corrective actions.
    </p>`
  return {
    subject: `[ALERT] Failed inspection items - ${data.siteName}${data.referenceNumber ? ` (Ref ${data.referenceNumber})` : ''}`,
    html: emailShell({ ribbonLabel: 'Internal alert: failed inspection items', ribbonColor: BRAND.charcoal, body }),
  }
}

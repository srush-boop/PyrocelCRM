import { generateClientPassEmail, generateClientFailEmail, generateInternalAlertEmail, EmailData } from './templates'

// Sending address on the verified `pyrocel.co.uk` domain.
const DEFAULT_FROM_EMAIL = 'PyrocelCRM <noreply@pyrocel.co.uk>'

// Resolve the "from" address defensively. The RESEND_FROM_EMAIL env var has been
// misconfigured before (e.g. set to an API key), which makes Resend reject every
// send with a 422. If the configured value is not a valid email/"Name <email>"
// format, fall back to the verified default instead of failing all emails.
function resolveFromAddress(): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim()
  if (configured && /.+@.+\..+/.test(configured)) {
    return configured
  }
  if (configured) {
    console.warn(
      `[v0] RESEND_FROM_EMAIL is not a valid email address ("${configured.slice(0, 6)}..."). Falling back to ${DEFAULT_FROM_EMAIL}. Set it to a verified sender like "PyrocelCRM <noreply@pyrocel.co.uk>".`
    )
  }
  return DEFAULT_FROM_EMAIL
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: { cc?: string[] },
) {
  // Using Resend as the default email service
  // Users can set RESEND_API_KEY in their environment
  const apiKey = process.env.RESEND_API_KEY
  
  if (!apiKey) {
    console.warn('[v0] RESEND_API_KEY not configured. Email sending disabled.')
    return { success: false, error: 'Email service not configured' }
  }

  // De-duplicate the CC list and remove the primary recipient from it
  const cc = (options?.cc || [])
    .map((e) => e.trim())
    .filter((e) => e && e.toLowerCase() !== to.toLowerCase())

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resolveFromAddress(),
        to,
        subject,
        html,
        ...(cc.length > 0 ? { cc } : {}),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[v0] Email send failed:', error)
      return { success: false, error: error.message }
    }

    const result = await response.json()
    return { success: true, messageId: result.id }
  } catch (error) {
    console.error('[v0] Email send error:', error)
    return { success: false, error: String(error) }
  }
}

export async function sendTaskCompletionEmail(data: EmailData) {
  if (data.overallStatus === 'pass') {
    const { subject, html } = generateClientPassEmail(data)
    return sendEmail(data.clientEmail, subject, html)
  } else {
    // Send to client
    const clientEmail = generateClientFailEmail(data)
    await sendEmail(data.clientEmail, clientEmail.subject, clientEmail.html)
    
    // Send internal alert
    const internalEmail = generateInternalAlertEmail(data)
    const internalEmails = process.env.INTERNAL_ALERT_EMAILS?.split(',') || []
    
    for (const email of internalEmails) {
      await sendEmail(email.trim(), internalEmail.subject, internalEmail.html)
    }
  }
}

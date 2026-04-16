import { generateClientPassEmail, generateClientFailEmail, generateInternalAlertEmail, EmailData } from './templates'

export async function sendEmail(to: string, subject: string, html: string) {
  // Using Resend as the default email service
  // Users can set RESEND_API_KEY in their environment
  const apiKey = process.env.RESEND_API_KEY
  
  if (!apiKey) {
    console.warn('[v0] RESEND_API_KEY not configured. Email sending disabled.')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'PyrocelCRM <noreply@pyrocelcrm.com>',
        to,
        subject,
        html,
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

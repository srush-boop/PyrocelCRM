'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'

/**
 * Email a sub-contractor from the site page. Sends through the app's email
 * service (Resend) so it comes from our verified domain and the recipient can
 * reply to the sender. Any authenticated staff member may send.
 */
export async function emailSubcontractor(input: {
  subcontractorId: string
  siteId: string
  subject: string
  message: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const subject = input.subject.trim()
  const message = input.message.trim()
  if (!subject) return { ok: false, error: 'Please enter a subject' }
  if (!message) return { ok: false, error: 'Please enter a message' }

  // Resolve the sub-contractor's contact email.
  const { data: sub } = await supabase
    .from('suppliers')
    .select('id, name, contact_email')
    .eq('id', input.subcontractorId)
    .eq('supplier_type', 'subcontractor')
    .single()
  if (!sub) return { ok: false, error: 'Sub-contractor not found' }
  if (!sub.contact_email) {
    return { ok: false, error: 'This sub-contractor has no contact email on file' }
  }

  // Include the sender's name + site so the recipient has context.
  const { data: sender } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const { data: site } = await supabase
    .from('sites')
    .select('name')
    .eq('id', input.siteId)
    .single()

  const senderName = sender?.full_name || 'PyrocelCRM'
  const siteName = site?.name || 'a site'

  // Simple, safe HTML: escape the body and preserve line breaks.
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111; line-height: 1.6;">
      <p style="margin: 0 0 12px;">Hi ${sub.name},</p>
      <div>${escaped}</div>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p style="margin: 0; color: #666; font-size: 12px;">
        Sent by ${senderName} regarding ${siteName} via PyrocelCRM.
      </p>
    </div>
  `

  const result = await sendEmail(sub.contact_email, subject, html, {
    cc: user.email ? [user.email] : undefined,
  })
  if (!result.success) {
    return { ok: false, error: result.error || 'Failed to send email' }
  }

  return { ok: true }
}

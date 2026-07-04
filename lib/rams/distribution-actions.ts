'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send-email'
import { getPublicBaseUrl } from './base-url'

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ---------------------------------------------------------------------------
// RAMS distribution: send an approved RAMS to internal engineers (who confirm
// "read & understood" inside the CRM) and/or external clients (who acknowledge
// receipt via a public signed link). Email delivery is best-effort so the
// records + links are always created even when RESEND_API_KEY is absent.
// ---------------------------------------------------------------------------

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function messageToHtml(message: string) {
  return escapeHtml(message.trim())
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

export interface DistributeInput {
  engineerIds: string[]
  clientRecipients: { email: string; name: string | null }[]
  message?: string | null
}

export interface DistributeSummary {
  engineersAssigned: number
  clientsInvited: number
  emailsSent: number
  emailsFailed: number
  // True when at least one recipient existed but no email could be delivered
  // (e.g. email is not configured in this environment).
  emailUnavailable: boolean
}

export async function distributeRams(
  id: string,
  input: DistributeInput,
): Promise<ActionResult<DistributeSummary>> {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) return { success: false, error: 'Not authenticated' }
  if (!['admin', 'office', 'engineer'].includes(profile.role)) {
    return { success: false, error: 'Not authorised' }
  }

  const supabase = await createClient()

  const { data: doc, error: docErr } = await supabase
    .from('rams_documents')
    .select('id, rams_number, title')
    .eq('id', id)
    .single()
  if (docErr || !doc) {
    return { success: false, error: docErr?.message || 'RAMS not found' }
  }

  const baseUrl = getPublicBaseUrl()
  const message = input.message?.trim() || ''
  const introHtml = message
    ? messageToHtml(message)
    : `<p>A Risk Assessment &amp; Method Statement (<strong>${doc.rams_number}</strong> — ${escapeHtml(
        doc.title,
      )}) has been shared with you.</p>`

  let emailsSent = 0
  let emailsFailed = 0

  // --- Engineers: assign confirmation rows + notify by email ----------------
  const engineerIds = Array.from(new Set(input.engineerIds)).filter(Boolean)
  let engineersAssigned = 0
  if (engineerIds.length > 0) {
    const { data: existing } = await supabase
      .from('rams_engineer_confirmations')
      .select('engineer_id')
      .eq('rams_id', id)
    const existingIds = new Set((existing || []).map((r) => r.engineer_id))
    const toInsert = engineerIds
      .filter((eid) => !existingIds.has(eid))
      .map((engineerId) => ({
        rams_id: id,
        engineer_id: engineerId,
        status: 'pending' as const,
      }))

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('rams_engineer_confirmations')
        .insert(toInsert)
      if (error) return { success: false, error: error.message }
    }
    engineersAssigned = engineerIds.length

    // Notify each assigned engineer with a link back into the CRM.
    const { data: engineers } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', engineerIds)

    const link = `${baseUrl}/dashboard/rams/${id}`
    for (const eng of engineers || []) {
      if (!eng.email) continue
      const res = await sendEmail(
        eng.email,
        `Action required: confirm RAMS ${doc.rams_number}`,
        `<p>Hello${eng.full_name ? ` ${escapeHtml(eng.full_name)}` : ''},</p>
         ${introHtml}
         <p>Please review and confirm you have read and understood it:</p>
         <p><a href="${link}">Open this RAMS in the CRM</a></p>
         <p>If the link above does not work, copy this URL into your browser:<br/>${link}</p>`,
      )
      if (res.success) emailsSent++
      else emailsFailed++
    }
  }

  // --- Clients: create signed receipt requests + email public links ---------
  const clientRecipients = input.clientRecipients.filter((r) => r.email.trim())
  let clientsInvited = 0
  for (const recipient of clientRecipients) {
    const email = recipient.email.trim()
    const { data: approval, error: apprErr } = await supabase
      .from('rams_approvals')
      .insert({
        rams_id: id,
        approval_type: 'client_receipt',
        recipient_email: email,
        recipient_name: recipient.name,
        status: 'pending',
        sent_at: new Date().toISOString(),
      })
      .select('token')
      .single()
    if (apprErr) return { success: false, error: apprErr.message }
    clientsInvited++

    const link = `${baseUrl}/receipt/${approval.token}`
    const res = await sendEmail(
      email,
      `RAMS ${doc.rams_number} — please acknowledge receipt`,
      `<p>Hello${recipient.name ? ` ${escapeHtml(recipient.name)}` : ''},</p>
       ${introHtml}
       <p>Please review the document and sign to acknowledge receipt:</p>
       <p><a href="${link}">Review and acknowledge this RAMS</a></p>
       <p>If the link above does not work, copy this URL into your browser:<br/>${link}</p>`,
    )
    if (res.success) emailsSent++
    else emailsFailed++
  }

  revalidatePath('/dashboard/rams')
  revalidatePath(`/dashboard/rams/${id}`)

  const totalRecipients = (engineerIds.length ? engineersAssigned : 0) + clientsInvited
  return {
    success: true,
    data: {
      engineersAssigned,
      clientsInvited,
      emailsSent,
      emailsFailed,
      emailUnavailable: totalRecipients > 0 && emailsSent === 0,
    },
  }
}

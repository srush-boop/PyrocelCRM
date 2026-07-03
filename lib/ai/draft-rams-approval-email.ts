'use server'

import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { formatDateUK } from '@/lib/utils'
import {
  DRAFT_MODEL,
  TONE_GUIDANCE,
  draftSchema,
  type EmailTone,
  type DraftEmailResult,
} from '@/lib/ai/shared'
import type { SelectedHazard } from '@/lib/rams/types'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const p = profile as { role?: string; full_name?: string } | null
  if (!p?.role || !['admin', 'office'].includes(p.role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, senderName: p.full_name?.trim() || 'Pyrocel', error: null as null }
}

// Drafts the covering message for a RAMS approval request. The document is
// loaded server-side by id (scoped to authenticated staff) so the model gets
// accurate context. The returned body is a personal covering note — the secure
// approval link is appended separately by the email sender.
export async function draftRamsApprovalEmail(input: {
  ramsId: string
  recipientName?: string | null
  tone?: EmailTone
  instructions?: string
}): Promise<DraftEmailResult> {
  const { supabase, user, senderName, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: doc, error: docErr } = await supabase
    .from('rams_documents')
    .select(
      `id, rams_number, title, work_description, work_location,
       planned_start_date, planned_end_date, no_end_date, selected_hazards`,
    )
    .eq('id', input.ramsId)
    .single()

  if (docErr || !doc) return { ok: false, error: 'RAMS document not found.' }

  const d = doc as unknown as {
    rams_number: string | null
    title: string | null
    work_description: string | null
    work_location: string | null
    planned_start_date: string | null
    planned_end_date: string | null
    no_end_date: boolean | null
    selected_hazards: SelectedHazard[] | null
  }

  const tone: EmailTone = input.tone ?? 'professional'
  const recipientName = input.recipientName?.trim() || 'there'

  const hazards = Array.isArray(d.selected_hazards) ? d.selected_hazards : []
  const topHazards = hazards
    .slice(0, 6)
    .map((h) => h?.category)
    .filter(Boolean)
    .join(', ')

  const dates = d.planned_start_date
    ? `Starts ${formatDateUK(d.planned_start_date)}${
        d.no_end_date
          ? ' (ongoing)'
          : d.planned_end_date
            ? ` and ends ${formatDateUK(d.planned_end_date)}`
            : ''
      }`
    : null

  const context = [
    `Recipient (approver) name: ${recipientName}`,
    d.rams_number ? `RAMS reference: ${d.rams_number}` : null,
    d.title ? `RAMS title: ${d.title}` : null,
    d.work_location ? `Work location: ${d.work_location}` : null,
    dates,
    d.work_description ? `Scope of works: ${d.work_description}` : null,
    topHazards ? `Key hazards assessed: ${topHazards}` : null,
    `Number of hazards assessed: ${hazards.length}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: draftSchema,
      system: [
        'You are an assistant for Pyrocel, a UK fire and security systems company.',
        'You write a short covering email asking a manager or client to review and approve a Risk Assessment & Method Statement (RAMS).',
        'Use British English. Never invent hazards, dates, references, or facts that are not provided.',
        'The recipient will receive a secure link to review and sign off the RAMS online, so ask them to review and approve it via the link (do not paste a link yourself — it is added automatically).',
        `Tone: ${TONE_GUIDANCE[tone]}`,
        `Sign off from "${senderName}" on behalf of Pyrocel.`,
        'Do not include placeholders like [Name]. Keep it to 2-3 short paragraphs.',
      ].join(' '),
      prompt: [
        'Draft a covering email requesting approval for this RAMS using the details below.',
        '',
        context,
        '',
        input.instructions?.trim()
          ? `Additional instructions from the sender: ${input.instructions.trim()}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    })

    return { ok: true, subject: object.subject, body: object.body }
  } catch (err) {
    console.error('[v0] draftRamsApprovalEmail failed:', err)
    return { ok: false, error: 'Could not generate a draft. Please try again.' }
  }
}

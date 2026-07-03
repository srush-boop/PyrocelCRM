'use server'

import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { formatPence } from '@/lib/sales'
import {
  DRAFT_MODEL,
  TONE_GUIDANCE,
  draftSchema,
  type EmailTone,
  type DraftEmailResult,
} from '@/lib/ai/shared'

// Re-exported so existing imports (e.g. the send-quote dialog) keep working.
export type { EmailTone }
export type DraftQuoteEmailResult = DraftEmailResult

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

// Drafts a client-facing covering email for a quote. The quote is loaded
// server-side by id (scoped to authenticated staff) so the model gets accurate
// context and the client cannot spoof pricing/details.
export async function draftQuoteEmail(input: {
  quoteId: string
  tone?: EmailTone
  instructions?: string
}): Promise<DraftQuoteEmailResult> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select(
      `id, quote_number, reference, title, quote_type, summary, currency,
       total_pence, valid_until, prospect_name, prospect_contact,
       client:clients ( name, contact_name )`,
    )
    .eq('id', input.quoteId)
    .single()

  if (quoteError || !quote) {
    return { ok: false, error: 'Quote not found.' }
  }

  // Load the sender's display name so the sign-off is personalised.
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const q = quote as unknown as {
    quote_number: string | null
    reference: string | null
    title: string | null
    quote_type: string | null
    summary: string | null
    currency: string | null
    total_pence: number | null
    valid_until: string | null
    prospect_name: string | null
    prospect_contact: string | null
    client: { name: string | null; contact_name: string | null } | null
  }

  const tone: EmailTone = input.tone ?? 'professional'
  const recipientName = q.client?.contact_name || q.prospect_contact || 'the client'
  const companyName = q.client?.name || q.prospect_name || null
  const ref = q.reference || q.quote_number || null
  const total =
    typeof q.total_pence === 'number' ? formatPence(q.total_pence, q.currency || 'GBP') : null
  const validUntil = q.valid_until
    ? new Date(q.valid_until).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const senderName = (senderProfile as { full_name?: string } | null)?.full_name?.trim() || 'Pyrocel'

  const context = [
    `Recipient contact name: ${recipientName}`,
    companyName ? `Client company: ${companyName}` : null,
    q.title ? `Quote title / work: ${q.title}` : null,
    q.quote_type ? `Quote type: ${q.quote_type}` : null,
    ref ? `Quote reference: ${ref}` : null,
    total ? `Quote total (inc. VAT where applicable): ${total}` : null,
    validUntil ? `Quote valid until: ${validUntil}` : null,
    q.summary ? `Summary of works: ${q.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: draftSchema,
      system: [
        'You are an assistant for Pyrocel, a UK fire and security systems company.',
        'You write short covering emails that accompany a price quotation being sent to a client.',
        'Use British English and GBP. Never invent prices, dates, references, or facts that are not provided.',
        'A PDF of the quote is attached automatically and the client also gets a link to view it online, so refer to "the attached quotation" and invite them to review it.',
        `Tone: ${TONE_GUIDANCE[tone]}`,
        `Sign off from "${senderName}" on behalf of Pyrocel.`,
        'Do not include placeholders like [Name]. Use the details provided. Keep it to 2-4 short paragraphs.',
      ].join(' '),
      prompt: [
        'Draft a covering email for this quotation using the details below.',
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
    console.error('[v0] draftQuoteEmail failed:', err)
    return { ok: false, error: 'Could not generate a draft. Please try again.' }
  }
}

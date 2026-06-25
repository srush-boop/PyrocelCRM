'use server'

import { put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'

type Result = { ok: boolean; error?: string }

// Respond to a quote via the public secret-link flow (no login). The token is
// the authorisation: anyone holding it may approve or decline the quote.
export async function respondToPublicQuote(args: {
  token: string
  decision: 'accepted' | 'rejected'
  poNumber?: string
  decisionNote?: string
  signatureName?: string
  // Data-URL (image/png) of the drawn signature, captured client-side.
  signatureDataUrl?: string
}): Promise<Result> {
  const token = args.token?.trim()
  if (!token) return { ok: false, error: 'Invalid quote link.' }

  const supabase = createAdminClient()

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, status, require_signature')
    .eq('share_token', token)
    .maybeSingle()

  if (error || !quote) return { ok: false, error: 'Quote not found.' }

  if (quote.status === 'accepted' || quote.status === 'rejected') {
    return { ok: false, error: 'This quote has already been responded to.' }
  }

  // Enforce a mandatory signature on approval when the quote requires it.
  if (args.decision === 'accepted' && quote.require_signature) {
    if (!args.signatureName?.trim() || !args.signatureDataUrl) {
      return { ok: false, error: 'A signature and full name are required to approve this quote.' }
    }
  }

  const patch: Record<string, unknown> = {
    status: args.decision,
    decided_at: new Date().toISOString(),
    decision_note: args.decisionNote?.trim() || null,
  }

  if (args.decision === 'accepted') {
    patch.po_number = args.poNumber?.trim() || null

    if (args.signatureName?.trim()) {
      patch.signature_name = args.signatureName.trim()
      patch.signed_at = new Date().toISOString()
    }

    // Persist the drawn signature image to Blob storage.
    if (args.signatureDataUrl?.startsWith('data:image/')) {
      try {
        const base64 = args.signatureDataUrl.split(',')[1] ?? ''
        const bytes = Buffer.from(base64, 'base64')
        const blob = await put(`quote-signatures/${quote.id}-${Date.now()}.png`, bytes, {
          access: 'public',
          contentType: 'image/png',
        })
        patch.signature_image_url = blob.url
      } catch (e) {
        console.error('[v0] Signature upload failed:', e)
        return { ok: false, error: 'Could not save the signature. Please try again.' }
      }
    }
  }

  const { error: updateError } = await supabase.from('quotes').update(patch).eq('id', quote.id)
  if (updateError) return { ok: false, error: 'Could not record your response.' }

  return { ok: true }
}

// Fetch a quote + its systems/lines/company by public token (server-only).
export async function getPublicQuote(token: string) {
  const supabase = createAdminClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(*), site:sites(*)')
    .eq('share_token', token)
    .maybeSingle()
  if (!quote) return null

  const [{ data: systems }, { data: lines }, { data: company }] = await Promise.all([
    supabase.from('quote_systems').select('*').eq('quote_id', quote.id).order('position'),
    supabase.from('quote_line_items').select('*').eq('quote_id', quote.id).order('position'),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  return {
    quote,
    systems: systems ?? [],
    lines: lines ?? [],
    company: company ?? null,
  }
}

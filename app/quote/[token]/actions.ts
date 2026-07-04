'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadQuoteCatalogue } from '@/lib/sales/equipment-spec'
import { createRemedialCallsForQuote } from '@/lib/remedial'
import type { QuoteLineItem } from '@/lib/types/database'

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

    // Store the drawn signature inline as a data URL. Signatures are small
    // (a few KB) so this avoids Blob storage and works everywhere the image is
    // shown (staff panel, PDF, public page) without signed-URL handling.
    if (args.signatureDataUrl?.startsWith('data:image/')) {
      patch.signature_image_url = args.signatureDataUrl
    }
  }

  // Select the affected row back so a silent no-op (zero rows updated) is caught
  // rather than reported as success.
  const { data: updated, error: updateError } = await supabase
    .from('quotes')
    .update(patch)
    .eq('id', quote.id)
    .select('id')

  if (updateError) {
    console.log('[v0] respondToPublicQuote update error:', updateError.message)
    return { ok: false, error: 'Could not record your response.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'Could not record your response. Please try again.' }
  }

  // When a remedial quote is approved by the client, raise the remedial call(s)
  // automatically so the works are scheduled and the pre-attendance alert fires.
  if (args.decision === 'accepted') {
    await createRemedialCallsForQuote(supabase, quote.id)
  }

  return { ok: true }
}

// Fetch a quote + its systems/lines/company by public token (server-only).
export async function getPublicQuote(token: string) {
  const supabase = createAdminClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(*), site:sites(*), preparer:profiles!quotes_created_by_fkey(id, full_name)')
    .eq('share_token', token)
    .maybeSingle()
  if (!quote) return null

  const [{ data: systems }, { data: lines }, { data: company }, { data: requirements }] =
    await Promise.all([
      supabase.from('quote_systems').select('*').eq('quote_id', quote.id).order('position'),
      supabase.from('quote_line_items').select('*').eq('quote_id', quote.id).order('position'),
      supabase.from('company_info').select('*').limit(1).maybeSingle(),
      supabase.from('quote_requirements').select('*').eq('quote_id', quote.id).order('position'),
    ])

  const lineRows = (lines ?? []) as QuoteLineItem[]
  const catalogue = (quote as { show_equipment_spec?: boolean }).show_equipment_spec
    ? await loadQuoteCatalogue(supabase, lineRows)
    : []

  return {
    quote,
    systems: systems ?? [],
    lines: lineRows,
    company: company ?? null,
    requirements: requirements ?? [],
    catalogue,
  }
}

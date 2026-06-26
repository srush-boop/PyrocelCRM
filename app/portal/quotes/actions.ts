'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Client portal: accept or decline a quote. The decision is enforced by the
 * SECURITY DEFINER `respond_to_quote` RPC, which re-checks site access and
 * that the quote is still awaiting a response.
 */
export async function respondToQuote(
  quoteId: string,
  decision: 'accepted' | 'rejected',
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { error } = await supabase.rpc('respond_to_quote', {
    target_quote_id: quoteId,
    decision,
    note: note?.trim() || null,
  })

  if (error) {
    return { ok: false, error: 'Could not record your response. The quote may no longer be open.' }
  }

  revalidatePath('/portal/quotes')
  revalidatePath(`/portal/quotes/${quoteId}`)
  return { ok: true }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Invoice } from '@/lib/types/database'

/**
 * Resolve the address shown in the invoice PDF "Bill to" block.
 *
 * Prefers the snapshot captured at creation time (the billing account's own
 * invoice address). When that's blank — e.g. a billing account with no invoice
 * address on file — it falls back to the parent client's address so the
 * customer copy still carries an address wherever one exists.
 *
 * Shared by the PDF preview route and the email-invoice flow so both surfaces
 * show the same address, including for existing invoices.
 */
export async function resolveBillToAddress(
  supabase: SupabaseClient,
  invoice: Pick<Invoice, 'bill_to_address' | 'client_id'>,
): Promise<string | null> {
  const existing = invoice.bill_to_address?.trim()
  if (existing) return existing
  if (!invoice.client_id) return null

  const { data } = await supabase
    .from('clients')
    .select('address')
    .eq('id', invoice.client_id)
    .maybeSingle()
  const clientAddress = (data as { address: string | null } | null)?.address?.trim()
  return clientAddress || null
}

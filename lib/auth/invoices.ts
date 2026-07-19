import 'server-only'
import type { Profile } from '@/lib/types/database'

/**
 * Who may EDIT / SEND invoices from the invoice lists.
 *
 * Previewing an invoice is open to any billing viewer (office/admin). Editing
 * lines and sending to the client is a controlled per-user function:
 *  - admins are always allowed
 *  - office users need the explicit `can_edit_invoices` grant
 *
 * This is the module's authorisation boundary — every mutating invoice action
 * (edit line, add line, send) re-checks it server-side; the UI just mirrors it.
 */
export function profileCanEditInvoices(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  if (profile.role === 'office') return profile.can_edit_invoices === true
  return false
}

/** Only admins can grant/revoke the `can_edit_invoices` flag on other users. */
export function canGrantInvoiceEdit(profile: Profile | null | undefined): boolean {
  return profile?.role === 'admin'
}

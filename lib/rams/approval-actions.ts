'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { RamsApproval, RamsDocument } from './types'

// Public, token-gated approval flow. Runs with the service-role client because
// the external approver is unauthenticated; all access is scoped strictly by the
// opaque approval token.

export interface ApprovalContext {
  approval: RamsApproval
  document: RamsDocument
  client: { id: string; name: string } | null
  preparedBy: { full_name: string | null } | null
}

export async function getApprovalByToken(
  token: string,
): Promise<ApprovalContext | null> {
  const admin = createAdminClient()

  const { data: approval } = await admin
    .from('rams_approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (!approval) return null

  const { data: document } = await admin
    .from('rams_documents')
    .select('*')
    .eq('id', approval.rams_id)
    .maybeSingle()
  if (!document) return null

  let client: { id: string; name: string } | null = null
  if (document.client_id) {
    const { data } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', document.client_id)
      .maybeSingle()
    client = data
  }

  let preparedBy: { full_name: string | null } | null = null
  if (document.prepared_by) {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', document.prepared_by)
      .maybeSingle()
    preparedBy = data
  }

  return {
    approval: approval as RamsApproval,
    document: document as RamsDocument,
    client,
    preparedBy,
  }
}

export async function respondToApproval(
  token: string,
  decision: 'approved' | 'rejected',
  comments: string | null,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: approval } = await admin
    .from('rams_approvals')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (!approval) return { success: false, error: 'Invalid or expired link' }
  if (approval.status !== 'pending') {
    return { success: false, error: 'This RAMS has already been responded to' }
  }

  const { error: apprErr } = await admin
    .from('rams_approvals')
    .update({ status: decision, responded_at: now, comments })
    .eq('id', approval.id)
  if (apprErr) return { success: false, error: apprErr.message }

  const { error: docErr } = await admin
    .from('rams_documents')
    .update({
      status: decision,
      approved_date: decision === 'approved' ? now : null,
      approved_at: decision === 'approved' ? now : null,
      revision_notes: comments,
      updated_at: now,
    })
    .eq('id', approval.rams_id)
  if (docErr) return { success: false, error: docErr.message }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Public client "acknowledge receipt" flow. Distinct from the approval flow:
// the client is not approving/rejecting, only confirming (with a signature)
// that they have received the RAMS. Scoped strictly by the opaque token and the
// `client_receipt` approval type.
// ---------------------------------------------------------------------------

export async function getReceiptByToken(
  token: string,
): Promise<ApprovalContext | null> {
  const admin = createAdminClient()

  const { data: approval } = await admin
    .from('rams_approvals')
    .select('*')
    .eq('token', token)
    .eq('approval_type', 'client_receipt')
    .maybeSingle()
  if (!approval) return null

  const { data: document } = await admin
    .from('rams_documents')
    .select('*')
    .eq('id', approval.rams_id)
    .maybeSingle()
  if (!document) return null

  let client: { id: string; name: string } | null = null
  if (document.client_id) {
    const { data } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', document.client_id)
      .maybeSingle()
    client = data
  }

  let preparedBy: { full_name: string | null } | null = null
  if (document.prepared_by) {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', document.prepared_by)
      .maybeSingle()
    preparedBy = data
  }

  return {
    approval: approval as RamsApproval,
    document: document as RamsDocument,
    client,
    preparedBy,
  }
}

export async function acknowledgeReceipt(
  token: string,
  input: { signedName: string; signatureData: string | null },
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const signedName = input.signedName.trim()
  if (!signedName) return { success: false, error: 'Please enter your name' }

  const { data: approval } = await admin
    .from('rams_approvals')
    .select('*')
    .eq('token', token)
    .eq('approval_type', 'client_receipt')
    .maybeSingle()
  if (!approval) return { success: false, error: 'Invalid or expired link' }
  if (approval.status !== 'pending') {
    return { success: false, error: 'This RAMS has already been acknowledged' }
  }

  const { error } = await admin
    .from('rams_approvals')
    .update({
      status: 'acknowledged',
      responded_at: now,
      signed_name: signedName,
      signature_data: input.signatureData,
    })
    .eq('id', approval.id)
  if (error) return { success: false, error: error.message }

  return { success: true }
}

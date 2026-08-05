'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyUsers } from '@/lib/notifications'
import type { Profile, PurchaseInvoice } from '@/lib/types/database'

// Server actions for the Purchase Invoices module. Admin/office (staff) only —
// RLS also enforces this, but we gate in the action for clear error messages.

const LIST_PATH = '/dashboard/invoices/purchase-invoices'
const APPROVALS_PATH = '/dashboard/approvals'

async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'No profile' as const }
  return {
    supabase,
    userId: user.id,
    profile: profile as Pick<Profile, 'id' | 'role' | 'full_name'>,
  }
}

async function requireStaff() {
  const auth = await getAuth()
  if ('error' in auth) return auth
  if (auth.profile.role !== 'admin' && auth.profile.role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return auth
}

// --- Allocation -------------------------------------------------------------

export interface AllocationFields {
  site_id?: string | null
  client_id?: string | null
  task_id?: string | null
  job_id?: string | null
  branch_id?: string | null
  nominal_code_id?: string | null
  department_id?: string | null
  supplier_id?: string | null
  supplier_ref?: string | null
  notes?: string | null
  is_prepayment?: boolean
  amount_pence?: number | null
  invoice_date?: string | null
  due_date?: string | null
}

/** Save the allocation / detail fields on a purchase invoice. */
export async function updatePurchaseInvoiceAllocation(
  id: string,
  fields: AllocationFields,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  // Only forward known columns; ignore anything unexpected.
  const patch: Record<string, unknown> = {}
  const keys: (keyof AllocationFields)[] = [
    'site_id',
    'client_id',
    'task_id',
    'job_id',
    'branch_id',
    'nominal_code_id',
    'department_id',
    'supplier_id',
    'supplier_ref',
    'notes',
    'is_prepayment',
    'amount_pence',
    'invoice_date',
    'due_date',
  ]
  for (const k of keys) {
    if (k in fields) patch[k] = fields[k]
  }

  const { error } = await supabase.from('purchase_invoices').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(LIST_PATH)
  return { ok: true }
}

// --- Reference auto-population ----------------------------------------------

export interface ResolvedAllocation {
  site_id: string | null
  client_id: string | null
  branch_id: string | null
  job_id: string | null
  task_id: string | null
}

/**
 * Given a chosen call (task) or job, resolve the site/client/branch/job/task so
 * the UI can auto-fill the allocation. Site drives client + branch.
 */
export async function lookupCallOrJobAllocation(
  kind: 'task' | 'job',
  id: string,
): Promise<{ ok: boolean; error?: string; allocation?: ResolvedAllocation }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const resolveFromSite = async (siteId: string | null) => {
    if (!siteId) return { client_id: null as string | null, branch_id: null as string | null }
    const { data: site } = await supabase
      .from('sites')
      .select('client_id, branch_id')
      .eq('id', siteId)
      .single()
    return {
      client_id: (site?.client_id as string | null) ?? null,
      branch_id: (site?.branch_id as string | null) ?? null,
    }
  }

  if (kind === 'task') {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, site_id, client_id, source_job_id')
      .eq('id', id)
      .single()
    if (!task) return { ok: false, error: 'Call not found' }
    const fromSite = await resolveFromSite((task.site_id as string | null) ?? null)
    return {
      ok: true,
      allocation: {
        task_id: task.id as string,
        site_id: (task.site_id as string | null) ?? null,
        client_id: (task.client_id as string | null) ?? fromSite.client_id,
        branch_id: fromSite.branch_id,
        job_id: (task.source_job_id as string | null) ?? null,
      },
    }
  }

  // Job: pull its site/client/branch directly (falling back to its site).
  const { data: job } = await supabase
    .from('jobs')
    .select('id, site_id, client_id, branch_id')
    .eq('id', id)
    .single()
  if (!job) return { ok: false, error: 'Job not found' }
  const fromSite = await resolveFromSite((job.site_id as string | null) ?? null)
  return {
    ok: true,
    allocation: {
      job_id: job.id as string,
      task_id: null,
      site_id: (job.site_id as string | null) ?? null,
      client_id: (job.client_id as string | null) ?? fromSite.client_id,
      branch_id: (job.branch_id as string | null) ?? fromSite.branch_id,
    },
  }
}

// --- Authoriser assignment + approval ---------------------------------------

/**
 * Assign an authoriser and (re)set the record to awaiting_approval, notifying
 * the authoriser. Requires the essentials (supplier + amount) to be present.
 */
export async function assignPurchaseInvoiceAuthoriser(
  id: string,
  authoriserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, profile } = auth

  const { data: inv } = await supabase
    .from('purchase_invoices')
    .select('id, name, supplier_id, amount_pence, supplier_ref')
    .eq('id', id)
    .single()
  if (!inv) return { ok: false, error: 'Invoice not found' }
  if (!inv.supplier_id || inv.amount_pence == null) {
    return {
      ok: false,
      error: 'Add a supplier and amount before assigning an authoriser.',
    }
  }

  const { error } = await supabase
    .from('purchase_invoices')
    .update({
      authoriser_id: authoriserId,
      status: 'awaiting_approval',
      decided_by: null,
      decided_at: null,
      decision_notes: null,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  await notifyUsers({
    userIds: [authoriserId],
    title: 'Purchase invoice awaiting your approval',
    body: `${inv.supplier_ref ? inv.supplier_ref + ' — ' : ''}${inv.name} is ready for payment approval.`,
    url: LIST_PATH,
    category: 'approval',
    createdBy: profile.id,
  })

  revalidatePath(LIST_PATH)
  revalidatePath(APPROVALS_PATH)
  return { ok: true }
}

/**
 * Record the authoriser's decision (approve / reject) and notify the uploader
 * so they see the status change in the master grid. Only the assigned
 * authoriser or an admin may decide.
 */
export async function decidePurchaseInvoice(
  id: string,
  decision: 'approved' | 'rejected',
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId, profile } = auth

  const { data: inv } = await supabase
    .from('purchase_invoices')
    .select('id, name, uploaded_by, authoriser_id, status')
    .eq('id', id)
    .single()
  if (!inv) return { ok: false, error: 'Invoice not found' }

  const isAuthoriser = inv.authoriser_id === userId
  const isAdmin = profile.role === 'admin'
  if (!isAuthoriser && !isAdmin) {
    return { ok: false, error: 'Only the assigned authoriser can decide this invoice.' }
  }
  if (inv.status !== 'awaiting_approval') {
    return { ok: false, error: 'This invoice is no longer awaiting approval.' }
  }

  const { error } = await supabase
    .from('purchase_invoices')
    .update({
      status: decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_notes: notes?.trim() || null,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  if (inv.uploaded_by) {
    await notifyUsers({
      userIds: [inv.uploaded_by],
      title:
        decision === 'approved'
          ? 'Purchase invoice approved for payment'
          : 'Purchase invoice rejected',
      body:
        decision === 'approved'
          ? `${inv.name} has been approved for payment.`
          : `${inv.name} was rejected${notes ? `: ${notes}` : '.'}`,
      url: LIST_PATH,
      category: 'approval',
      createdBy: profile.id,
    })
  }

  revalidatePath(LIST_PATH)
  revalidatePath(APPROVALS_PATH)
  return { ok: true }
}

/** Uploader / admin / office marks an approved record as dealt with. */
export async function completePurchaseInvoice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const { error } = await supabase
    .from('purchase_invoices')
    .update({ status: 'complete', completed_at: new Date().toISOString(), completed_by: userId })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(LIST_PATH)
  return { ok: true }
}

/** Revert a completed record back to its prior decided state. */
export async function reopenPurchaseInvoice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: inv } = await supabase
    .from('purchase_invoices')
    .select('decided_at')
    .eq('id', id)
    .single()
  // If it was decided, return to that decision; otherwise back to awaiting.
  const prior = inv?.decided_at ? 'approved' : 'awaiting_approval'

  const { error } = await supabase
    .from('purchase_invoices')
    .update({ status: prior, completed_at: null, completed_by: null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(LIST_PATH)
  return { ok: true }
}

/** Delete a purchase invoice row (Blob left to store lifecycle). */
export async function deletePurchaseInvoice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth
  const { error } = await supabase.from('purchase_invoices').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(LIST_PATH)
  return { ok: true }
}

// --- Approvals page ---------------------------------------------------------

/**
 * Purchase invoices awaiting the current user's approval. Admins see every
 * awaiting record; others see only those assigned to them.
 */
export async function getPurchaseInvoiceApprovals(): Promise<{
  ok: boolean
  error?: string
  invoices?: PurchaseInvoice[]
}> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId, profile } = auth

  let query = supabase
    .from('purchase_invoices')
    .select(
      '*, supplier:suppliers(id, name), site:sites(id, name, postcode), client:clients(id, name), uploader:profiles!purchase_invoices_uploaded_by_fkey(id, full_name)',
    )
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true })

  if (profile.role !== 'admin') query = query.eq('authoriser_id', userId)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, invoices: (data ?? []) as PurchaseInvoice[] }
}

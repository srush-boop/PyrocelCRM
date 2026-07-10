'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/lib/types/database'

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', user.id)
    .single()

  const p = profile as Pick<Profile, 'id' | 'role' | 'full_name' | 'email'> | null
  if (!p || (p.role !== 'admin' && p.role !== 'office')) {
    return { error: 'Not authorised' as const }
  }
  return { supabase, userId: user.id, profile: p }
}

/** Add a new PO request log entry for a chargeable call. */
export async function addPoRequest(
  taskId: string,
  note: string | null,
): Promise<{ error: string | null; id?: string }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase, userId } = ctx

  const { data, error } = await supabase
    .from('po_requests')
    .insert({
      task_id: taskId,
      requested_by: userId,
      note: note?.trim() || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[v0] addPoRequest error:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null, id: (data as { id: string }).id }
}

/** Send a PO request email to the site/client and record it against this log entry. */
export async function sendPoRequestEmail(
  poRequestId: string,
  taskId: string,
  specialNote: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  // Gather task info needed to build the email
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      id,
      client_ref,
      completed_at,
      charge_reason,
      task_result:task_results(reference_number, engineer_notes, overall_status),
      direct_site:sites!tasks_site_id_fkey(id, name, contact_email, contact_name, clients(id, name, contact_email, contact_name)),
      site_service:site_services(
        sites(id, name, contact_email, contact_name, clients(id, name, contact_email, contact_name)),
        service_type:service_types(id, name)
      ),
      call_parts(name, quantity, unit_cost_pence)
    `)
    .eq('id', taskId)
    .single()

  if (!task) return { error: 'Call not found' }
  const t = task as any

  const site = t.site_service?.sites || t.direct_site
  const client = site?.clients

  // Gather recipient emails
  const recipients: string[] = []
  if (site?.contact_email) recipients.push(site.contact_email)
  if (client?.contact_email && !recipients.includes(client.contact_email)) {
    recipients.push(client.contact_email)
  }

  if (recipients.length === 0) {
    return { error: 'No email address found for this site or client. Please check the site/client contact email.' }
  }

  // Gather prior PO requests for this task (to include in email)
  const { data: priorRequests } = await supabase
    .from('po_requests')
    .select('id, created_at, note, po_number, authorised_at, requester:profiles!po_requests_requested_by_fkey(full_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  const serviceName = t.site_service?.service_type?.name || 'Service visit'
  const refNum = Array.isArray(t.task_result) ? t.task_result[0]?.reference_number : t.task_result?.reference_number
  const notes = Array.isArray(t.task_result) ? t.task_result[0]?.engineer_notes : t.task_result?.engineer_notes

  const partsList = ((t.call_parts ?? []) as any[]).map((p: any) => ({
    name: p.name || 'Part',
    quantity: p.quantity ?? 1,
    unitCostPence: p.unit_cost_pence ?? 0,
  }))
  const partsTotalPence = partsList.reduce((s: number, p: any) => s + p.quantity * p.unitCostPence, 0)

  // Mark as sent
  const { error: updateError } = await supabase
    .from('po_requests')
    .update({
      email_sent_at: new Date().toISOString(),
      email_sent_to: recipients,
      special_note: specialNote?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', poRequestId)

  if (updateError) return { error: updateError.message }

  // Fire email (best effort — build inline, avoid a heavy template for now)
  try {
    const { sendPoRequestEmail: dispatch } = await import('@/lib/email/po-request-email')
    await dispatch(recipients, {
      siteName: site?.name ?? 'Site',
      clientName: client?.name ?? null,
      contactName: site?.contact_name ?? client?.contact_name ?? null,
      serviceName,
      referenceNumber: refNum ?? null,
      completedAt: t.completed_at,
      clientRef: t.client_ref ?? null,
      engineerNotes: notes ?? null,
      parts: partsList,
      partsTotalPence,
      specialNote: specialNote?.trim() || null,
      priorRequests: (priorRequests ?? []) as any[],
      authorisationToken: poRequestId, // use ID as token
      companyName: process.env.COMPANY_NAME || 'Pyrocel',
      baseUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    })
  } catch (err) {
    console.error('[v0] PO request email failed:', (err as Error).message)
    // Non-fatal: the log entry was already updated as sent
  }

  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

/** Record that the client has authorised the PO request with a PO number/name. */
export async function authorisePoRequest(
  token: string,
  poNumber: string | null,
  authorisedByName: string | null,
): Promise<{ error: string | null }> {
  // Public action — no auth required (client opens an email link)
  const { createClient: createServiceClient } = await import('@/lib/supabase/server')
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from('po_requests')
    .update({
      po_number: poNumber?.trim() || null,
      authorised_by_name: authorisedByName?.trim() || null,
      authorised_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('authorisation_token', token)

  if (error) return { error: error.message }
  return { error: null }
}

/** Update the note on an existing PO request log entry. */
export async function updatePoRequestNote(
  id: string,
  taskId: string,
  note: string | null,
): Promise<{ error: string | null }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('po_requests')
    .update({ note: note?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/chargeable')
  revalidatePath(`/dashboard/tasks/${taskId}`)
  return { error: null }
}

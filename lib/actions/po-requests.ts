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

interface PoEmailData {
  recipients: string[]
  siteName: string
  clientName: string | null
  contactName: string | null
  serviceName: string
  systemName: string | null
  panelName: string | null
  referenceNumber: string | null
  completedAt: string | null
  clientRef: string | null
  engineerNotes: string | null
  parts: { name: string; quantity: number; unitCostPence: number }[]
  partsTotalPence: number
  priorRequests: any[]
  companyName: string
  baseUrl: string
}

/**
 * Gather everything needed to build/preview a PO-request email for a call.
 * Shared by the preview and the send actions so both show identical content.
 */
async function gatherPoEmailData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
): Promise<{ error: string } | { error: null; data: PoEmailData }> {
  // site_service is a one-to-many embed so Supabase returns an array — we take [0].
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select(`
      id,
      client_ref,
      completed_at,
      charge_reason,
      task_results(reference_number, engineer_notes, overall_status),
      direct_site:sites!tasks_site_id_fkey(id, name, contact_email, contact_name, clients(id, name, contact_email, contact_name)),
      site_service:site_services(
        sites(id, name, contact_email, contact_name, clients(id, name, contact_email, contact_name)),
        service_type:service_types(id, name),
        site_system:site_systems(id, name, panels:system_panels(name))
      ),
      call_parts(quantity, unit_cost_pence, sale_unit_price_pence, part:parts(name))
    `)
    .eq('id', taskId)
    .maybeSingle()

  if (taskError) {
    console.error('[po-requests] task query error:', taskError.message, 'taskId:', taskId)
    return { error: `Call not found (${taskError.message})` }
  }
  if (!task) return { error: 'Call not found' }
  const t = task as any

  const siteServiceRow = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
  const site = siteServiceRow?.sites || t.direct_site
  const client = site?.clients

  const recipients: string[] = []
  if (site?.contact_email) recipients.push(site.contact_email)
  if (client?.contact_email && !recipients.includes(client.contact_email)) {
    recipients.push(client.contact_email)
  }

  const { data: priorRequests } = await supabase
    .from('po_requests')
    .select('id, created_at, note, po_number, authorised_at, requester:profiles!po_requests_requested_by_fkey(full_name, email)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  const serviceName = siteServiceRow?.service_type?.name || 'Service visit'
  const taskResults = Array.isArray(t.task_results) ? t.task_results : (t.task_results ? [t.task_results] : [])
  const refNum = taskResults[0]?.reference_number ?? null
  const notes = taskResults[0]?.engineer_notes ?? null

  // System + panel for the email overview (fire alarm etc. may have named panels).
  const systemRow = siteServiceRow?.site_system
  const systemName = systemRow?.name || null
  const panelNames = ((systemRow?.panels ?? []) as { name: string }[]).map((p) => p.name).filter(Boolean)
  const panelName = panelNames.length > 0 ? panelNames.join(', ') : null

  // Price parts at the sale price (what the client is invoiced); fall back to cost.
  const partsList = ((t.call_parts ?? []) as any[]).map((p: any) => ({
    name: p.part?.name || 'Part',
    quantity: p.quantity ?? 1,
    unitCostPence: p.sale_unit_price_pence ?? p.unit_cost_pence ?? 0,
  }))
  const partsTotalPence = partsList.reduce((s: number, p: any) => s + p.quantity * p.unitCostPence, 0)

  return {
    error: null,
    data: {
      recipients,
      siteName: site?.name ?? 'Site',
      clientName: client?.name ?? null,
      contactName: site?.contact_name ?? client?.contact_name ?? null,
      serviceName,
      systemName,
      panelName,
      referenceNumber: refNum ?? null,
      completedAt: t.completed_at ?? null,
      clientRef: t.client_ref ?? null,
      engineerNotes: notes ?? null,
      parts: partsList,
      partsTotalPence,
      priorRequests: (priorRequests ?? []) as any[],
      companyName: process.env.COMPANY_NAME || 'Pyrocel',
      baseUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    },
  }
}

/**
 * Build the review-before-send overview for a PO request. Returns the same
 * content the email will contain (recipients, call summary, parts, total) so the
 * reviewer can check it before dispatching. Does not send or mutate anything.
 */
export async function getPoRequestPreview(
  taskId: string,
): Promise<{ error: string | null; data?: PoEmailData }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const result = await gatherPoEmailData(ctx.supabase, taskId)
  if (result.error !== null) return { error: result.error }
  return { error: null, data: result.data }
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

  const gathered = await gatherPoEmailData(supabase, taskId)
  if (gathered.error !== null) return { error: gathered.error }
  const d = gathered.data

  if (d.recipients.length === 0) {
    return { error: 'No email address found for this site or client. Please check the site/client contact email.' }
  }

  // Mark as sent and get the row's authorisation_token back (the token the public
  // /po-authorise/[token] page matches on — NOT the row id).
  const { data: sentRow, error: updateError } = await supabase
    .from('po_requests')
    .update({
      email_sent_at: new Date().toISOString(),
      email_sent_to: d.recipients,
      special_note: specialNote?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', poRequestId)
    .select('authorisation_token')
    .single()

  if (updateError) return { error: updateError.message }
  const authorisationToken = (sentRow as { authorisation_token: string | null })?.authorisation_token
  if (!authorisationToken) {
    return { error: 'This PO request has no authorisation token. Please try creating a new request.' }
  }

  try {
    const { sendPoRequestEmail: dispatch } = await import('@/lib/email/po-request-email')
    await dispatch(d.recipients, {
      siteName: d.siteName,
      clientName: d.clientName,
      contactName: d.contactName,
      serviceName: d.serviceName,
      systemName: d.systemName,
      panelName: d.panelName,
      referenceNumber: d.referenceNumber,
      completedAt: d.completedAt,
      clientRef: d.clientRef,
      engineerNotes: d.engineerNotes,
      parts: d.parts,
      partsTotalPence: d.partsTotalPence,
      specialNote: specialNote?.trim() || null,
      priorRequests: d.priorRequests,
      authorisationToken, // real per-row token matched by the public authorise page
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

export interface PoAuthorisationStatus {
  error: string | null
  /**
   * - 'open': no PO on file / call still open → show the entry form.
   * - 'already_provided': a PO has already been provided AND the call is closed
   *   (invoiced) → show the client the existing PO number + provider, read-only.
   * - 'not_found': token doesn't match any request.
   */
  state?: 'open' | 'already_provided' | 'not_found'
  poNumber?: string | null
  authorisedByName?: string | null
  authorisedAt?: string | null
  siteName?: string | null
  referenceNumber?: string | null
}

/**
 * Public lookup for the authorise page. Determines whether the client should see
 * the PO entry form, or a read-only confirmation that a PO has already been
 * provided and the call closed (invoiced) — in which case we surface the existing
 * PO number and the name of whoever provided it.
 */
export async function getPoAuthorisationStatus(
  token: string,
): Promise<PoAuthorisationStatus> {
  const { createClient: createServiceClient } = await import('@/lib/supabase/server')
  const supabase = await createServiceClient()

  // Resolve the token to its request + parent task.
  const { data: reqRow, error: reqError } = await supabase
    .from('po_requests')
    .select('id, task_id')
    .eq('authorisation_token', token)
    .maybeSingle()

  if (reqError) return { error: reqError.message }
  if (!reqRow) return { error: null, state: 'not_found' }

  const taskId = (reqRow as { task_id: string }).task_id

  // Is the call closed (invoiced)?
  const { data: task } = await supabase
    .from('tasks')
    .select('charge_invoiced_at, task_results(reference_number)')
    .eq('id', taskId)
    .maybeSingle()

  const t = task as
    | { charge_invoiced_at: string | null; task_results: { reference_number: string | null }[] | { reference_number: string | null } | null }
    | null
  const invoiced = !!t?.charge_invoiced_at
  const trArr = Array.isArray(t?.task_results)
    ? t?.task_results
    : t?.task_results
      ? [t.task_results]
      : []
  const referenceNumber = trArr[0]?.reference_number ?? null

  // Any authorised PO already on file for this call?
  const { data: authorised } = await supabase
    .from('po_requests')
    .select('po_number, authorised_by_name, authorised_at, task_id, tasks(site_id, sites(name))')
    .eq('task_id', taskId)
    .not('authorised_at', 'is', null)
    .not('po_number', 'is', null)
    .order('authorised_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const a = authorised as
    | {
        po_number: string | null
        authorised_by_name: string | null
        authorised_at: string | null
        tasks: { sites: { name: string | null } | null } | null
      }
    | null

  // Only lock to read-only when a PO has been provided AND the call is closed.
  if (a && invoiced) {
    return {
      error: null,
      state: 'already_provided',
      poNumber: a.po_number,
      authorisedByName: a.authorised_by_name,
      authorisedAt: a.authorised_at,
      siteName: a.tasks?.sites?.name ?? null,
      referenceNumber,
    }
  }

  return { error: null, state: 'open', referenceNumber }
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

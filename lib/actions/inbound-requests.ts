'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { triageInboundRequest } from '@/lib/ai/triage-inbound-request'
import { executeRequestInstructionAI, type ExecuteInstructionResult } from '@/lib/ai/execute-request-instruction'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import { sendEmail } from '@/lib/email/send-email'

interface StaffContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}

async function requireStaff(): Promise<{ ctx?: StaffContext; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { error: 'You do not have permission to manage requests.' }
  }
  return { ctx: { supabase, userId: user.id } }
}

export interface ActionResult {
  ok: boolean
  error?: string
  id?: string
}

/**
 * Phase-1 entry point: a staff member pastes / forwards an email into the system
 * manually. Stores it, then triages it immediately so a suggested action appears.
 */
export async function addManualRequest(input: {
  fromEmail?: string
  fromName?: string
  subject?: string
  body: string
}): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const body = input.body?.trim()
  if (!body) return { ok: false, error: 'Paste the email content.' }

  // Match the "forwarded by" staff member by their email, if the sender is known.
  let forwardedBy: string | null = null
  if (input.fromEmail?.trim()) {
    const { data: staff } = await ctx.supabase
      .from('profiles')
      .select('id')
      .ilike('email', input.fromEmail.trim())
      .maybeSingle()
    forwardedBy = (staff as { id: string } | null)?.id ?? null
  }

  const { data: inserted, error: insErr } = await ctx.supabase
    .from('inbound_requests')
    .insert({
      source: 'manual',
      from_email: input.fromEmail?.trim() || null,
      from_name: input.fromName?.trim() || null,
      subject: input.subject?.trim() || null,
      body_text: body,
      forwarded_by: forwardedBy,
      status: 'new',
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.log('[v0] addManualRequest insert failed:', insErr?.message)
    return { ok: false, error: 'Could not save the request.' }
  }

  const id = (inserted as { id: string }).id
  // Best-effort triage — a failure leaves the row as 'new' with a triage_error.
  await triageInboundRequest(id)

  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/** Which entity a contextual request was raised from. */
export type RequestEntityType = 'quote' | 'job' | 'site' | 'task' | 'defect'

const ENTITY_COLUMN: Record<RequestEntityType, string> = {
  quote: 'related_quote_id',
  job: 'related_job_id',
  site: 'related_site_id',
  task: 'related_task_id',
  defect: 'related_defect_id',
}

/**
 * Raise a request from within an entity page (a quote, job, site, call or defect).
 * Same as `addManualRequest` but (1) hard-links the row to the originating entity,
 * (2) pre-seeds the known site/client, and (3) triages anchored to that context so
 * the AI locks the match instead of guessing.
 */
export async function addContextualRequest(input: {
  entityType: RequestEntityType
  entityId: string
  body: string
  fromEmail?: string
  fromName?: string
  subject?: string
  context?: {
    siteId?: string | null
    clientId?: string | null
    serviceTypeId?: string | null
    label?: string | null
  }
  revalidate?: string
}): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const body = input.body?.trim()
  if (!body) return { ok: false, error: 'Paste the email content.' }

  const column = ENTITY_COLUMN[input.entityType]
  if (!column) return { ok: false, error: 'Unknown entity type.' }

  let forwardedBy: string | null = null
  if (input.fromEmail?.trim()) {
    const { data: staff } = await ctx.supabase
      .from('profiles')
      .select('id')
      .ilike('email', input.fromEmail.trim())
      .maybeSingle()
    forwardedBy = (staff as { id: string } | null)?.id ?? null
  }

  const { data: inserted, error: insErr } = await ctx.supabase
    .from('inbound_requests')
    .insert({
      source: 'manual',
      from_email: input.fromEmail?.trim() || null,
      from_name: input.fromName?.trim() || null,
      subject: input.subject?.trim() || null,
      body_text: body,
      forwarded_by: forwardedBy,
      status: 'new',
      [column]: input.entityId,
      // Pre-seed the known match so it's correct even if triage fails.
      matched_site_id: input.context?.siteId || null,
      matched_client_id: input.context?.clientId || null,
      matched_service_type_id: input.context?.serviceTypeId || null,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.log('[v0] addContextualRequest insert failed:', insErr?.message)
    return { ok: false, error: 'Could not save the request.' }
  }

  const id = (inserted as { id: string }).id
  await triageInboundRequest(id, {
    siteId: input.context?.siteId ?? null,
    clientId: input.context?.clientId ?? null,
    serviceTypeId: input.context?.serviceTypeId ?? null,
    contextLabel: input.context?.label ?? null,
  })

  revalidatePath('/dashboard/requests')
  if (input.revalidate) revalidatePath(input.revalidate)
  return { ok: true, id }
}

/** Re-run AI triage on a request (e.g. after correcting data or a triage error). */
export async function retriageRequest(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const res = await triageInboundRequest(id)
  revalidatePath('/dashboard/requests')
  if (!res.ok) return { ok: false, error: res.error ?? 'Triage failed.' }
  return { ok: true, id }
}

/** Let a human correct the matched site/client/service before approving. */
export async function updateRequestMatch(
  id: string,
  match: {
    siteId?: string | null
    clientId?: string | null
    serviceTypeId?: string | null
    systemTypeId?: string | null
  },
): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const patch: Record<string, unknown> = {}
  if ('siteId' in match) patch.matched_site_id = match.siteId || null
  if ('clientId' in match) patch.matched_client_id = match.clientId || null
  if ('serviceTypeId' in match) patch.matched_service_type_id = match.serviceTypeId || null
  if ('systemTypeId' in match) patch.matched_system_type_id = match.systemTypeId || null

  const { error: updErr } = await ctx.supabase.from('inbound_requests').update(patch).eq('id', id)
  if (updErr) {
    console.log('[v0] updateRequestMatch failed:', updErr.message)
    return { ok: false, error: 'Could not update the match.' }
  }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/** Dismiss a request that needs no action. */
export async function dismissRequest(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: updErr } = await ctx.supabase
    .from('inbound_requests')
    .update({ status: 'dismissed', actioned_at: new Date().toISOString(), actioned_by: ctx.userId })
    .eq('id', id)
  if (updErr) {
    console.log('[v0] dismissRequest failed:', updErr.message)
    return { ok: false, error: 'Could not dismiss the request.' }
  }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/** Re-open a dismissed/actioned request back into the triaged queue. */
export async function reopenRequest(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: updErr } = await ctx.supabase
    .from('inbound_requests')
    .update({ status: 'triaged', actioned_at: null, actioned_by: null })
    .eq('id', id)
  if (updErr) return { ok: false, error: 'Could not re-open the request.' }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/**
 * Mark a request as actioned and link the call that was created from it. Called
 * after the approve dialog books a call via the shared `bookCall` action.
 */
export async function markRequestActioned(id: string, taskId: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { error: updErr } = await ctx.supabase
    .from('inbound_requests')
    .update({
      status: 'actioned',
      created_task_id: taskId,
      actioned_at: new Date().toISOString(),
      actioned_by: ctx.userId,
    })
    .eq('id', id)
  if (updErr) {
    console.log('[v0] markRequestActioned failed:', updErr.message)
    return { ok: false, error: 'Call was booked, but the request could not be updated.' }
  }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/** Send the AI-drafted (optionally edited) acknowledgement reply to the sender. */
export async function sendAcknowledgement(id: string, body: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: reqRow } = await ctx.supabase
    .from('inbound_requests')
    .select('from_email, subject')
    .eq('id', id)
    .single()
  const req = reqRow as { from_email: string | null; subject: string | null } | null
  if (!req?.from_email) return { ok: false, error: 'No sender email to reply to.' }

  const text = body?.trim()
  if (!text) return { ok: false, error: 'Write a reply first.' }

  const subject = req.subject ? `Re: ${req.subject}` : 'Re: your request'
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#111">${text
    .split('\n')
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>` : '<br/>'))
    .join('')}</div>`

  const res = await sendEmail(req.from_email, subject, html)
  if (!res.success) {
    return { ok: false, error: 'Could not send the reply. Check email configuration.' }
  }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/**
 * Let AI read the request and a staff instruction, then immediately execute the
 * determined action (e.g. book a call). Returns a result the UI can react to
 * (show success, navigate, or show the error inline).
 */
export async function executeRequestInstruction(
  id: string,
  instruction: string,
): Promise<ExecuteInstructionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const inst = instruction?.trim()
  if (!inst) return { ok: false, error: 'Enter an instruction first.' }

  // Ask AI to plan and parameterise the action.
  const aiResult = await executeRequestInstructionAI(id, inst)

  if (!aiResult.ok) return aiResult

  // send_report: just return the navigation URL — client handles the redirect.
  if (aiResult.action === 'send_report') {
    return aiResult
  }

  // create_call: execute bookCall directly.
  if (aiResult.action === 'create_call') {
    const params = (aiResult as any)._callParams
    if (!params?.siteId || !params?.serviceTypeId) {
      return { ok: false, error: 'AI did not return enough detail to book the call.' }
    }

    // bookCall uses the session client (needs staff role), which requireStaff has
    // already confirmed. Call it server-side without going via the client.
    const bookResult = await bookCall({
      mode: 'reactive',
      siteId: params.siteId,
      serviceTypeId: params.serviceTypeId,
      systemTypeId: params.systemTypeId ?? null,
      clientId: params.clientId ?? null,
      scheduledDate: params.scheduledDate,
      respondByHours: params.respondByHours ?? null,
      notes: params.notes ?? null,
    })

    if (!bookResult.ok || !bookResult.taskId) {
      return { ok: false, error: bookResult.error ?? 'Could not book the call.' }
    }

    // Mark request as actioned.
    await ctx.supabase
      .from('inbound_requests')
      .update({
        status: 'actioned',
        created_task_id: bookResult.taskId,
        actioned_at: new Date().toISOString(),
        actioned_by: ctx.userId,
      })
      .eq('id', id)

    revalidatePath('/dashboard/requests')
    revalidatePath('/dashboard/schedule')

    return {
      ok: true,
      action: 'create_call',
      taskId: bookResult.taskId,
      summary: aiResult.summary,
      navigateTo: `/dashboard/tasks/${bookResult.taskId}`,
    }
  }

  return { ok: false, error: 'Unexpected AI action result.' }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

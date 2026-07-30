'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { triageInboundRequest } from '@/lib/ai/triage-inbound-request'
import { executeRequestInstructionAI, type ExecuteInstructionResult } from '@/lib/ai/execute-request-instruction'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import {
  saveQuote,
  type QuoteLineInput,
  type QuoteSystemInput,
} from '@/app/(dashboard)/dashboard/sales/actions'
import { sendEmail } from '@/lib/email/send-email'
import { resolveEmailFooter } from '@/lib/email/footer'
import { prepareInboundAnswer } from '@/lib/ai/answer-inbound-request'
import { prepareRequestAction } from '@/lib/ai/prepare-request-action'
import type { EmailFooter } from '@/lib/email/templates'
import type {
  SuggestedAction,
  SuggestedActionKind,
  SuggestedActionPayload,
} from '@/lib/types/database'

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

// ── AI-prepared answers (research -> draft -> confirm -> send) ────────────────

/**
 * Research the request against real system data and draft a reply for review.
 * Called on demand from the inbox ("Prepare answer" / "Regenerate") and chained
 * from triage. Runs under staff auth; the engine itself uses the admin client.
 */
export async function prepareAnswer(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const res = await prepareInboundAnswer(id)
  revalidatePath('/dashboard/requests')
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not prepare an answer.' }
  return { ok: true, id }
}

// ── AI-prepared operational actions (research -> draft -> confirm -> execute) ──

/**
 * Research the request and draft the parameters for the operational action a
 * human will confirm (book a reactive call, prepare a priced quote, log a
 * chase-up). On-demand ("Prepare action" / "Regenerate") and chained from triage.
 */
export async function prepareAction(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const res = await prepareRequestAction(id)
  revalidatePath('/dashboard/requests')
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not prepare an action.' }
  return { ok: true, id }
}

/**
 * Persist staff edits to a prepared action's parameters (notes, quote lines,
 * chase note, etc.) WITHOUT executing it. Merges the patch into the primary
 * suggested action's payload so the confirm step uses the edited values.
 */
export async function saveActionDraft(
  id: string,
  patch: Partial<SuggestedActionPayload>,
): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: row, error: readErr } = await ctx.supabase
    .from('inbound_requests')
    .select('suggested_actions')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !row) return { ok: false, error: 'Request not found.' }

  const actions = ((row as { suggested_actions: SuggestedAction[] | null }).suggested_actions ??
    []) as SuggestedAction[]
  if (actions.length === 0) return { ok: false, error: 'No prepared action to update.' }

  const next = [...actions]
  next[0] = { ...next[0], payload: { ...(next[0].payload ?? {}), ...patch } }

  const { error: updErr } = await ctx.supabase
    .from('inbound_requests')
    .update({ suggested_actions: next })
    .eq('id', id)
  if (updErr) return { ok: false, error: 'Could not save the action.' }

  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/**
 * Send the reviewed (optionally edited) AI-prepared answer to the client. This is
 * a separate, explicit, staff-confirmed send — it does NOT depend on the parked
 * general reply editor. On success the request is stamped and moved to Actioned.
 */
export async function sendInboundAnswer(
  id: string,
  input: { subject: string; body: string; recipients: string[] },
): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const subject = input.subject?.trim()
  const body = input.body?.trim()
  if (!subject) return { ok: false, error: 'Add a subject line.' }
  if (!body) return { ok: false, error: 'The reply is empty.' }

  // Validate + de-duplicate recipients. Each entry may be a bare email or a
  // "Display Name <email>" form; we validate/de-dupe on the email but keep the
  // display name so the client sees a properly addressed reply.
  const seen = new Set<string>()
  const recipients: string[] = []
  for (const raw of input.recipients || []) {
    const entry = raw.trim()
    if (!entry) continue
    const angle = /<([^>]+)>/.exec(entry)
    const email = (angle ? angle[1] : entry).trim().toLowerCase()
    if (!/.+@.+\..+/.test(email)) continue
    if (seen.has(email)) continue
    seen.add(email)
    // Preserve a display name if one was supplied and looks sane.
    recipients.push(angle && entry.replace(/<[^>]+>/, '').trim() ? entry : email)
  }
  if (recipients.length === 0) {
    return { ok: false, error: 'Add at least one valid recipient email.' }
  }

  const footer = await resolveEmailFooter(ctx.userId)
  const html = renderAnswerHtml(body, footer)

  // Send to every recipient; treat a single failure as a failure.
  const results = await Promise.all(recipients.map((to) => sendEmail(to, subject, html)))
  const failed = results.find((r) => !r.success)
  if (failed) {
    return { ok: false, error: failed.error || 'Could not send the reply. Check email configuration.' }
  }

  const { error: updErr } = await ctx.supabase
    .from('inbound_requests')
    .update({
      answer_subject: subject,
      answer_body: body,
      answer_sent_at: new Date().toISOString(),
      answer_sent_to: recipients,
      status: 'actioned',
      actioned_at: new Date().toISOString(),
      actioned_by: ctx.userId,
    })
    .eq('id', id)
  if (updErr) {
    console.log('[v0] sendInboundAnswer stamp failed:', updErr.message)
    return { ok: false, error: 'The reply was sent, but the request could not be updated.' }
  }

  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/**
 * Record that staff copied the draft to send it themselves. Persists any edits
 * and moves the request to Actioned (no email is sent from the CRM).
 */
export async function markAnswerCopied(
  id: string,
  input?: { subject?: string; body?: string },
): Promise<ActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const patch: Record<string, unknown> = {
    status: 'actioned',
    actioned_at: new Date().toISOString(),
    actioned_by: ctx.userId,
  }
  if (input?.subject?.trim()) patch.answer_subject = input.subject.trim()
  if (input?.body?.trim()) patch.answer_body = input.body.trim()

  const { error: updErr } = await ctx.supabase.from('inbound_requests').update(patch).eq('id', id)
  if (updErr) return { ok: false, error: 'Could not update the request.' }
  revalidatePath('/dashboard/requests')
  return { ok: true, id }
}

/**
 * Render a plain-text reply body as a simple, safe HTML email: paragraphs, with
 * bare URLs (e.g. report links) turned into clickable links, plus the sender's
 * configured footer.
 */
function renderAnswerHtml(body: string, footer: EmailFooter | undefined): string {
  const paragraphs = body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return '<br/>'
      return `<p style="margin:0 0 12px">${linkify(escapeHtml(trimmed))}</p>`
    })
    .join('')

  let footerHtml = ''
  if (footer) {
    const parts: string[] = []
    if (footer.message) parts.push(`<p style="margin:0 0 8px">${linkify(escapeHtml(footer.message))}</p>`)
    if (footer.imageUrl) {
      parts.push(
        `<p style="margin:0 0 8px"><img src="${escapeAttr(footer.imageUrl)}" alt="" style="max-width:320px;height:auto"/></p>`,
      )
    }
    if (footer.links && footer.links.length > 0) {
      const links = footer.links
        .map(
          (l) =>
            `<a href="${escapeAttr(l.url)}" style="color:#b91c1c;text-decoration:none">${escapeHtml(l.label)}</a>`,
        )
        .join(' &nbsp;·&nbsp; ')
      parts.push(`<p style="margin:0">${links}</p>`)
    }
    if (parts.length > 0) {
      footerHtml = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#666;font-size:13px">${parts.join(
        '',
      )}</div>`
    }
  }

  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:640px">${paragraphs}${footerHtml}</div>`
}

/** Turn bare http(s) URLs into anchor tags. Input must already be HTML-escaped. */
function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#b91c1c">${url}</a>`,
  )
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

// ── One-click execution of the AI's stored structured plan ───────────────────

export interface SuggestedActionResult {
  ok: boolean
  error?: string
  /** UI hint: what happened / what to open next. */
  kind?: SuggestedActionKind
  /** For create_call & reply: the UI opens a dialog/composer instead of us acting. */
  openDialog?: 'approve_call' | 'reply'
  /** Where to navigate after a server-side action completed. */
  navigateTo?: string
  toast?: string
}

/**
 * Execute the request's stored, fully-parameterised suggested action WITHOUT a
 * second AI pass. Server-side actions (chase-up, create draft quote) complete
 * outright; call bookings and replies return a hint so the UI opens the
 * confirmation dialog/composer (a human always confirms a call before it's made).
 */
export async function executeSuggestedAction(
  id: string,
  kind?: SuggestedActionKind,
): Promise<SuggestedActionResult> {
  const { ctx, error } = await requireStaff()
  if (error || !ctx) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: reqRow, error: reqErr } = await ctx.supabase
    .from('inbound_requests')
    .select('id, suggested_actions, matched_site_id, matched_client_id, ai_summary')
    .eq('id', id)
    .maybeSingle()
  if (reqErr || !reqRow) return { ok: false, error: 'Request not found.' }

  const req = reqRow as {
    id: string
    suggested_actions: SuggestedAction[] | null
    matched_site_id: string | null
    matched_client_id: string | null
    ai_summary: string | null
  }

  const actions = Array.isArray(req.suggested_actions) ? req.suggested_actions : []
  // Prefer the requested kind; otherwise run the primary (first) action.
  const action = (kind ? actions.find((a) => a.kind === kind) : actions[0]) ?? actions[0]
  if (!action) return { ok: false, error: 'No suggested action available. Try re-triaging.' }

  const payload: SuggestedActionPayload = action.payload ?? {}

  switch (action.kind) {
    // Calls and replies are confirmed by a human — tell the UI to open them.
    case 'create_call':
      return { ok: true, kind: 'create_call', openDialog: 'approve_call' }
    case 'reply':
      return { ok: true, kind: 'reply', openDialog: 'reply' }

    case 'send_report': {
      if (!req.matched_site_id) return { ok: false, error: 'No site matched — set the site first.' }
      return {
        ok: true,
        kind: 'send_report',
        navigateTo: `/dashboard/sites/${req.matched_site_id}?tab=calls`,
      }
    }

    case 'chase_up': {
      // Log the chase-up and mark the request handled.
      const { error: updErr } = await ctx.supabase
        .from('inbound_requests')
        .update({
          status: 'actioned',
          actioned_at: new Date().toISOString(),
          actioned_by: ctx.userId,
        })
        .eq('id', id)
      if (updErr) return { ok: false, error: 'Could not log the chase-up.' }
      revalidatePath('/dashboard/requests')
      return { ok: true, kind: 'chase_up', toast: 'Chase-up logged.' }
    }

    case 'create_quote': {
      const quoteRes = await createDraftQuoteFromRequest(ctx, req, payload)
      if (!quoteRes.ok || !quoteRes.id) {
        return { ok: false, error: quoteRes.error ?? 'Could not create the draft quote.' }
      }
      await ctx.supabase
        .from('inbound_requests')
        .update({
          status: 'actioned',
          related_quote_id: quoteRes.id,
          actioned_at: new Date().toISOString(),
          actioned_by: ctx.userId,
        })
        .eq('id', id)
      revalidatePath('/dashboard/requests')
      revalidatePath('/dashboard/sales')
      return {
        ok: true,
        kind: 'create_quote',
        navigateTo: `/dashboard/sales/${quoteRes.id}`,
        toast: 'Draft quote created.',
      }
    }

    case 'dismiss':
      return dismissRequest(id).then((r) => ({ ok: r.ok, kind: 'dismiss', error: r.error }))

    default:
      return { ok: false, error: 'This action cannot be executed automatically.' }
  }
}

/**
 * Create an empty DRAFT quote seeded from a request (client/site/type/summary).
 * Staff then price it in the builder. Returns the new quote id.
 */
async function createDraftQuoteFromRequest(
  ctx: StaffContext,
  req: { id: string; matched_site_id: string | null; matched_client_id: string | null; ai_summary: string | null },
  payload: SuggestedActionPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // A quote needs a client OR a prospect name. Fall back to the sender.
  let prospectName: string | null = null
  if (!req.matched_client_id) {
    const { data: senderRow } = await ctx.supabase
      .from('inbound_requests')
      .select('from_name, from_email')
      .eq('id', req.id)
      .maybeSingle()
    const s = senderRow as { from_name: string | null; from_email: string | null } | null
    prospectName = s?.from_name || s?.from_email || 'New prospect'
  }

  // If AI prepared line items, seed them into a single system so staff open a
  // pre-populated builder (they still confirm/price). Otherwise leave it empty.
  const preparedLines = Array.isArray(payload.quoteLines) ? payload.quoteLines : []
  const systems: QuoteSystemInput[] =
    preparedLines.length > 0
      ? [
          {
            system_name: payload.quoteSystemName?.trim() || 'Works',
            work_type: payload.quoteType || 'remedial',
            lines: preparedLines
              .filter((l) => l.description?.trim())
              .map<QuoteLineInput>((l) => ({
                description: l.description.trim(),
                quantity: Math.max(1, Math.round(l.quantity || 1)),
                // AI does not price; seed cost from any hint (pounds→pence) else 0.
                unit_cost_pence:
                  l.unitPricePounds != null && l.unitPricePounds > 0
                    ? Math.round(l.unitPricePounds * 100)
                    : 0,
                margin_percent: null,
              })),
          },
        ]
      : []

  return saveQuote({
    title: payload.title?.trim() || 'New quote',
    quote_type: payload.quoteType || 'other',
    client_id: req.matched_client_id || null,
    site_id: req.matched_site_id || null,
    prospect_name: req.matched_client_id ? null : prospectName,
    summary: payload.summary || req.ai_summary || null,
    vat_rate: 20,
    discount_pence: 0,
    systems,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

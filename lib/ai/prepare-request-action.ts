'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  InboundRequestUrgency,
  PreparedQuoteLine,
  SuggestedAction,
  SuggestedActionKind,
  SuggestedActionPayload,
} from '@/lib/types/database'

// Same zero-config Gateway model the triage + answer engines use.
const ACTION_MODEL = 'openai/gpt-5.4-mini'
const MAX_QUOTE_LINES = 25

// Which action kinds this engine can prepare parameters for. reply/send_report
// are handled by the answer engine; dismiss needs no preparation.
const PREPARABLE: SuggestedActionKind[] = ['create_call', 'create_quote', 'chase_up']

export interface PrepareActionResult {
  ok: boolean
  kind?: SuggestedActionKind
  error?: string
}

type AdminClient = ReturnType<typeof createAdminClient>

interface RequestRow {
  id: string
  body_text: string | null
  subject: string | null
  ai_summary: string | null
  ai_intent: string | null
  ai_urgency: InboundRequestUrgency | null
  from_name: string | null
  matched_site_id: string | null
  matched_client_id: string | null
  matched_service_type_id: string | null
  matched_system_type_id: string | null
  suggested_actions: SuggestedAction[] | null
}

/**
 * Research a client's actionable request and draft the parameters for the
 * operational action a human will confirm (book a reactive call, prepare a
 * priced quote, log a chase-up).
 *
 * Core principle mirrors the answer engine: CODE supplies the real context (the
 * matched site/client, the site's systems, catalogue hints) and the AI drafts
 * sensible parameters within it. NOTHING is created here — the parameters are
 * persisted onto `suggested_actions[0].payload` and `action_prepared_at` is
 * stamped so the inbox can render a "confirm & execute" card.
 *
 * Safe to call from triage — any failure returns `{ ok:false }` and never throws.
 */
export async function prepareRequestAction(id: string): Promise<PrepareActionResult> {
  try {
    const supabase = createAdminClient()

    const { data: reqRow, error: reqErr } = await supabase
      .from('inbound_requests')
      .select(
        'id, body_text, subject, ai_summary, ai_intent, ai_urgency, from_name, matched_site_id, matched_client_id, matched_service_type_id, matched_system_type_id, suggested_actions',
      )
      .eq('id', id)
      .maybeSingle()

    if (reqErr || !reqRow) return { ok: false, error: 'Request not found.' }
    const req = reqRow as RequestRow

    // Need a matched site for calls, or at least a client for quotes.
    if (!req.matched_site_id && !req.matched_client_id) {
      return { ok: false, error: 'Match a site or client first, then prepare an action.' }
    }

    // ── 1. Decide which action to prepare ─────────────────────────────────────
    const kind = await decideActionKind(req)
    if (!kind) {
      return { ok: false, error: 'This request does not map to a call, quote or chase-up.' }
    }
    // Calls require a site (they attend a place); quotes can be client-only.
    if (kind === 'create_call' && !req.matched_site_id) {
      return { ok: false, error: 'Match a site first to prepare a call.' }
    }

    // ── 2. Gather context + draft the action parameters ───────────────────────
    const context = await gatherContext(supabase, req)
    const payload = await draftActionPayload(req, kind, context)

    // ── 3. Persist onto suggested_actions[0] + stamp prepared ─────────────────
    const existing = Array.isArray(req.suggested_actions) ? req.suggested_actions : []
    const primary: SuggestedAction = {
      kind,
      label: labelForKind(kind, context),
      payload: {
        // Preserve any existing match context, overlaid with the drafted params.
        ...(existing[0]?.payload ?? {}),
        siteId: req.matched_site_id,
        clientId: req.matched_client_id,
        serviceTypeId: req.matched_service_type_id,
        systemTypeId: req.matched_system_type_id,
        ...payload,
      },
    }
    const nextActions = [primary, ...existing.filter((a) => a.kind !== kind)]

    const { error: updErr } = await supabase
      .from('inbound_requests')
      .update({
        suggested_actions: nextActions,
        action_prepared_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) {
      console.log('[v0] prepareRequestAction persist failed:', updErr.message)
      return { ok: false, error: 'Could not save the prepared action.' }
    }

    return { ok: true, kind }
  } catch (err) {
    console.log(
      '[v0] prepareRequestAction error:',
      err instanceof Error ? err.message : String(err),
    )
    return { ok: false, error: 'Could not prepare an action.' }
  }
}

// ── Decide action kind ───────────────────────────────────────────────────────

/**
 * Prefer an existing preparable suggested action (triage already classified it);
 * otherwise map the intent. Reactive/new work → call, quote requests → quote,
 * chases → chase_up.
 */
async function decideActionKind(req: RequestRow): Promise<SuggestedActionKind | null> {
  const existingPreparable = (req.suggested_actions ?? []).find((a) =>
    PREPARABLE.includes(a.kind),
  )
  if (existingPreparable) return existingPreparable.kind

  switch (req.ai_intent) {
    case 'new_call':
    case 'complaint':
      return 'create_call'
    case 'quote_request':
      return 'create_quote'
    case 'chase_up':
      return 'chase_up'
    default:
      return null
  }
}

// ── Gather context ───────────────────────────────────────────────────────────

interface ActionContext {
  siteName: string | null
  clientName: string | null
  systems: { name: string; serviceTypeName: string | null }[]
  // Catalogue hints for quote drafting (names only — pricing stays with staff).
  catalogueHints: string[]
}

async function gatherContext(supabase: AdminClient, req: RequestRow): Promise<ActionContext> {
  const ctx: ActionContext = {
    siteName: null,
    clientName: null,
    systems: [],
    catalogueHints: [],
  }

  if (req.matched_site_id) {
    const { data: site } = await supabase
      .from('sites')
      .select('name, client:clients(name)')
      .eq('id', req.matched_site_id)
      .maybeSingle()
    if (site) {
      const row = site as unknown as {
        name: string | null
        client?: { name: string | null } | { name: string | null }[] | null
      }
      ctx.siteName = row.name ?? null
      ctx.clientName = firstEmbed(row.client)?.name ?? null
    }

    const { data: systems } = await supabase
      .from('site_systems')
      .select('system_type:system_types(name), service_type:service_types(name)')
      .eq('site_id', req.matched_site_id)
      .limit(30)
    for (const s of (systems ?? []) as unknown as {
      system_type?: { name: string | null } | { name: string | null }[] | null
      service_type?: { name: string | null } | { name: string | null }[] | null
    }[]) {
      const name = firstEmbed(s.system_type)?.name
      if (name) ctx.systems.push({ name, serviceTypeName: firstEmbed(s.service_type)?.name ?? null })
    }
  }

  if (!ctx.clientName && req.matched_client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', req.matched_client_id)
      .maybeSingle()
    ctx.clientName = (client as { name: string | null } | null)?.name ?? null
  }

  // Lightweight catalogue name hints to steer quote line descriptions. Best
  // effort — the table may be small or absent; failures are swallowed.
  try {
    const { data: cat } = await supabase
      .from('quote_catalogue_items')
      .select('name')
      .limit(40)
    for (const c of (cat ?? []) as { name: string | null }[]) {
      if (c.name) ctx.catalogueHints.push(c.name)
    }
  } catch {
    // no catalogue available — quote lines will be free-text only
  }

  return ctx
}

// ── Draft parameters ─────────────────────────────────────────────────────────

async function draftActionPayload(
  req: RequestRow,
  kind: SuggestedActionKind,
  context: ActionContext,
): Promise<Partial<SuggestedActionPayload>> {
  const requestText = [req.subject, req.ai_summary, req.body_text]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000)

  if (kind === 'create_call') return draftCall(requestText, req, context)
  if (kind === 'create_quote') return draftQuote(requestText, context)
  return draftChaseUp(requestText, context)
}

async function draftCall(
  requestText: string,
  req: RequestRow,
  context: ActionContext,
): Promise<Partial<SuggestedActionPayload>> {
  const { object } = await generateObject({
    model: ACTION_MODEL,
    schema: z.object({
      urgency: z.enum(['emergency', 'high', 'normal', 'low']),
      notes: z.string().describe('Clear internal notes for the attending engineer, 1-4 sentences.'),
      respondByHours: z
        .number()
        .nullable()
        .describe('Target response window in hours if the client implied one, else null.'),
    }),
    prompt: [
      'You are an office coordinator for a fire & security maintenance company.',
      'A client has sent a request that needs a reactive attendance (call) booking.',
      'Draft concise internal booking notes and judge urgency. Do NOT invent a date.',
      context.siteName ? `Site: ${context.siteName}` : '',
      context.systems.length
        ? `Systems on site: ${context.systems.map((s) => s.name).join(', ')}`
        : '',
      '',
      'Request:',
      requestText,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  return {
    urgency: object.urgency,
    notes: object.notes.trim(),
    respondByHours: object.respondByHours ?? (req.ai_urgency === 'emergency' ? 4 : null),
    suggestedDate: null, // staff pick a date in the confirm dialog
  }
}

async function draftQuote(
  requestText: string,
  context: ActionContext,
): Promise<Partial<SuggestedActionPayload>> {
  const { object } = await generateObject({
    model: ACTION_MODEL,
    schema: z.object({
      title: z.string().describe('Short quote title, e.g. "Fire alarm remedial works — Unit 4".'),
      summary: z.string().describe('Scope of works summary, 2-5 sentences, client-appropriate.'),
      systemName: z
        .string()
        .describe('The system/grouping this quote covers, e.g. "Fire Alarm".'),
      lines: z
        .array(
          z.object({
            description: z.string().describe('One line of works or a part/device.'),
            quantity: z.number().min(1).describe('Quantity, default 1.'),
          }),
        )
        .max(MAX_QUOTE_LINES)
        .describe('Suggested line items derived ONLY from the request. Leave pricing to staff.'),
    }),
    prompt: [
      'You are a fire & security estimator preparing a DRAFT quote scope from a client request.',
      'List the works/parts the client is asking for as line items. Do NOT set prices.',
      'Only include items clearly implied by the request — do not pad the quote.',
      context.siteName ? `Site: ${context.siteName}` : '',
      context.clientName ? `Client: ${context.clientName}` : '',
      context.systems.length
        ? `Systems on site: ${context.systems.map((s) => s.name).join(', ')}`
        : '',
      context.catalogueHints.length
        ? `Catalogue items you may reference by name: ${context.catalogueHints.slice(0, 40).join(', ')}`
        : '',
      '',
      'Request:',
      requestText,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  const quoteLines: PreparedQuoteLine[] = object.lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: Math.max(1, Math.round(l.quantity || 1)),
      unitPricePounds: null,
    }))
    .filter((l) => l.description.length > 0)

  return {
    quoteType: 'remedial',
    title: object.title.trim(),
    summary: object.summary.trim(),
    quoteSystemName: object.systemName.trim() || 'Works',
    quoteLines,
  }
}

async function draftChaseUp(
  requestText: string,
  context: ActionContext,
): Promise<Partial<SuggestedActionPayload>> {
  const { object } = await generateObject({
    model: ACTION_MODEL,
    schema: z.object({
      note: z
        .string()
        .describe('A concise internal chase-up note capturing what the client is chasing.'),
    }),
    prompt: [
      'You are an office coordinator. Summarise what this client is chasing into a short',
      'internal note that a colleague can action. 1-3 sentences.',
      context.siteName ? `Site: ${context.siteName}` : '',
      context.clientName ? `Client: ${context.clientName}` : '',
      '',
      'Request:',
      requestText,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  return { note: object.note.trim() }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Supabase types an embed as `T | T[]` depending on the FK — normalise to one. */
function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function labelForKind(kind: SuggestedActionKind, context: ActionContext): string {
  const where = context.siteName ? ` at ${context.siteName}` : ''
  switch (kind) {
    case 'create_call':
      return `Book a reactive call${where}`
    case 'create_quote':
      return `Prepare a quote${context.clientName ? ` for ${context.clientName}` : ''}`
    case 'chase_up':
      return 'Log a chase-up'
    default:
      return 'Prepare action'
  }
}

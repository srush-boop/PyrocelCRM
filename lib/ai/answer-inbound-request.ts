'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { forecastCalls } from '@/lib/forecast'
import { toDateString } from '@/lib/scheduling'
import { formatGBP } from '@/lib/utils'
import type { RequestAnswerKind, RequestAnswerFacts } from '@/lib/types/database'

// Same zero-config Gateway model the triage uses.
const ANSWER_MODEL = 'openai/gpt-5.4-mini'
const MAX_BODY_CHARS = 4000
const MAX_REPORTS = 8
const MAX_HISTORY = 8
const MAX_QUOTES = 6

export interface PrepareAnswerResult {
  ok: boolean
  kind?: RequestAnswerKind
  error?: string
}

/** Resolve the public base URL for building client-facing /r/<token> links. */
function resolveBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (vercelUrl ? `https://${vercelUrl}` : '')
  ).replace(/\/$/, '')
}

type AdminClient = ReturnType<typeof createAdminClient>

interface RequestRow {
  id: string
  body_text: string | null
  subject: string | null
  ai_summary: string | null
  ai_intent: string | null
  from_name: string | null
  matched_site_id: string | null
  matched_client_id: string | null
  matched_service_type_id: string | null
  matched_system_type_id: string | null
}

/**
 * Research a client's informational request against real system data and draft a
 * reply for staff to review/edit before sending.
 *
 * Core principle: CODE gathers the facts deterministically (report links, next-due
 * dates, quote statuses); the AI only PHRASES those verified facts into prose. The
 * model is never asked to invent a date, status or figure.
 *
 * Safe to call from triage — any failure returns `{ ok:false }` and never throws.
 */
export async function prepareInboundAnswer(id: string): Promise<PrepareAnswerResult> {
  try {
    const supabase = createAdminClient()

    const { data: reqRow, error: reqErr } = await supabase
      .from('inbound_requests')
      .select(
        'id, body_text, subject, ai_summary, ai_intent, from_name, matched_site_id, matched_client_id, matched_service_type_id, matched_system_type_id',
      )
      .eq('id', id)
      .maybeSingle()

    if (reqErr || !reqRow) return { ok: false, error: 'Request not found.' }
    const req = reqRow as RequestRow

    // We need a matched site for site-scoped answers, or at least a client for
    // quote/account questions. Without either we can't research anything.
    if (!req.matched_site_id && !req.matched_client_id) {
      return { ok: false, error: 'Match a site or client first, then prepare an answer.' }
    }

    // ── 1. Classify: is this answerable, and which kind + target service? ──────
    const classification = await classifyRequest(supabase, req)
    if (!classification.answerable || !classification.kind) {
      return { ok: false, error: 'This request is not an informational lookup.' }
    }
    const kind = classification.kind

    // ── 2. Gather facts deterministically ─────────────────────────────────────
    const facts = await gatherFacts(supabase, req, kind, {
      serviceTypeId: classification.targetServiceTypeId ?? req.matched_service_type_id,
      systemTypeId: classification.targetSystemTypeId ?? req.matched_system_type_id,
    })

    // ── 3. Draft the reply prose from the verified facts ──────────────────────
    const draft = await draftReply(req, kind, facts)

    // Guarantee the report links are attached: the LLM is asked to include them,
    // but we never rely on that for something the client explicitly requested.
    const body = ensureReportLinksAppended(draft.body, kind, facts)

    // ── 4. Persist ────────────────────────────────────────────────────────────
    const { error: updErr } = await supabase
      .from('inbound_requests')
      .update({
        answer_kind: kind,
        answer_subject: draft.subject,
        answer_body: body,
        answer_facts: facts,
        answer_prepared_at: new Date().toISOString(),
        // Clear any stale send stamps if this is a regenerate.
        answer_sent_at: null,
        answer_sent_to: null,
      })
      .eq('id', id)

    if (updErr) {
      console.log('[v0] prepareInboundAnswer persist failed:', updErr.message)
      return { ok: false, error: 'Could not save the prepared answer.' }
    }

    return { ok: true, kind }
  } catch (err) {
    console.log('[v0] prepareInboundAnswer error:', err instanceof Error ? err.message : String(err))
    return { ok: false, error: 'Could not prepare an answer.' }
  }
}

// ── Step 1: classify ────────────────────────────────────────────────────────

const classifySchema = z.object({
  answerable: z
    .boolean()
    .describe('True if this is an informational question we can answer from system records.'),
  kind: z
    .enum(['reports', 'next_due', 'quote_status', 'service_history', 'account_info'])
    .nullable()
    .describe('The category of information the client is asking for; null if not answerable.'),
  targetSystem: z
    .string()
    .nullable()
    .describe('The system the client refers to, verbatim, e.g. "fire alarm", "intruder alarm". Null if none.'),
  reasoning: z.string().describe('One short sentence explaining the classification.'),
})

async function classifyRequest(
  supabase: AdminClient,
  req: RequestRow,
): Promise<{
  answerable: boolean
  kind: RequestAnswerKind | null
  targetServiceTypeId: string | null
  targetSystemTypeId: string | null
}> {
  const body = (req.body_text ?? '').slice(0, MAX_BODY_CHARS)

  const { object } = await generateObject({
    model: ANSWER_MODEL,
    schema: classifySchema,
    system:
      'You triage inbound emails to a UK fire & security maintenance company. Decide whether the ' +
      'message is an INFORMATIONAL request that can be answered from existing records (not a request ' +
      'to book new work or raise a quote). Categories: reports (send latest reports/certificates), ' +
      'next_due (when is the next service/maintenance due), quote_status (status of an existing quote), ' +
      'service_history (when were we last visited / past visits), account_info (contract, charges or ' +
      'contact details). If the client wants NEW work booked or a NEW quote priced, set answerable=false.',
    prompt: `Subject: ${req.subject ?? '(none)'}\n\nEmail:\n${body}\n\nSummary so far: ${req.ai_summary ?? '(none)'}`,
  })

  // Resolve the referenced system/service to concrete ids so fact-gathering can
  // filter. Default to whatever triage already matched.
  let targetServiceTypeId = req.matched_service_type_id
  let targetSystemTypeId = req.matched_system_type_id

  if (object.targetSystem && req.matched_site_id) {
    const resolved = await resolveTargetSystem(supabase, req.matched_site_id, object.targetSystem)
    if (resolved.serviceTypeId) targetServiceTypeId = resolved.serviceTypeId
    if (resolved.systemTypeId) targetSystemTypeId = resolved.systemTypeId
  }

  return {
    answerable: object.answerable,
    kind: object.kind,
    targetServiceTypeId,
    targetSystemTypeId,
  }
}

/**
 * Match a free-text system name (e.g. "the intruder alarm") to a system/service
 * actually present on the site, so facts are filtered to what the client meant.
 */
async function resolveTargetSystem(
  supabase: AdminClient,
  siteId: string,
  text: string,
): Promise<{ serviceTypeId: string | null; systemTypeId: string | null }> {
  const needle = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim()
  // Keep ALL meaningful tokens (including "alarm") so "fire alarm" can out-score
  // "fire damper" — dropping "alarm" was collapsing every "fire ..." request to
  // whichever fire service happened to come first (e.g. Fire Dampers).
  const tokens = needle.split(/\s+/).filter((t) => t.length > 2 && t !== 'system')

  const { data } = await supabase
    .from('site_services')
    .select(
      'service_type_id, service_type:service_types(id, name, system_type:system_types(id, name))',
    )
    .eq('site_id', siteId)

  const rows = (data ?? []) as unknown as {
    service_type_id: string | null
    service_type: {
      id: string
      name: string | null
      system_type: { id: string; name: string | null } | null
    } | null
  }[]

  // Score every candidate and keep the strongest match, rather than the first hit.
  let best: { serviceTypeId: string | null; systemTypeId: string | null; score: number } | null =
    null
  for (const r of rows) {
    const svcName = (r.service_type?.name ?? '').toLowerCase()
    const sysName = (r.service_type?.system_type?.name ?? '').toLowerCase()
    const haystack = `${svcName} ${sysName}`

    let score = 0
    // +1 per matched token — so a 2-word phrase like "fire alarm" beats a single
    // shared word like "fire".
    for (const t of tokens) if (haystack.includes(t)) score += 1
    // Strong bonus if the full phrase appears verbatim.
    if (needle.length > 2 && haystack.includes(needle)) score += 3
    // Domain synonyms.
    if (needle.includes('intruder') && (haystack.includes('intruder') || haystack.includes('burglar')))
      score += 2

    if (score > 0 && (!best || score > best.score)) {
      best = {
        serviceTypeId: r.service_type?.id ?? r.service_type_id ?? null,
        systemTypeId: r.service_type?.system_type?.id ?? null,
        score,
      }
    }
  }

  // Prefer SYSTEM-level filtering when the winner belongs to a system type: a
  // client asking for "the fire alarm reports" wants every fire-alarm service's
  // reports (weekly test + annual maintenance), not just one service.
  if (best) {
    if (best.systemTypeId) return { serviceTypeId: null, systemTypeId: best.systemTypeId }
    return { serviceTypeId: best.serviceTypeId, systemTypeId: null }
  }
  return { serviceTypeId: null, systemTypeId: null }
}

// ── Step 2: gather facts ──────────────────────────────────────────────────────

async function gatherFacts(
  supabase: AdminClient,
  req: RequestRow,
  kind: RequestAnswerKind,
  target: { serviceTypeId: string | null; systemTypeId: string | null },
): Promise<RequestAnswerFacts> {
  const facts: RequestAnswerFacts = {}

  // Resolve names for context (used by the draft prompt).
  if (req.matched_site_id) {
    const { data: site } = await supabase
      .from('sites')
      .select('name, contact_name, contact_email, contact_phone, client:clients(name)')
      .eq('id', req.matched_site_id)
      .maybeSingle()
    const s = site as {
      name: string | null
      contact_name: string | null
      contact_email: string | null
      contact_phone: string | null
      client: { name: string | null } | null
    } | null
    facts.siteName = s?.name ?? null
    facts.clientName = s?.client?.name ?? null
    if (kind === 'account_info') {
      facts.account = {
        contactName: s?.contact_name ?? null,
        contactEmail: s?.contact_email ?? null,
        contactPhone: s?.contact_phone ?? null,
      }
    }
  } else if (req.matched_client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, contact_name, contact_email, contact_phone')
      .eq('id', req.matched_client_id)
      .maybeSingle()
    const c = client as {
      name: string | null
      contact_name: string | null
      contact_email: string | null
      contact_phone: string | null
    } | null
    facts.clientName = c?.name ?? null
    if (kind === 'account_info') {
      facts.account = {
        contactName: c?.contact_name ?? null,
        contactEmail: c?.contact_email ?? null,
        contactPhone: c?.contact_phone ?? null,
      }
    }
  }

  // Label of the target system/service, if any.
  if (target.serviceTypeId) {
    const { data: st } = await supabase
      .from('service_types')
      .select('name, system_type:system_types(name)')
      .eq('id', target.serviceTypeId)
      .maybeSingle()
    const row = st as { name: string | null; system_type: { name: string | null } | null } | null
    facts.serviceLabel = row?.system_type?.name || row?.name || null
  } else if (target.systemTypeId) {
    const { data: sys } = await supabase
      .from('system_types')
      .select('name')
      .eq('id', target.systemTypeId)
      .maybeSingle()
    facts.serviceLabel = (sys as { name: string | null } | null)?.name ?? null
  }

  switch (kind) {
    case 'reports':
      facts.reports = await gatherReports(supabase, req.matched_site_id, target)
      break
    case 'service_history':
      facts.history = await gatherHistory(supabase, req.matched_site_id, target)
      break
    case 'next_due':
      facts.nextDue = await gatherNextDue(req.matched_site_id)
      break
    case 'quote_status':
      facts.quotes = await gatherQuotes(supabase, req.matched_client_id, req.matched_site_id)
      break
    case 'account_info':
      if (facts.account) {
        facts.account.charges = await gatherCharges(supabase, req.matched_site_id, req.matched_client_id)
      }
      break
  }

  return facts
}

/** Site tasks with their service/system labels, newest completed first. */
async function loadCompletedTasks(
  supabase: AdminClient,
  siteId: string,
  target: { serviceTypeId: string | null; systemTypeId: string | null },
  limit: number,
) {
  const { data } = await supabase
    .from('tasks')
    .select(
      `id, public_token, completed_at, reference_number, status,
       site_service:site_services!inner(
         site_id, service_type_id,
         service_type:service_types(name, system_type_id, system_type:system_types(name))
       )`,
    )
    .eq('site_service.site_id', siteId)
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(40)

  let rows = (data ?? []) as unknown as {
    id: string
    public_token: string | null
    completed_at: string | null
    reference_number: string | null
    site_service: {
      site_id: string | null
      service_type_id: string | null
      service_type: {
        name: string | null
        system_type_id: string | null
        system_type: { name: string | null } | null
      } | null
    } | null
  }[]

  if (target.serviceTypeId) {
    rows = rows.filter((r) => r.site_service?.service_type_id === target.serviceTypeId)
  } else if (target.systemTypeId) {
    rows = rows.filter((r) => r.site_service?.service_type?.system_type_id === target.systemTypeId)
  }

  return rows.slice(0, limit)
}

async function gatherReports(
  supabase: AdminClient,
  siteId: string | null,
  target: { serviceTypeId: string | null; systemTypeId: string | null },
): Promise<NonNullable<RequestAnswerFacts['reports']>> {
  if (!siteId) return []
  const rows = await loadCompletedTasks(supabase, siteId, target, MAX_REPORTS)
  const base = resolveBaseUrl()

  // Overall status lives on task_results.
  const ids = rows.map((r) => r.id)
  const statusByTask = new Map<string, string | null>()
  if (ids.length > 0) {
    const { data: results } = await supabase
      .from('task_results')
      .select('task_id, overall_status')
      .in('task_id', ids)
    for (const r of (results ?? []) as { task_id: string; overall_status: string | null }[]) {
      statusByTask.set(r.task_id, r.overall_status)
    }
  }

  return rows.map((r) => ({
    reference: r.reference_number,
    serviceName: r.site_service?.service_type?.name ?? null,
    systemName: r.site_service?.service_type?.system_type?.name ?? null,
    completedDate: r.completed_at ? toDateString(new Date(r.completed_at)) : null,
    status: statusByTask.get(r.id) ?? null,
    link: base && r.public_token ? `${base}/r/${r.public_token}` : null,
  }))
}

async function gatherHistory(
  supabase: AdminClient,
  siteId: string | null,
  target: { serviceTypeId: string | null; systemTypeId: string | null },
): Promise<NonNullable<RequestAnswerFacts['history']>> {
  if (!siteId) return []
  const rows = await loadCompletedTasks(supabase, siteId, target, MAX_HISTORY)
  const ids = rows.map((r) => r.id)
  const statusByTask = new Map<string, string | null>()
  if (ids.length > 0) {
    const { data: results } = await supabase
      .from('task_results')
      .select('task_id, overall_status')
      .in('task_id', ids)
    for (const r of (results ?? []) as { task_id: string; overall_status: string | null }[]) {
      statusByTask.set(r.task_id, r.overall_status)
    }
  }
  return rows.map((r) => ({
    reference: r.reference_number,
    serviceName: r.site_service?.service_type?.name ?? null,
    date: r.completed_at ? toDateString(new Date(r.completed_at)) : null,
    status: statusByTask.get(r.id) ?? null,
  }))
}

async function gatherNextDue(
  siteId: string | null,
): Promise<NonNullable<RequestAnswerFacts['nextDue']>> {
  if (!siteId) return []
  const today = new Date()
  const horizon = new Date(today)
  horizon.setMonth(horizon.getMonth() + 18)

  let rows
  try {
    rows = await forecastCalls(toDateString(today), toDateString(horizon), { siteId })
  } catch (err) {
    console.log('[v0] gatherNextDue forecast failed:', err instanceof Error ? err.message : String(err))
    return []
  }

  // Earliest forecast occurrence per service. Forecast rows are already sorted by
  // date ascending, so the first row seen for each service is its next due date.
  // Rows carry names (not ids), so we surface every recurring service on the site
  // and let the draft focus on the one the client asked about from context.
  const bySvc = new Map<string, NonNullable<RequestAnswerFacts['nextDue']>[number]>()
  for (const r of rows) {
    const key = `${r.serviceTypeName}|${r.systemTypeName ?? ''}`
    if (!bySvc.has(key)) {
      bySvc.set(key, {
        serviceName: r.serviceTypeName,
        systemName: r.systemTypeName,
        lastVisit: null,
        nextDue: r.date,
        frequency: r.frequencyLabel,
      })
    }
  }
  return Array.from(bySvc.values())
}

async function gatherQuotes(
  supabase: AdminClient,
  clientId: string | null,
  siteId: string | null,
): Promise<NonNullable<RequestAnswerFacts['quotes']>> {
  let query = supabase
    .from('quotes')
    .select('quote_number, title, status, total_pence, created_at, updated_at, client_id, site_id')
    .order('updated_at', { ascending: false })
    .limit(MAX_QUOTES)

  if (siteId) query = query.eq('site_id', siteId)
  else if (clientId) query = query.eq('client_id', clientId)
  else return []

  const { data } = await query
  const rows = (data ?? []) as {
    quote_number: string | null
    title: string | null
    status: string | null
    total_pence: number | null
    created_at: string | null
    updated_at: string | null
  }[]

  return rows.map((q) => ({
    number: q.quote_number,
    title: q.title,
    status: q.status,
    total: q.total_pence != null ? formatGBP(q.total_pence / 100) : null,
    created: q.created_at ? toDateString(new Date(q.created_at)) : null,
    updated: q.updated_at ? toDateString(new Date(q.updated_at)) : null,
  }))
}

async function gatherCharges(
  supabase: AdminClient,
  siteId: string | null,
  clientId: string | null,
): Promise<NonNullable<NonNullable<RequestAnswerFacts['account']>['charges']>> {
  let query = supabase
    .from('recurring_charges')
    .select('description, unit_price_pence, quantity, frequency, active, site_id, client_id')
    .eq('active', true)
    .limit(20)

  if (siteId) query = query.eq('site_id', siteId)
  else if (clientId) query = query.eq('client_id', clientId)
  else return []

  const { data } = await query
  const rows = (data ?? []) as {
    description: string
    unit_price_pence: number
    quantity: number
    frequency: string | null
  }[]

  // Occurrences per year for each RecurringFrequency. unit_price_pence is always
  // the per-period amount billed each occurrence, so annual = unit x qty x occ.
  const perYear: Record<string, number> = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    biannual: 2,
    annual: 1,
  }

  return rows.map((c) => {
    const occ = perYear[(c.frequency ?? '').toLowerCase()] ?? 1
    const annualPence = (c.unit_price_pence || 0) * (c.quantity || 1) * occ
    return {
      name: c.description,
      frequency: c.frequency,
      annualValue: formatGBP(annualPence / 100),
    }
  })
}

/**
 * Deterministically ensure every report link the client asked for is present in
 * the body. If the drafted prose already contains a link we leave it; any missing
 * links are appended in a tidy "Your reports" block so reports are NEVER dropped.
 */
function ensureReportLinksAppended(
  body: string,
  kind: RequestAnswerKind,
  facts: RequestAnswerFacts,
): string {
  if (kind !== 'reports') return body
  const reports = (facts.reports ?? []).filter((r) => !!r.link)
  if (reports.length === 0) return body

  const missing = reports.filter((r) => !body.includes(r.link as string))
  if (missing.length === 0) return body

  const lines = missing.map((r) => {
    const label =
      [r.systemName, r.serviceName].filter(Boolean).join(' – ') || r.reference || 'Report'
    const dated = r.completedDate ? ` (${formatDateForBody(r.completedDate)})` : ''
    return `• ${label}${dated}: ${r.link}`
  })

  const heading =
    reports.length === missing.length
      ? 'Your latest report(s):'
      : 'Additional report(s):'

  return `${body.trimEnd()}\n\n${heading}\n${lines.join('\n')}`
}

/** DD/MM/YYYY for report dates that arrive as yyyy-MM-dd strings. */
function formatDateForBody(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// ── Step 3: draft the reply ───────────────────────────────────────────────────

const draftSchema = z.object({
  subject: z.string().describe('A concise, professional email subject line.'),
  body: z
    .string()
    .describe(
      'The full reply body in plain text. Use short paragraphs. Include any report links verbatim ' +
        'on their own line. Do NOT invent facts beyond those supplied.',
    ),
})

async function draftReply(
  req: RequestRow,
  kind: RequestAnswerKind,
  facts: RequestAnswerFacts,
): Promise<{ subject: string; body: string }> {
  const kindLabel: Record<RequestAnswerKind, string> = {
    reports: 'sending the latest report(s)/certificate(s)',
    next_due: 'confirming when the next service/maintenance is due',
    quote_status: 'giving an update on the quote',
    service_history: 'summarising recent service visits',
    account_info: 'confirming account/contract details',
  }

  const greetingName = facts.clientName || req.from_name || null

  const { object } = await generateObject({
    model: ANSWER_MODEL,
    schema: draftSchema,
    system:
      'You are a helpful, professional customer-service representative at Pyrocel, a UK fire & ' +
      'security maintenance company. Draft a warm but concise email reply to a client. CRITICAL RULES: ' +
      '(1) Use ONLY the facts provided in the JSON below — never invent dates, statuses, figures, or ' +
      'report links. (2) If a fact is missing, do not guess; either omit it or note that you will ' +
      'follow up. (3) Include any report links exactly as given, each on its own line. (4) Use British ' +
      'English and a professional sign-off as "The Pyrocel Team". (5) Do not include a subject line in ' +
      'the body.',
    prompt: [
      `Task: You are ${kindLabel[kind]}.`,
      greetingName ? `Client/contact name: ${greetingName}` : '',
      req.subject ? `Original subject: ${req.subject}` : '',
      req.body_text ? `Client wrote:\n${req.body_text.slice(0, MAX_BODY_CHARS)}` : '',
      '',
      'Verified facts (JSON):',
      JSON.stringify(facts, null, 2),
    ]
      .filter(Boolean)
      .join('\n'),
  })

  return { subject: object.subject, body: object.body }
}

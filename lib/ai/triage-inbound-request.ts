'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  InboundRequestIntent,
  InboundRequestUrgency,
  SuggestedAction,
} from '@/lib/types/database'

// Reuse the same document-understanding model the estimator uses. Zero-config via
// the Vercel AI Gateway (AI_GATEWAY_API_KEY / OIDC) with a zero-config provider.
const TRIAGE_MODEL = 'openai/gpt-5.4-mini'

// Keep token usage bounded: never dump the whole DB into the model.
const MAX_SITE_CANDIDATES = 15
const MAX_BODY_CHARS = 8000

interface SiteRow {
  id: string
  name: string
  address: string | null
  postcode: string | null
  contact_name: string | null
  contact_email: string | null
  reporting_emails: unknown
  client_id: string | null
  status: string | null
}
interface ClientRow {
  id: string
  name: string
  contact_email: string | null
  contact_name: string | null
}

/** Strip HTML to rough plain text for matching / prompting. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase().trim()
}

// Generic mailbox domains that must NOT be used for domain-based site matching
// (otherwise every gmail sender would match every gmail site contact).
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'aol.com', 'btinternet.com',
  'me.com', 'msn.com',
])

/**
 * Score a site against the sender + email text. Higher = more likely.
 * Pure code-side heuristic used only to build a shortlist; the model makes the
 * final decision from that shortlist.
 */
function scoreSite(
  site: SiteRow,
  client: ClientRow | undefined,
  senderEmail: string | null,
  senderDomain: string | null,
  haystack: string,
): number {
  let score = 0
  const senderLc = senderEmail?.toLowerCase().trim() || ''

  // Direct email hits are the strongest signal.
  const siteEmails: string[] = []
  if (site.contact_email) siteEmails.push(site.contact_email.toLowerCase().trim())
  if (Array.isArray(site.reporting_emails)) {
    for (const e of site.reporting_emails) {
      if (typeof e === 'string') siteEmails.push(e.toLowerCase().trim())
    }
  }
  if (client?.contact_email) siteEmails.push(client.contact_email.toLowerCase().trim())
  if (senderLc && siteEmails.includes(senderLc)) score += 50

  // Non-generic domain match.
  if (senderDomain && !GENERIC_DOMAINS.has(senderDomain)) {
    if (siteEmails.some((e) => emailDomain(e) === senderDomain)) score += 20
  }

  // Name / postcode / address token mentions in the email text.
  const nameTokens = site.name.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)
  for (const tok of nameTokens) {
    if (haystack.includes(tok)) score += 6
  }
  if (site.postcode) {
    const pc = site.postcode.toLowerCase().replace(/\s+/g, '')
    if (pc && haystack.replace(/\s+/g, '').includes(pc)) score += 25
  }
  if (client?.name) {
    const clientTokens = client.name.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)
    for (const tok of clientTokens) {
      if (haystack.includes(tok)) score += 4
    }
  }
  return score
}

const triageSchema = z.object({
  summary: z
    .string()
    .describe('A concise 1-3 sentence summary of what the sender is asking for, in British English.'),
  intent: z
    .enum(['new_call', 'chase_up', 'complaint', 'quote_request', 'send_report', 'general', 'unknown'])
    .describe(
      'new_call = wants a service visit/attendance booked; chase_up = chasing an existing job/visit; complaint = dissatisfaction; quote_request = wants pricing/a quote; send_report = asking for inspection/service/test reports or certificates for a site; general = general enquiry; unknown = cannot tell.',
    ),
  urgency: z
    .enum(['emergency', 'high', 'normal', 'low'])
    .describe('How urgent the request is. Use "emergency" only for genuine safety/fire-risk or "system down" wording.'),
  matched_site_id: z
    .string()
    .nullable()
    .describe('The id of the best-matching site from the candidate list, or null if none clearly fit.'),
  matched_client_id: z
    .string()
    .nullable()
    .describe('The id of the best-matching client from the candidate list, or null.'),
  matched_service_type_id: z
    .string()
    .nullable()
    .describe('The id of the most appropriate reactive service/call type from the allowed list, or null if unclear.'),
  reply_draft: z
    .string()
    .describe(
      'A short, professional British-English acknowledgement reply to the sender confirming we have received the request and will action it. Do not promise specific dates, prices, or facts not stated.',
    ),
  reasoning: z
    .string()
    .describe('One short sentence explaining the site/service match (or why no match was possible).'),
})

export interface TriageResult {
  ok: boolean
  error?: string
}

/**
 * Optional context when a request is raised from a specific entity (a quote, job,
 * site, call or defect). Any id provided here is treated as authoritative: the
 * matched site/client/service is LOCKED to these values rather than left to the
 * model, which still handles the summary/intent/urgency/reply.
 */
export interface TriageAnchor {
  siteId?: string | null
  clientId?: string | null
  serviceTypeId?: string | null
  /** Short human label describing what the request is about, fed to the model. */
  contextLabel?: string | null
}

/**
 * AI-triage a stored inbound request: match it to an existing site/client/service
 * type, classify intent + urgency, and draft an acknowledgement reply. Writes the
 * results back onto the row and flips status to 'triaged'. Safe to call from the
 * inbound webhook (no user session) or from a server action — it uses the
 * service-role client and only touches the single request row + read-only lookups.
 */
export async function triageInboundRequest(
  requestId: string,
  anchor?: TriageAnchor,
): Promise<TriageResult> {
  const supabase = createAdminClient()

  const { data: reqRow, error: reqErr } = await supabase
    .from('inbound_requests')
    .select('id, from_email, from_name, subject, body_text, body_html')
    .eq('id', requestId)
    .single()

  if (reqErr || !reqRow) {
    return { ok: false, error: 'Request not found.' }
  }

  const req = reqRow as {
    id: string
    from_email: string | null
    from_name: string | null
    subject: string | null
    body_text: string | null
    body_html: string | null
  }

  try {
    const bodyText =
      (req.body_text?.trim() ||
        (req.body_html ? htmlToText(req.body_html) : '') ||
        '').slice(0, MAX_BODY_CHARS)

    const senderEmail = req.from_email
    const senderDomain = emailDomain(senderEmail)
    const haystack = `${req.subject ?? ''}\n${bodyText}`.toLowerCase()

    // Lookups (service-role read).
    const [{ data: siteRows }, { data: clientRows }, { data: serviceRows }] = await Promise.all([
      supabase
        .from('sites')
        .select('id, name, address, postcode, contact_name, contact_email, reporting_emails, client_id, status')
        .neq('status', 'dead'),
      supabase.from('clients').select('id, name, contact_email, contact_name'),
      supabase
        .from('service_types')
        .select('id, name, is_emergency, default_kpi_hours, system_type_id, status')
        .neq('status', 'dead')
        .eq('is_recurring', false)
        .order('name'),
    ])

    const sites = (siteRows as SiteRow[]) ?? []
    const clients = (clientRows as ClientRow[]) ?? []
    const services =
      (serviceRows as {
        id: string
        name: string
        is_emergency: boolean
        default_kpi_hours: number | null
        system_type_id: string | null
      }[]) ?? []

    const clientById = new Map(clients.map((c) => [c.id, c]))

    // Build the site shortlist by score, always keeping a few even if unscored so
    // the model has options for a brand-new/unknown sender.
    const scored = sites
      .map((s) => ({
        site: s,
        score: scoreSite(s, s.client_id ? clientById.get(s.client_id) : undefined, senderEmail, senderDomain, haystack),
      }))
      .sort((a, b) => b.score - a.score)

    const shortlist = scored.slice(0, MAX_SITE_CANDIDATES)

    const allowedSiteIds = new Set(shortlist.map((s) => s.site.id))
    const allowedClientIds = new Set<string>()
    for (const { site } of shortlist) if (site.client_id) allowedClientIds.add(site.client_id)
    for (const c of clients) allowedClientIds.add(c.id) // clients are few; allow any
    const allowedServiceIds = new Set(services.map((s) => s.id))
    const serviceById = new Map(services.map((s) => [s.id, s]))

    const siteList = shortlist.length
      ? shortlist
          .map(({ site }) => {
            const client = site.client_id ? clientById.get(site.client_id) : undefined
            return `- ${site.id} :: ${site.name}${site.postcode ? `, ${site.postcode}` : ''}${
              client ? ` (client: ${client.name} [${client.id}])` : ''
            }`
          })
          .join('\n')
      : '(no site candidates)'

    const serviceList = services.length
      ? services
          .map((s) => `- ${s.id} :: ${s.name}${s.is_emergency ? ' (EMERGENCY type)' : ''}`)
          .join('\n')
      : '(none configured)'

    const companyName = process.env.COMPANY_NAME || 'Pyrocel'

    // When raised from an entity, tell the model what the request is already known
    // to be about so its summary/intent reflect that context. The matched ids are
    // still locked to the anchor after generation regardless of what it returns.
    const anchorLines =
      anchor && (anchor.siteId || anchor.clientId || anchor.contextLabel)
        ? [
            '',
            'IMPORTANT CONTEXT: This request was raised from within an existing record, so the site/client are already known:',
            anchor.contextLabel ? `- Raised from: ${anchor.contextLabel}` : null,
            anchor.siteId ? `- Known SITE id: ${anchor.siteId}` : null,
            anchor.clientId ? `- Known CLIENT id: ${anchor.clientId}` : null,
            'Treat that site/client as correct. Focus on summarising the request, classifying intent and urgency, and drafting the reply.',
          ].filter(Boolean)
        : []

    const systemPrompt = [
      `You are an operations coordinator at ${companyName}, a UK fire and security systems company.`,
      'Office staff forward you client emails (service requests, chase-ups, complaints, quote enquiries, report/certificate requests).',
      'Read the email and its sender, then: (1) summarise it, (2) classify intent and urgency, (3) match it to an existing SITE and CLIENT from the candidate list, (4) choose the most appropriate reactive call type from the allowed list (only when intent is new_call/complaint/general), and (5) draft a brief acknowledgement reply.',
      'Use British English. Never invent facts, dates, prices, or reference numbers. If you cannot confidently match a site/client/service, return null for that field rather than guessing.',
      'IMPORTANT: If the email is asking for inspection reports, service reports, test certificates, or compliance documents for a site, classify intent as "send_report". Do NOT classify these as new_call.',
      'Only ever return ids that appear in the lists below.',
      ...anchorLines,
      '',
      'Candidate SITES (id :: name, postcode (client)):',
      siteList,
      '',
      'Allowed reactive CALL TYPES (id :: name):',
      serviceList,
    ].join('\n')

    const userContent = [
      `From: ${req.from_name ? `${req.from_name} ` : ''}<${senderEmail ?? 'unknown'}>`,
      `Subject: ${req.subject ?? '(no subject)'}`,
      '',
      bodyText || '(no body)',
    ].join('\n')

    const { object } = await generateObject({
      model: TRIAGE_MODEL,
      schema: triageSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    // Validate model-chosen ids against the real vocabulary. When an anchor is
    // supplied, its ids win outright (the entity is authoritative).
    const matchedSiteId =
      anchor?.siteId ??
      (object.matched_site_id && allowedSiteIds.has(object.matched_site_id) ? object.matched_site_id : null)
    const matchedClientId =
      anchor?.clientId ??
      (object.matched_client_id && allowedClientIds.has(object.matched_client_id)
        ? object.matched_client_id
        : null)
    const matchedServiceTypeId =
      anchor?.serviceTypeId ??
      (object.matched_service_type_id && allowedServiceIds.has(object.matched_service_type_id)
        ? object.matched_service_type_id
        : null)
    // System follows from the chosen service type (kept consistent with bookCall).
    const matchedSystemTypeId = matchedServiceTypeId
      ? serviceById.get(matchedServiceTypeId)?.system_type_id ?? null
      : null

    // If no site matched but the chosen client owns exactly one shortlisted site,
    // fall back to it. Otherwise leave the client from the model (validated).
    const derivedClientId =
      matchedClientId ??
      (matchedSiteId ? sites.find((s) => s.id === matchedSiteId)?.client_id ?? null : null)

    // Build suggested actions from the classification.
    const intent = object.intent as InboundRequestIntent
    const urgency = object.urgency as InboundRequestUrgency
    const suggested: SuggestedAction[] = []
    if (intent === 'send_report') {
      suggested.push({
        kind: 'send_report',
        label: 'Send most recent inspection reports for this site',
        payload: {
          siteId: matchedSiteId,
          clientId: derivedClientId,
        },
      })
    } else if (intent === 'new_call' || intent === 'complaint' || intent === 'general') {
      const svc = matchedServiceTypeId ? serviceById.get(matchedServiceTypeId) : undefined
      suggested.push({
        kind: 'create_call',
        label: svc ? `Create call · ${svc.name}` : 'Create call',
        payload: {
          siteId: matchedSiteId,
          clientId: derivedClientId,
          serviceTypeId: matchedServiceTypeId,
          systemTypeId: matchedSystemTypeId,
          urgency,
        },
      })
    }
    if (intent === 'chase_up') {
      suggested.push({ kind: 'chase_up', label: 'Log chase-up', payload: { siteId: matchedSiteId } })
    }
    if (object.reply_draft) {
      suggested.push({ kind: 'reply', label: 'Send acknowledgement', payload: {} })
    }
    suggested.push({ kind: 'dismiss', label: 'Dismiss', payload: {} })

    const { error: updErr } = await supabase
      .from('inbound_requests')
      .update({
        status: 'triaged',
        ai_summary: object.summary,
        ai_intent: intent,
        ai_urgency: urgency,
        ai_reply_draft: object.reply_draft,
        ai_confidence: anchor?.siteId
          ? 1
          : matchedSiteId
            ? (scored[0]?.score ?? 0) >= 40
              ? 0.9
              : 0.6
            : 0.3,
        matched_site_id: matchedSiteId,
        matched_client_id: derivedClientId,
        matched_service_type_id: matchedServiceTypeId,
        matched_system_type_id: matchedSystemTypeId,
        suggested_actions: suggested,
        ai_raw: object,
        triaged_at: new Date().toISOString(),
        triage_error: null,
      })
      .eq('id', requestId)

    if (updErr) {
      console.log('[v0] triageInboundRequest update failed:', updErr.message)
      return { ok: false, error: 'Failed to save triage result.' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[v0] triageInboundRequest failed:', err)
    await supabase
      .from('inbound_requests')
      .update({ triage_error: (err as Error).message?.slice(0, 500) ?? 'Triage failed.' })
      .eq('id', requestId)
    return { ok: false, error: 'Could not triage the request.' }
  }
}

'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const TRIAGE_MODEL = 'openai/gpt-5.4-mini'

const MAX_BODY_CHARS = 4000

/**
 * The structured plan the AI returns: which action to take and with what
 * parameters. Kept deliberately narrow — only values we can directly execute.
 */
const executionSchema = z.object({
  action: z
    .enum(['create_call', 'send_report', 'no_action'])
    .describe(
      'create_call = book a reactive call in the system; send_report = navigate to the site reports page to send documents; no_action = the instruction cannot be fulfilled automatically.',
    ),
  reasoning: z
    .string()
    .describe('One sentence explaining the decision.'),
  // create_call params:
  service_type_id: z
    .string()
    .nullable()
    .describe('Id of the reactive service/call type to use. Must come from the allowed list. Null if action is not create_call.'),
  system_type_id: z
    .string()
    .nullable()
    .describe('Id of the system type. Null if not applicable or not create_call.'),
  scheduled_date: z
    .string()
    .nullable()
    .describe('yyyy-MM-dd date for the call. Infer from the instruction (e.g. "next Monday", "tomorrow"). Use today if unspecified. Null if action is not create_call.'),
  urgency: z
    .enum(['emergency', 'high', 'normal', 'low'])
    .describe('Urgency level for the call. Default normal.'),
  notes: z
    .string()
    .nullable()
    .describe('Notes for the engineer. Should incorporate the original request context and any specifics from the instruction. Null if action is not create_call.'),
})

export interface ExecuteInstructionResult {
  ok: boolean
  error?: string
  action?: 'create_call' | 'send_report' | 'no_action'
  taskId?: string
  navigateTo?: string
  summary?: string
}

interface ServiceTypeRow {
  id: string
  name: string
  is_emergency: boolean
  default_kpi_hours: number | null
  system_type_id: string | null
}

/**
 * Read the request + instruction, use AI to plan the action, then execute it
 * immediately. Returns a structured result the UI can act on (e.g. redirect).
 * Called from the `executeRequestInstruction` server action in inbound-requests.ts.
 */
export async function executeRequestInstructionAI(
  requestId: string,
  instruction: string,
): Promise<ExecuteInstructionResult> {
  const supabase = createAdminClient()

  const { data: reqRow, error: reqErr } = await supabase
    .from('inbound_requests')
    .select(`
      id, from_email, from_name, subject, body_text,
      ai_summary, ai_intent, ai_urgency,
      matched_site_id, matched_client_id,
      matched_service_type_id, matched_system_type_id
    `)
    .eq('id', requestId)
    .maybeSingle()

  if (reqErr || !reqRow) return { ok: false, error: 'Request not found.' }

  const req = reqRow as {
    id: string
    from_email: string | null
    from_name: string | null
    subject: string | null
    body_text: string | null
    ai_summary: string | null
    ai_intent: string | null
    ai_urgency: string | null
    matched_site_id: string | null
    matched_client_id: string | null
    matched_service_type_id: string | null
    matched_system_type_id: string | null
  }

  if (!req.matched_site_id) {
    return { ok: false, error: 'No site matched to this request. Update the match before instructing AI.' }
  }

  // Load reactive service types as the allowed vocabulary.
  const { data: serviceRows } = await supabase
    .from('service_types')
    .select('id, name, is_emergency, default_kpi_hours, system_type_id, status')
    .neq('status', 'dead')
    .eq('is_recurring', false)
    .order('name')

  const services = (serviceRows ?? []) as ServiceTypeRow[]
  const serviceById = new Map(services.map((s) => [s.id, s]))

  const serviceList = services.length
    ? services.map((s) => `- ${s.id} :: ${s.name}${s.is_emergency ? ' (EMERGENCY)' : ''}`).join('\n')
    : '(none)'

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const systemPrompt = [
    'You are an operations coordinator AI for a UK fire and security systems company.',
    `Today is ${todayStr} (${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).`,
    'A staff member has given you an instruction about how to handle an inbound client request.',
    'Based on the original request and the instruction, decide EXACTLY what to do in the system.',
    'If asked to book/create/schedule a call, use action=create_call with the most appropriate service type from the list.',
    'If asked to send reports/certificates, use action=send_report.',
    'If the instruction is ambiguous or cannot be executed automatically, use action=no_action with a helpful reasoning.',
    'IMPORTANT: scheduled_date must be a real yyyy-MM-dd date. Resolve relative expressions like "next Monday", "tomorrow", "end of week" against today.',
    '',
    'Allowed reactive CALL TYPES:',
    serviceList,
  ].join('\n')

  const bodyText = (req.body_text ?? '').slice(0, MAX_BODY_CHARS)

  const userContent = [
    `ORIGINAL REQUEST:`,
    `From: ${req.from_name || req.from_email || 'Unknown'}`,
    `Subject: ${req.subject ?? '(no subject)'}`,
    req.ai_summary ? `AI summary: ${req.ai_summary}` : '',
    `Body: ${bodyText}`,
    '',
    `ALREADY MATCHED TO:`,
    `- Site ID: ${req.matched_site_id}`,
    req.matched_service_type_id
      ? `- Suggested call type: ${serviceById.get(req.matched_service_type_id)?.name ?? req.matched_service_type_id}`
      : '',
    '',
    `STAFF INSTRUCTION: ${instruction}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: TRIAGE_MODEL,
      schema: executionSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    if (object.action === 'no_action') {
      return { ok: false, error: object.reasoning, action: 'no_action' }
    }

    if (object.action === 'send_report') {
      return {
        ok: true,
        action: 'send_report',
        navigateTo: `/dashboard/sites/${req.matched_site_id}?tab=reports`,
        summary: object.reasoning,
      }
    }

    // create_call: validate & execute
    const serviceTypeId = object.service_type_id ?? req.matched_service_type_id
    if (!serviceTypeId) {
      return { ok: false, error: 'Could not determine a call type. Please specify one and try again.' }
    }

    const svc = serviceById.get(serviceTypeId)
    if (!svc) {
      return { ok: false, error: `Service type not found: ${serviceTypeId}` }
    }

    // Resolve date — fall back to today if AI returned null or an invalid date.
    const rawDate = object.scheduled_date ?? todayStr
    const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayStr

    return {
      ok: true,
      action: 'create_call',
      summary: object.reasoning,
      // Return the parameters so the server action can call bookCall directly.
      ...({
        _callParams: {
          siteId: req.matched_site_id,
          serviceTypeId,
          systemTypeId: object.system_type_id ?? svc.system_type_id ?? req.matched_system_type_id ?? null,
          clientId: req.matched_client_id ?? null,
          scheduledDate,
          respondByHours: svc.default_kpi_hours ?? null,
          notes: object.notes ?? req.ai_summary ?? null,
          urgency: object.urgency,
        },
      } as any),
    }
  } catch (err) {
    console.error('[v0] executeRequestInstructionAI failed:', err)
    return { ok: false, error: 'AI could not process the instruction. Please try again.' }
  }
}

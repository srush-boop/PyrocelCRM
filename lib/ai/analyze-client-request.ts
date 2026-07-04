'use server'

import { put } from '@vercel/blob'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { WORK_TYPES } from '@/lib/sales'
import { parseDocumentFile } from '@/lib/ai/parse-document'

// Document understanding model. Reads PDFs directly (as file parts), including
// tables and multi-column specs. Uses the Vercel AI Gateway (zero-config via
// AI_GATEWAY_API_KEY / OIDC) with a zero-config provider (OpenAI).
const ANALYZE_MODEL = 'openai/gpt-5.4-mini'

const REQ_STATUSES = ['included', 'partial', 'excluded', 'query'] as const

const proposalSchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise 2-4 sentence executive summary of what the client is asking for, in British English.',
    ),
  requirements: z
    .array(
      z.object({
        category: z
          .string()
          .nullable()
          .describe('Short grouping label, e.g. "Detection", "Commissioning", "Compliance".'),
        requirement: z
          .string()
          .describe("A single, discrete client requirement, quoted concisely in the client's terms."),
        our_response: z
          .string()
          .describe(
            'A short professional response confirming how Pyrocel meets this requirement, or noting a clarification needed. Never invent prices.',
          ),
        status: z
          .enum(REQ_STATUSES)
          .describe(
            'included = fully met; partial = partially met/with caveats; excluded = not covered; query = needs clarification from the client.',
          ),
      }),
    )
    .describe('Every discrete requirement found in the document. Do not merge unrelated points.'),
  suggestedSystems: z
    .array(
      z.object({
        system_type_id: z
          .string()
          .nullable()
          .describe('The id chosen from the allowed system types list, or null if none fit.'),
        system_name: z.string().describe('A clear name for this system/scope.'),
        work_type: z
          .string()
          .describe('One of the allowed work-type codes.'),
        specification: z
          .string()
          .describe('A scope-of-works description for this system, derived from the requirements.'),
      }),
    )
    .describe('Suggested systems to add to the quote. Only propose what the document supports.'),
  recommendedSections: z
    .array(z.string())
    .describe(
      'The section headings that a professional proposal for this job should include, in order (e.g. "Introduction", "Scope of Works", "Compliance & Standards", "Exclusions", "Commercials"). Decide based on the nature of the request.',
    ),
  proposalNotes: z
    .string()
    .nullable()
    .describe('Optional short narrative (a few sentences) to seed the quote notes/cover text.'),
})

export type ClientRequestProposal = z.infer<typeof proposalSchema>

export interface AnalyzeResult {
  ok: boolean
  proposal?: ClientRequestProposal
  source?: {
    sourceType: 'paste' | 'file'
    fileName: string | null
    pathname: string | null
    mimeType: string | null
    rawText: string | null
  }
  error?: string
}

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

export async function analyzeClientRequest(formData: FormData): Promise<AnalyzeResult> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const pastedText = (formData.get('text') as string | null)?.trim() || ''
  const file = formData.get('file') as File | null
  const instructions = (formData.get('instructions') as string | null)?.trim() || ''

  if (!file && !pastedText) {
    return { ok: false, error: 'Paste the client request or upload a document.' }
  }

  // Allowed vocabulary, loaded server-side so suggestions map to real records.
  const { data: systemTypeRows } = await supabase
    .from('system_types')
    .select('id, name, code')
    .eq('active', true)
    .order('position')

  const systemTypes = (systemTypeRows as { id: string; name: string; code: string | null }[]) ?? []
  const allowedTypeIds = new Set(systemTypes.map((t) => t.id))
  const allowedWorkTypes = new Set(WORK_TYPES.map((w) => w.code))

  const systemTypeList = systemTypes.map((t) => `- ${t.id} :: ${t.name}${t.code ? ` (${t.code})` : ''}`).join('\n')
  const workTypeList = WORK_TYPES.map((w) => `- ${w.code} :: ${w.label} — ${w.description}`).join('\n')

  const systemPrompt = [
    'You are a senior estimator at Pyrocel, a UK fire and security systems company.',
    'You read a client request (an email or a consultant/engineer written system specification) and prepare a structured basis for a professional quotation.',
    'Use British English. Never invent prices, product codes, quantities, dates, or facts not present in the document. If something is unclear, mark the requirement status as "query".',
    'Break the request into discrete requirements and, for each, write a concise professional response confirming how we meet it (or noting the clarification needed).',
    'Only suggest systems and sections that the document actually supports. Choose which proposal sections to include based on how a professional specification-and-proposal should be presented for this particular job — do not include boilerplate sections that add no value.',
    '',
    'Allowed system_type_id values (choose the best fit or null):',
    systemTypeList || '(none configured)',
    '',
    'Allowed work_type codes:',
    workTypeList,
  ].join('\n')

  try {
    // Parse the input into either text or a PDF file part.
    let userContent: string
    let filePart: { type: 'file'; data: Uint8Array; mediaType: 'application/pdf' } | null = null
    let rawText: string | null = null
    let sourceType: 'paste' | 'file' = 'paste'
    let fileName: string | null = null
    let pathname: string | null = null
    let mimeType: string | null = null

    if (file) {
      sourceType = 'file'
      fileName = file.name
      mimeType = file.type || null
      const parsed = await parseDocumentFile(file)
      if (!parsed.ok || !parsed.doc) return { ok: false, error: parsed.error ?? 'Could not read the file.' }

      // Store the original privately so it can be attached to the quote record.
      try {
        const blob = await put(`quote-requests/${file.name}`, file, {
          access: 'private',
          addRandomSuffix: true,
        })
        pathname = blob.pathname
      } catch (e) {
        console.error('[v0] quote-request blob upload failed (continuing without storing):', e)
      }

      if (parsed.doc.kind === 'pdf') {
        filePart = { type: 'file', data: parsed.doc.data, mediaType: parsed.doc.mediaType }
        userContent = 'Analyse the attached client request document.'
      } else {
        rawText = parsed.doc.text
        userContent = `Analyse this client request document:\n\n${parsed.doc.text}`
      }
    } else {
      rawText = pastedText
      userContent = `Analyse this client request:\n\n${pastedText}`
    }

    if (instructions) {
      userContent += `\n\nAdditional instructions from the estimator: ${instructions}`
    }

    const { object } = await generateObject({
      model: ANALYZE_MODEL,
      schema: proposalSchema,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: filePart
            ? [{ type: 'text', text: userContent }, filePart]
            : [{ type: 'text', text: userContent }],
        },
      ],
    })

    // Validate model-chosen ids/codes against the real vocabulary.
    const proposal: ClientRequestProposal = {
      ...object,
      suggestedSystems: object.suggestedSystems.map((s) => ({
        ...s,
        system_type_id: s.system_type_id && allowedTypeIds.has(s.system_type_id) ? s.system_type_id : null,
        work_type: allowedWorkTypes.has(s.work_type) ? s.work_type : 'SIC',
      })),
    }

    return {
      ok: true,
      proposal,
      source: { sourceType, fileName, pathname, mimeType, rawText },
    }
  } catch (err) {
    console.error('[v0] analyzeClientRequest failed:', err)
    return { ok: false, error: 'Could not analyse the document. Please try again.' }
  }
}

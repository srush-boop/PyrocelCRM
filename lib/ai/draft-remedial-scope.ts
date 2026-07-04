'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DRAFT_MODEL } from '@/lib/ai/shared'
import type { FailedChecklistItem } from '@/lib/defects'

// Drafts a "description of works required" for a remedial quote raised from a
// defect. Given the failed checklist items and service context, the model
// produces a professional scope of works describing the remedial action needed
// to bring the system back into compliance — not just a restatement of faults.

const scopeSchema = z.object({
  text: z
    .string()
    .describe(
      'The description of remedial works required, in British English, ready to paste into a quote specification. Plain text only — no markdown, no headings. A short intro sentence followed by a numbered list of the works required.',
    ),
})

export interface DraftRemedialScopeInput {
  failedItems: FailedChecklistItem[]
  serviceType?: string | null
  systemType?: string | null
  siteName?: string | null
  reference?: string | null
  engineerNotes?: string | null
}

export interface DraftRemedialScopeResult {
  ok: boolean
  text?: string
  error?: string
}

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { ok: false as const, error: 'Not authorised.' }
  }
  return { ok: true as const }
}

const SYSTEM_PROMPT = [
  'You are a UK fire & life-safety estimator at Pyrocel preparing the scope of works for a remedial quotation.',
  'You are given the defects found on a service/inspection report. Write the DESCRIPTION OF WORKS REQUIRED to rectify those defects and return the system to a compliant, operational condition.',
  'Write in British English using precise, industry-standard terminology for the relevant discipline.',
  'Where relevant to the service type, reference the correct British Standard or guidance, e.g.:',
  'fire detection & alarm — BS 5839-1; emergency lighting — BS 5266-1; portable extinguishers — BS 5306-3/-8;',
  'fire/smoke dampers — BS 9999 and BS EN 15650; dry/wet risers — BS 9990; sprinklers — BS EN 12845/BS 9251;',
  'fire doors — BS 8214; means of escape/compartmentation — BS 9999 / Approved Document B.',
  'Describe remedial actions (e.g. replace, repair, re-test, re-commission, re-instate) rather than merely restating the fault.',
  'Be factual and concise. Do not invent quantities, part numbers, prices, or findings not implied by the defects provided.',
  'Do not fabricate specific measurements. Do not include pricing or commercial terms.',
  'Do not use markdown, headings, or bullet symbols — use a short intro sentence then a numbered list (1., 2., 3.).',
].join(' ')

export async function draftRemedialScope(
  input: DraftRemedialScopeInput,
): Promise<DraftRemedialScopeResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!input.failedItems.length) {
    return { ok: false, error: 'No failed items to describe.' }
  }

  const contextHeader = [
    input.serviceType ? `Service: ${input.serviceType}` : null,
    input.systemType ? `System: ${input.systemType}` : null,
    input.siteName ? `Site: ${input.siteName}` : null,
    input.reference ? `Report reference: ${input.reference}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const defectList = input.failedItems
    .map((item, i) => `${i + 1}. ${item.label}${item.notes ? ` — ${item.notes}` : ''}`)
    .join('\n')

  const prompt = [
    contextHeader,
    '',
    'Defects identified on the report:',
    defectList,
    input.engineerNotes?.trim() ? `\nEngineer notes: ${input.engineerNotes}` : null,
    '',
    'Write the description of remedial works required to rectify the above defects.',
    'Begin with one short sentence introducing the remedial works, then a numbered list with one entry per defect describing the specific corrective action and, where relevant, the standard it satisfies.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: scopeSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return { ok: true, text: object.text.trim() }
  } catch (err) {
    console.error('[v0] draftRemedialScope failed:', err)
    return { ok: false, error: 'Could not generate a scope of works.' }
  }
}

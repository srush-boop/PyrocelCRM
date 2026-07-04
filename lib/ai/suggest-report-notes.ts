'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DRAFT_MODEL } from '@/lib/ai/shared'

// Reuses the small, fast gateway model already used elsewhere (RAMS/email).

// Two assist modes an engineer can trigger while completing a service report:
//  - "defect": expand a short observation on a failed checklist item into a
//    precise, technical defect description suitable for a formal report.
//  - "summary": draft an overall engineer's summary from the checklist results
//    and any notes captured so far.
export type ReportNotesMode = 'defect' | 'summary'

const suggestionSchema = z.object({
  text: z
    .string()
    .describe(
      'The finished note in British English, ready to paste into the report. Plain text only, no markdown, no headings, no bullet characters.',
    ),
})

export interface SuggestReportNotesResult {
  ok: boolean
  text?: string
  error?: string
}

interface ChecklistLine {
  label: string
  type: string
  value: boolean | string | number
  passed: boolean | null
  notes?: string
}

export interface SuggestReportNotesInput {
  mode: ReportNotesMode
  serviceType?: string | null
  systemType?: string | null
  visitType?: string | null
  siteName?: string | null
  // For "defect" mode: the specific failed item and the engineer's brief note.
  itemLabel?: string | null
  observation?: string | null
  // For "summary" mode: the full checklist and any overall notes so far.
  checklist?: ChecklistLine[]
  existingNotes?: string | null
}

async function requireEngineer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null, error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office', 'engineer'].includes(role)) {
    return { user: null as null, error: 'Not authorised.' }
  }
  return { user, error: null as null }
}

// System prompt establishing the technical, standards-aware voice. The model is
// told to select the standards relevant to the service type rather than listing
// everything, and never to invent findings the engineer did not record.
const SYSTEM_PROMPT = [
  'You are a UK fire & life-safety service engineer at Pyrocel writing up a service/inspection report.',
  'Write in British English using precise, industry-standard terminology for the relevant discipline.',
  'Where relevant to the service type, reference the correct British Standard or guidance, e.g.:',
  'fire detection & alarm — BS 5839-1; emergency lighting — BS 5266-1; portable extinguishers — BS 5306-3/-8;',
  'fire/smoke dampers — BS 9999 and BS EN 15650; dry/wet risers — BS 9990; sprinklers — BS EN 12845/BS 9251;',
  'fire doors — BS 8214; means of escape/compartmentation — BS 9999 / Approved Document B.',
  'Use correct component and defect terminology (e.g. call points, detectors, luminaires, batteries, actuators,',
  'fusible links, drop tests, discharge tests, duration tests, remedial C1/C2 classifications where appropriate).',
  'Be factual and concise. Never invent findings, readings, quantities, or actions the engineer did not provide.',
  'Do not fabricate specific measurements. If a value is unknown, describe the finding qualitatively.',
  'Do not use markdown, headings, or bullet symbols — plain prose only.',
].join(' ')

function describeChecklist(checklist: ChecklistLine[]): string {
  return checklist
    .map((c) => {
      const result =
        c.type === 'pass_fail'
          ? c.passed === true
            ? 'PASS'
            : c.passed === false
              ? 'FAIL'
              : 'not assessed'
          : String(c.value)
      const note = c.notes ? ` — note: ${c.notes}` : ''
      return `- ${c.label}: ${result}${note}`
    })
    .join('\n')
}

export async function suggestReportNotes(
  input: SuggestReportNotesInput,
): Promise<SuggestReportNotesResult> {
  const { user, error } = await requireEngineer()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const contextHeader = [
    input.serviceType ? `Service: ${input.serviceType}` : null,
    input.systemType ? `System: ${input.systemType}` : null,
    input.visitType ? `Visit type: ${input.visitType}` : null,
    input.siteName ? `Site: ${input.siteName}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  let prompt: string
  if (input.mode === 'defect') {
    if (!input.observation?.trim()) {
      return {
        ok: false,
        error: 'Add a short note about the fault first so the assistant can expand it.',
      }
    }
    prompt = [
      contextHeader,
      input.itemLabel ? `Failed inspection item: ${input.itemLabel}` : null,
      `Engineer's brief observation: ${input.observation}`,
      '',
      'Write a concise, technical defect description (2-4 sentences) for this failed item.',
      'State the fault, its likely cause where evident, the safety/compliance implication with reference to the relevant standard, and the recommended remedial action. Only use information provided.',
    ]
      .filter(Boolean)
      .join('\n')
  } else {
    const checklist = input.checklist?.length
      ? describeChecklist(input.checklist)
      : 'No checklist results recorded.'
    prompt = [
      contextHeader,
      '',
      'Checklist results:',
      checklist,
      '',
      input.existingNotes?.trim()
        ? `Engineer's rough notes so far: ${input.existingNotes}`
        : null,
      '',
      'Write a professional engineer summary (3-6 sentences) for the report.',
      'Summarise the overall condition and outcome, highlight any failures or remedial items using correct terminology and the relevant standard, and state the system status on completion (e.g. left operational / left isolated / requires follow-up). Only use information provided.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: suggestionSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return { ok: true, text: object.text.trim() }
  } catch (err) {
    console.error('[v0] suggestReportNotes failed:', err)
    return { ok: false, error: 'Could not generate a suggestion. Please try again.' }
  }
}

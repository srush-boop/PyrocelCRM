'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { DRAFT_MODEL } from '@/lib/ai/shared'

// Turns an engineer's "further works required" write-up (free-text issue + any
// suggested parts) into a concise, technical brief of WHAT IS REQUIRED on the
// return visit. This is stored on the follow-up request and carried onto the
// linked Planned Call's notes so the next attending engineer gets a clear,
// standards-aware summary rather than raw shorthand.

export interface FollowUpPartLine {
  name: string
  quantity: number
}

export interface SummariseFollowUpInput {
  issueSummary: string
  parts?: FollowUpPartLine[]
  siteName?: string | null
  serviceType?: string | null
  systemType?: string | null
  isEmergency?: boolean
  fixAttempt?: number | null
}

export interface SummariseFollowUpResult {
  ok: boolean
  text?: string
  error?: string
}

const schema = z.object({
  summary: z
    .string()
    .describe(
      'A concise brief (2-4 sentences) of the outstanding works required on the return visit, in British English. Plain text only — no markdown, headings, or bullet symbols.',
    ),
})

const SYSTEM_PROMPT = [
  'You are a UK fire & life-safety service engineer at Pyrocel preparing a brief for a colleague who will attend a follow-up call.',
  'Summarise, in clear British English, exactly what outstanding works are required to resolve the issue on the return visit.',
  'Use precise, industry-standard terminology for the relevant discipline and reference the correct British Standard only where clearly relevant.',
  'Be factual and concise. Never invent findings, readings, quantities, causes, or actions that were not provided.',
  'If parts are listed, state what should be fitted/replaced. Do not fabricate part numbers.',
  'Write plain prose only — no markdown, no headings, no bullet symbols.',
].join(' ')

/**
 * Best-effort AI brief of the outstanding works. Callers should treat a failure
 * as non-fatal and fall back to the raw issue text.
 */
export async function summariseFollowUp(
  input: SummariseFollowUpInput,
): Promise<SummariseFollowUpResult> {
  const issue = input.issueSummary?.trim()
  if (!issue) return { ok: false, error: 'No issue text to summarise.' }

  const context = [
    input.siteName ? `Site: ${input.siteName}` : null,
    input.systemType ? `System: ${input.systemType}` : null,
    input.serviceType ? `Original call type: ${input.serviceType}` : null,
    input.isEmergency ? 'This follows an emergency call.' : null,
    input.fixAttempt && input.fixAttempt > 1
      ? `This is fix attempt number ${input.fixAttempt}.`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const partsBlock = input.parts?.length
    ? `Suggested parts / materials:\n${input.parts
        .map((p) => `- ${p.name} × ${p.quantity}`)
        .join('\n')}`
    : 'No parts were suggested.'

  const prompt = [
    context,
    '',
    `Engineer's account of the outstanding issue: ${issue}`,
    '',
    partsBlock,
    '',
    'Write the brief of the works required on the return visit. Only use the information provided.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return { ok: true, text: object.summary.trim() }
  } catch (err) {
    console.error('[v0] summariseFollowUp failed:', err)
    return { ok: false, error: 'Could not generate a summary.' }
  }
}

'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DRAFT_MODEL } from '@/lib/ai/shared'
import { HAZARD_CATEGORIES } from '@/lib/rams/risk'

// Reuses the small, fast gateway model already used for RAMS email drafting.

const score = z
  .number()
  .int()
  .min(1)
  .max(5)

const suggestionSchema = z.object({
  scope: z
    .string()
    .describe(
      'A concise 2-4 sentence description of the works for this RAMS (the "Description of Works"), in British English. Empty string if there is not enough information.',
    ),
  methodSteps: z
    .array(z.string())
    .describe(
      'Ordered method statement steps for carrying out the works safely, from setup to completion and handover. Each item is one clear instruction. 6-14 steps typically.',
    ),
  hazards: z
    .array(
      z.object({
        category: z
          .string()
          .describe('The hazard category. Prefer one of the provided categories.'),
        description: z.string().describe('The hazard, e.g. "Working at height from a step ladder".'),
        potential_consequences: z
          .string()
          .describe('The realistic harm if uncontrolled, e.g. "Falls causing serious injury".'),
        likelihood: score.describe('Initial (pre-control) likelihood 1-5.'),
        severity: score.describe('Initial (pre-control) severity 1-5.'),
        residual_likelihood: score.describe(
          'Residual (post-control) likelihood 1-5. Must be <= initial likelihood.',
        ),
        residual_severity: score.describe('Residual (post-control) severity 1-5.'),
        controls: z
          .array(z.string())
          .describe('The control measures that reduce this risk to the residual level.'),
      }),
    )
    .describe('The hazards relevant to these works, each with realistic risk scores and controls.'),
  siteConsiderations: z
    .string()
    .describe(
      'Site-specific considerations (access, occupancy, working hours, isolation, permits, etc.). Empty string if not enough information.',
    ),
})

export type RamsSuggestion = z.infer<typeof suggestionSchema>

export interface SuggestRamsResult {
  ok: boolean
  suggestion?: RamsSuggestion
  error?: string
}

async function requireStaff() {
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
  if (!role || !['admin', 'office'].includes(role)) {
    return { user: null as null, error: 'Not authorised.' }
  }
  return { user, error: null as null }
}

// Generates draft RAMS content (scope, method steps, hazards + controls, and
// site considerations) from the job context the author has entered so far.
// The author reviews and applies the parts they want in the wizard — nothing is
// saved directly. British English; the model is told not to invent site facts.
export async function suggestRamsContent(input: {
  title: string
  systemType?: string | null
  workType?: string | null
  workDescription?: string | null
  workLocation?: string | null
  brief?: string | null
}): Promise<SuggestRamsResult> {
  const { user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  if (!input.title?.trim() && !input.workDescription?.trim() && !input.brief?.trim()) {
    return {
      ok: false,
      error: 'Add a title or work description first so the assistant has something to work with.',
    }
  }

  const context = [
    input.title ? `RAMS title: ${input.title}` : null,
    input.systemType ? `System type: ${input.systemType}` : null,
    input.workType ? `Work type: ${input.workType}` : null,
    input.workLocation ? `Work location: ${input.workLocation}` : null,
    input.workDescription ? `Work description: ${input.workDescription}` : null,
    input.brief ? `Additional brief from the author: ${input.brief}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: suggestionSchema,
      system: [
        'You are a UK health & safety advisor at Pyrocel, a fire and security systems company.',
        'You help engineers author a Risk Assessment & Method Statement (RAMS).',
        'Use British English and reference UK practice (HSE guidance, CDM where relevant).',
        'Produce realistic, proportionate hazards and controls for the described works — do not pad with irrelevant generic hazards.',
        'Residual scores must reflect the stated controls and never exceed the initial scores.',
        'Never invent site-specific facts (addresses, names, permit numbers). If site detail is unknown, keep site considerations general and note what must be confirmed on site.',
        `Prefer these hazard categories where they fit: ${HAZARD_CATEGORIES.join(', ')}.`,
      ].join(' '),
      prompt: [
        'Draft RAMS content for the following works. Return scope, ordered method steps, relevant hazards with initial/residual risk scores and control measures, and site-specific considerations.',
        '',
        context,
      ].join('\n'),
    })

    // Clamp residual scores so they never exceed the initial scores, regardless
    // of what the model returns.
    const suggestion: RamsSuggestion = {
      ...object,
      hazards: object.hazards.map((h) => ({
        ...h,
        residual_likelihood: Math.min(h.residual_likelihood, h.likelihood),
        residual_severity: Math.min(h.residual_severity, h.severity),
      })),
    }

    return { ok: true, suggestion }
  } catch (err) {
    console.error('[v0] suggestRamsContent failed:', err)
    return { ok: false, error: 'Could not generate suggestions. Please try again.' }
  }
}

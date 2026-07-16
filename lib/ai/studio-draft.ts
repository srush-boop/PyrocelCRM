import 'server-only'
import { generateObject } from 'ai'
import { z } from 'zod'
import { DRAFT_MODEL } from '@/lib/ai/shared'
import { fireAlarmKbText } from '@/lib/ai/fire-alarm-spec-kb'

/**
 * Quote Studio AI: read a client brief and draft the understanding, the
 * requirements, and a FIRST-PASS device schedule for a designer to confirm.
 * Also compiles the narrative BS 5839-1 specification clauses from the
 * confirmed data. Everything the model returns is a starting point — the
 * designer edits and signs off before anything is priced or issued (BAFE gate).
 */

const MAX_BRIEF_CHARS = 16_000

function clamp(text: string, max = MAX_BRIEF_CHARS): string {
  const t = (text ?? '').trim()
  return t.length > max ? t.slice(0, max) : t
}

// ---- Draft from brief -------------------------------------------------

export interface StudioUnderstanding {
  clientName: string
  siteName: string
  siteAddress: string
  buildingType: string
  standard: string
  category: string
  workType: string
  confidence: number
  summary: string
}

export interface StudioRequirement {
  text: string
  system: string
  priority: 'must' | 'should' | 'note'
}

export interface StudioDeviceSuggestion {
  device_key: string
  zone: string
  quantity: number
  rationale: string
}

export interface StudioDraft {
  understanding: StudioUnderstanding
  requirements: StudioRequirement[]
  devices: StudioDeviceSuggestion[]
}

export interface StudioDraftResult {
  ok: boolean
  draft?: StudioDraft
  error?: string
}

const draftSchema = z.object({
  understanding: z.object({
    clientName: z.string().describe('The client / organisation name. Best effort from the brief; empty string if unknown.'),
    siteName: z.string().describe('The site / premises name. Empty string if unknown.'),
    siteAddress: z.string().describe('The site address. Empty string if unknown.'),
    buildingType: z.string().describe('The building / occupancy type, e.g. "Residential care home (sleeping risk)".'),
    standard: z.string().describe('The governing standard, e.g. "BS 5839-1:2025".'),
    category: z.string().describe('The recommended system category with a short reason, e.g. "Category L1 (life protection)".'),
    workType: z.string().describe('A short description of the work, e.g. "System takeover / upgrade + extension".'),
    confidence: z.number().min(0).max(100).describe('Your confidence in this understanding, 0–100.'),
    summary: z.string().describe('A concise paragraph summarising the job and why the category was chosen. British English.'),
  }),
  requirements: z
    .array(
      z.object({
        text: z.string().describe('A single clear requirement drawn from the brief.'),
        system: z.string().describe('The system/area it maps to, e.g. "Fire Alarm", "Compliance", "Commercial".'),
        priority: z.enum(['must', 'should', 'note']),
      }),
    )
    .describe('The requirements extracted from the brief.'),
  devices: z
    .array(
      z.object({
        device_key: z.string().describe('One of the ALLOWED DEVICE KEYS provided in the prompt. Use the key exactly.'),
        zone: z.string().describe('A short zone label, e.g. "Z1 Ground floor". Use "Z1" if zoning is unclear.'),
        quantity: z.number().int().min(0).describe('Best-estimate device quantity. This is a starting point only.'),
        rationale: z.string().describe('One short line explaining the estimate. Flag clearly when it is a rough guess.'),
      }),
    )
    .describe('A FIRST-PASS device schedule. Only use the allowed device keys. Be conservative and flag uncertainty.'),
})

const DRAFT_SYSTEM = [
  'You are a UK fire & life-safety estimator at Pyrocel preparing a fire detection & alarm quotation from a client brief.',
  'Read the brief and return: (1) your understanding of the job, (2) the requirements, and (3) a FIRST-PASS device schedule.',
  'Ground everything in the provided KNOWLEDGE BASE (BAFE SP203-1 / BS 5839-1:2025). Write in British English.',
  'For the device schedule you MUST only use the ALLOWED DEVICE KEYS given. Device counts are rough starting estimates for a designer to confirm against an approved layout drawing — never present them as final. Be conservative and state your assumptions in each rationale.',
  'If the brief lacks the detail to size a device type, return a small conservative number (or 0) and say so in the rationale. Do not invent site-specific certainty you do not have.',
].join(' ')

export async function draftFromBrief(
  brief: string,
  allowedDeviceKeys: { key: string; label: string }[],
): Promise<StudioDraftResult> {
  const text = clamp(brief)
  if (!text) return { ok: false, error: 'Please paste or type the client brief first.' }

  const keyList = allowedDeviceKeys.map((d) => `- ${d.key} (${d.label})`).join('\n')
  const prompt = [
    'KNOWLEDGE BASE:',
    fireAlarmKbText(),
    '',
    'ALLOWED DEVICE KEYS (use the key exactly, left of the bracket):',
    keyList,
    '',
    'CLIENT BRIEF:',
    text,
    '',
    'Produce your understanding, the requirements, and a first-pass device schedule now.',
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: draftSchema,
      system: DRAFT_SYSTEM,
      prompt,
    })
    const allowed = new Set(allowedDeviceKeys.map((d) => d.key))
    return {
      ok: true,
      draft: {
        understanding: object.understanding,
        requirements: object.requirements,
        // Drop any device the model invented outside the allowed catalogue.
        devices: object.devices.filter((d) => allowed.has(d.device_key)),
      },
    }
  } catch (err) {
    console.error('[v0] draftFromBrief failed:', err)
    return { ok: false, error: 'Could not draft from the brief. Please try again.' }
  }
}

// ---- Compile the narrative specification ------------------------------

export interface StudioSpecSection {
  id: string
  number: string
  title: string
  body: string
  bullets: string[]
}

export interface GenerateSpecSectionsResult {
  ok: boolean
  sections?: StudioSpecSection[]
  error?: string
}

const sectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        number: z.string().describe('The section number, e.g. "1", "2".'),
        title: z.string().describe('The section heading in British English.'),
        body: z.string().describe('The clause prose. No markdown symbols.'),
        bullets: z.array(z.string()).describe('Optional supporting bullet points. Empty array if none.'),
      }),
    )
    .describe('The ordered narrative clauses of the BS 5839-1 design specification.'),
})

const SPEC_SYSTEM = [
  'You are a UK fire & life-safety designer at Pyrocel writing the narrative clauses of a BS 5839-1:2025 / BAFE SP203-1 fire detection & alarm design specification for client approval.',
  'Use the provided KNOWLEDGE BASE for the correct clause structure, standard wording and references. Write in British English.',
  'Produce a complete, ordered set of clauses (purpose & scope, category & rationale, design responsibility & competency, standards, area coverage & detector selection, manual call points, audibility & VADs, zoning & evacuation, cause & effect, control equipment & power supplies, cabling & survivability, false-alarm management, installation/commissioning/handover, recommended maintenance, variations & limitations).',
  'Base the content on the DESIGN CONTEXT provided (understanding + confirmed device counts). Do NOT restate the full numeric schedule, battery calc or equipment table — those are generated separately. Reference that final device counts are confirmed against the approved layout drawing at design freeze.',
  'Do not invent part numbers, prices or findings. Do not use markdown symbols such as #, * or backticks.',
].join(' ')

export async function generateSpecSections(input: {
  understanding: StudioUnderstanding
  zoneCount: number
  deviceCount: number
  designCategory: string
}): Promise<GenerateSpecSectionsResult> {
  const u = input.understanding
  const context = [
    `Client: ${u.clientName || '(unknown)'}`,
    `Site: ${u.siteName || '(unknown)'} — ${u.siteAddress || '(address tbc)'}`,
    `Building type: ${u.buildingType}`,
    `Standard: ${u.standard}`,
    `Design category: ${input.designCategory || u.category}`,
    `Work type: ${u.workType}`,
    `Confirmed field devices: ${input.deviceCount} across ${input.zoneCount} zone(s)`,
    `Summary: ${u.summary}`,
  ].join('\n')

  const prompt = [
    'KNOWLEDGE BASE:',
    fireAlarmKbText(),
    '',
    'DESIGN CONTEXT:',
    context,
    '',
    'Write the ordered specification clauses now.',
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: sectionsSchema,
      system: SPEC_SYSTEM,
      prompt,
    })
    const sections: StudioSpecSection[] = object.sections.map((s, i) => ({
      id: `s${i + 1}`,
      number: s.number || String(i + 1),
      title: s.title,
      body: s.body,
      bullets: s.bullets ?? [],
    }))
    return { ok: true, sections }
  } catch (err) {
    console.error('[v0] generateSpecSections failed:', err)
    return { ok: false, error: 'Could not generate the specification clauses.' }
  }
}

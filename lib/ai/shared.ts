import { z } from 'zod'

// Model used for drafting emails. A small, fast model is plenty for short
// business emails and keeps latency + cost low. Uses the Vercel AI Gateway
// (zero-config via AI_GATEWAY_API_KEY / OIDC), so no provider package is needed.
export const DRAFT_MODEL = 'openai/gpt-5.4-mini'

export type EmailTone = 'professional' | 'friendly' | 'concise' | 'formal'

export const TONE_GUIDANCE: Record<EmailTone, string> = {
  professional: 'Warm but professional. Confident and helpful without being stiff.',
  friendly: 'Friendly and approachable, while still businesslike. Use a personable opening.',
  concise: 'Short and to the point. A couple of sentences maximum. No filler.',
  formal: 'Formal and traditional business English. Polished and reserved.',
}

export const draftSchema = z.object({
  subject: z.string().describe('A clear, specific email subject line. No quotes around it.'),
  body: z
    .string()
    .describe(
      'The plain-text email body. Use real line breaks between paragraphs. Do not include the subject line. Do not use markdown.',
    ),
})

export interface DraftEmailResult {
  ok: boolean
  subject?: string
  body?: string
  error?: string
}

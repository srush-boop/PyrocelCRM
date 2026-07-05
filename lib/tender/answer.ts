import 'server-only'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { retrieveContext, type RetrievedChunk } from './retrieval'
import { DRAFT_MODEL } from '@/lib/ai/shared'
import type { TenderAnswerSource } from './types'

const answerSchema = z.object({
  answer: z
    .string()
    .describe(
      'The tender answer in clear British English. Well-structured, specific, and grounded ONLY in the provided company knowledge. Use short paragraphs. No markdown headings.',
    ),
  recommendedEvidenceTitles: z
    .array(z.string())
    .describe(
      'Titles (verbatim) of any supplied evidence documents that should be attached to support this answer. Empty array if none are relevant.',
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'How well the company knowledge supported a complete answer. Use "low" if key information appears to be missing.',
    ),
})

export interface TenderAnswerResult {
  ok: boolean
  answer?: string
  sources?: TenderAnswerSource[]
  recommendedEvidence?: { id: string; title: string }[]
  confidence?: 'high' | 'medium' | 'low'
  error?: string
}

// Collapse chunk-level hits into unique sources for display under the answer.
function toSources(chunks: RetrievedChunk[]): TenderAnswerSource[] {
  const bysource = new Map<string, TenderAnswerSource>()
  for (const c of chunks) {
    const key = `${c.sourceType}:${c.sourceId}`
    const existing = bysource.get(key)
    if (!existing || c.similarity > existing.similarity) {
      bysource.set(key, {
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        title: c.title,
        similarity: c.similarity,
      })
    }
  }
  return Array.from(bysource.values()).sort((a, b) => b.similarity - a.similarity)
}

export interface AnswerOptions {
  extraInstructions?: string
}

/**
 * Answers a single tender question using RAG: retrieve company knowledge,
 * ground the model on it, and return the answer with its sources and any
 * recommended evidence to attach.
 */
export async function answerTenderQuestion(
  question: string,
  options: AnswerOptions = {},
): Promise<TenderAnswerResult> {
  if (!question.trim()) {
    return { ok: false, error: 'A question is required.' }
  }

  const admin = createAdminClient()

  try {
    const [chunks, settingsRes, evidenceRes] = await Promise.all([
      retrieveContext(question),
      admin.from('tender_settings').select('*').limit(1).maybeSingle(),
      admin.from('tender_evidence').select('id, title, description').limit(50),
    ])

    if (chunks.length === 0) {
      return {
        ok: false,
        error:
          'No company knowledge has been added yet. Add knowledge in the Knowledge Centre so the AI has something to draw on.',
      }
    }

    const settings = settingsRes.data
    const evidence = evidenceRes.data ?? []

    const contextBlock = chunks
      .map(
        (c, i) =>
          `[${i + 1}] (${c.importance}) ${c.title}\n${c.content}`,
      )
      .join('\n\n---\n\n')

    const evidenceBlock = evidence.length
      ? evidence
          .map((e) => `- ${e.title}${e.description ? `: ${e.description}` : ''}`)
          .join('\n')
      : 'None available.'

    const tone = settings?.company_tone ?? 'professional'

    const system = [
      'You are a bid-writing assistant for a UK company completing formal tender and PQQ submissions.',
      'Write accurate, compelling answers grounded ONLY in the supplied company knowledge.',
      'Never invent facts, figures, accreditations, or client names. If the knowledge does not cover something, say what is missing rather than guessing.',
      `Tone: ${tone}.`,
      settings?.default_instructions?.trim()
        ? `Company instructions: ${settings.default_instructions.trim()}`
        : null,
      options.extraInstructions?.trim()
        ? `Additional instructions for this question: ${options.extraInstructions.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    const prompt = [
      'COMPANY KNOWLEDGE:',
      contextBlock,
      '',
      'AVAILABLE EVIDENCE DOCUMENTS:',
      evidenceBlock,
      '',
      'TENDER QUESTION:',
      question.trim(),
      '',
      'Write the best possible answer using only the company knowledge above.',
    ].join('\n')

    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: answerSchema,
      system,
      prompt,
    })

    const recommendedEvidence = evidence
      .filter((e) =>
        object.recommendedEvidenceTitles.some(
          (t) => t.trim().toLowerCase() === e.title.trim().toLowerCase(),
        ),
      )
      .map((e) => ({ id: e.id, title: e.title }))

    return {
      ok: true,
      answer: object.answer.trim(),
      sources: toSources(chunks),
      recommendedEvidence,
      confidence: object.confidence,
    }
  } catch (err) {
    console.error('[v0] answerTenderQuestion failed:', err)
    return { ok: false, error: 'Could not generate an answer. Please try again.' }
  }
}

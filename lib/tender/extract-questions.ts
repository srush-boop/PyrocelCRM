import 'server-only'
import { generateObject } from 'ai'
import { z } from 'zod'
import { parseDocumentFile } from '@/lib/ai/parse-document'
import { DRAFT_MODEL } from '@/lib/ai/shared'

// Reads an uploaded client tender pack (PDF/Word/text) and pulls out every
// discrete question or requirement the supplier is expected to respond to.
// PDFs are read directly by the multimodal model (handles tables, multi-column
// layouts, scans); Word/text are extracted to plain text first.

const extractionSchema = z.object({
  questions: z
    .array(
      z
        .string()
        .describe(
          'A single, self-contained tender question or requirement, quoted in the client\'s own words as closely as possible. Include any question reference/number at the start if present (e.g. "3.2 Describe your ...").',
        ),
    )
    .describe(
      'Every discrete question, PQQ/SQ item, or "please describe/detail/confirm" requirement that expects a written response. Do not merge unrelated points and do not invent questions. Exclude pure instructions, headings, and pricing-schedule line items unless they ask for a narrative response.',
    ),
})

export interface ExtractQuestionsResult {
  ok: boolean
  questions?: string[]
  error?: string
}

const SYSTEM_PROMPT = [
  'You are a UK bid manager reviewing a client tender / PQQ / ITT pack.',
  'Your job is to identify every question or requirement that expects a written narrative response from the supplier.',
  'Quote each question faithfully in the client\'s own words. Preserve any numbering or references (e.g. "Q4", "3.2.1").',
  'Include items phrased as instructions when they clearly require a response, e.g. "Please describe...", "Detail your approach to...", "Confirm that you...", "Provide evidence of...".',
  'Exclude section headings, general instructions to bidders, form-filling fields (company name, address), and pure pricing-schedule rows that do not need a narrative.',
  'Never invent or reword questions beyond light tidying. If the document contains no answerable questions, return an empty list.',
].join('\n')

/**
 * Extract the list of answerable tender questions from an uploaded pack.
 */
export async function extractTenderQuestions(file: File): Promise<ExtractQuestionsResult> {
  const parsed = await parseDocumentFile(file)
  if (!parsed.ok || !parsed.doc) {
    return { ok: false, error: parsed.error ?? 'Could not read the file.' }
  }

  try {
    let userContent: string
    let filePart: { type: 'file'; data: Uint8Array; mediaType: 'application/pdf' } | null = null

    if (parsed.doc.kind === 'pdf') {
      filePart = { type: 'file', data: parsed.doc.data, mediaType: parsed.doc.mediaType }
      userContent = 'Extract every answerable question or requirement from the attached tender pack.'
    } else {
      userContent = `Extract every answerable question or requirement from this tender pack:\n\n${parsed.doc.text}`
    }

    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: extractionSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: filePart
            ? [{ type: 'text', text: userContent }, filePart]
            : [{ type: 'text', text: userContent }],
        },
      ],
    })

    // Tidy: trim, drop blanks, and de-duplicate while preserving order.
    const seen = new Set<string>()
    const questions: string[] = []
    for (const raw of object.questions) {
      const q = raw.trim()
      if (!q) continue
      const key = q.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      questions.push(q)
    }

    return { ok: true, questions }
  } catch (err) {
    console.error('[v0] extractTenderQuestions failed:', err)
    return { ok: false, error: 'Could not extract questions from that document. Please try again.' }
  }
}

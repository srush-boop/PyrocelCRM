'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DRAFT_MODEL } from '@/lib/ai/shared'
import { fireAlarmKbText } from '@/lib/ai/fire-alarm-spec-kb'

// AI-assisted specification builder for fire alarm quotes. Two steps:
//   1. generateSpecQuestions — after a system type + work type is chosen, the
//      model returns the relevant questions with suggested answers, grounded in
//      Pyrocel's BAFE SP203 knowledge base.
//   2. compileSpecification — turns the answered questions into a professional
//      specification ready to paste into the quote.

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

// ---- Shared types ----

export interface SpecQuestion {
  id: string
  question: string
  help?: string
  type: 'single' | 'multi' | 'text'
  options: string[]
  // Suggested answer(s). For 'single'/'text' the first entry is used.
  suggested: string[]
}

const questionSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().describe('A short stable snake_case identifier for the question.'),
        question: z.string().describe('The question to ask the estimator, in British English.'),
        help: z
          .string()
          .describe('A short one-line hint explaining the choice or the default. Empty string if none.'),
        type: z
          .enum(['single', 'multi', 'text'])
          .describe("'single' = pick one option, 'multi' = pick several, 'text' = free text."),
        options: z
          .array(z.string())
          .describe('The selectable options. Empty array for free-text questions.'),
        suggested: z
          .array(z.string())
          .describe(
            'The recommended answer(s). For single/text provide exactly one entry. For multi provide the recommended selection. Free-text suggestions should be complete, ready-to-use wording.',
          ),
      }),
    )
    .describe('The ordered list of questions needed to build the specification.'),
})

export interface GenerateSpecQuestionsInput {
  systemTypeName: string
  workTypeLabel: string
  workTypeCode: string
  // Any answers already captured on the system's Step 2 questions, for context.
  existingAnswers?: Record<string, string | number | boolean>
  // Any existing free-text specification, so the model can respect prior intent.
  existingSpecification?: string
}

export interface GenerateSpecQuestionsResult {
  ok: boolean
  questions?: SpecQuestion[]
  error?: string
}

const QUESTIONS_SYSTEM_PROMPT = [
  'You are a UK fire & life-safety estimator at Pyrocel preparing a fire detection & alarm system specification.',
  'You will be given the system type and type of work for a quote. Produce the set of questions a designer must answer to build the specification.',
  'Ground every question, option and suggested default in the provided KNOWLEDGE BASE, which reflects Pyrocel\u2019s BAFE SP203 template and BS 5839-1:2025.',
  'Prefer the knowledge base topics, using their exact option labels and suggested defaults. You may omit topics that are irrelevant to the stated type of work, and you may add a small number of extra questions if clearly needed.',
  'Keep the list focused (roughly 6\u201310 questions). Order them logically (modules, standard/category, design particulars, cause & effect, communications, clarifications).',
  'Write in British English. Always provide a sensible suggested default for every question so the estimator can accept-all quickly.',
].join(' ')

export async function generateSpecQuestions(
  input: GenerateSpecQuestionsInput,
): Promise<GenerateSpecQuestionsResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  const contextLines = [
    `System type: ${input.systemTypeName}`,
    `Type of work: ${input.workTypeLabel} (${input.workTypeCode})`,
    input.existingAnswers && Object.keys(input.existingAnswers).length
      ? `Answers already captured: ${JSON.stringify(input.existingAnswers)}`
      : null,
    input.existingSpecification?.trim()
      ? `Existing draft specification (respect prior intent):\n${input.existingSpecification.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    'KNOWLEDGE BASE:',
    fireAlarmKbText(),
    '',
    'CONTEXT:',
    contextLines,
    '',
    'Produce the questions needed to build this specification, each with options and a suggested default.',
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: questionSchema,
      system: QUESTIONS_SYSTEM_PROMPT,
      prompt,
    })
    const questions: SpecQuestion[] = object.questions.map((q) => ({
      id: q.id,
      question: q.question,
      help: q.help?.trim() ? q.help.trim() : undefined,
      type: q.type,
      options: q.options,
      suggested: q.suggested,
    }))
    return { ok: true, questions }
  } catch (err) {
    console.error('[v0] generateSpecQuestions failed:', err)
    return { ok: false, error: 'Could not generate specification questions.' }
  }
}

// ---- Compile step ----

const specSchema = z.object({
  text: z
    .string()
    .describe(
      'The complete fire alarm specification in British English, plain text, ready to paste into the quote. No markdown symbols. Use UPPERCASE section headings on their own line, followed by the relevant paragraphs.',
    ),
})

export interface CompileSpecificationInput {
  systemTypeName: string
  workTypeLabel: string
  workTypeCode: string
  answers: {
    question: string
    answer: string
  }[]
}

export interface CompileSpecificationResult {
  ok: boolean
  text?: string
  error?: string
}

const COMPILE_SYSTEM_PROMPT = [
  'You are a UK fire & life-safety estimator at Pyrocel writing a fire detection & alarm system specification for a quotation.',
  'You are given the estimator\u2019s answers to the specification questions. Compile them into a complete, professional specification.',
  'Use the provided KNOWLEDGE BASE for the correct section order, standard-response wording and standard clauses. Use the standard-response wording verbatim where an answer matches an option, adapting only names, categories and quantities.',
  'Write in British English. Reference BS 5839-1:2025 and BAFE where the knowledge base does.',
  'Structure the document with UPPERCASE section headings (e.g. SYSTEM OVERVIEW, SCOPE OF WORKS, DESIGN, SYSTEM DESIGN PARTICULARS, EVACUATION / CAUSE & EFFECT, COMMUNICATIONS & SIGNALLING, POINTS OF CLARIFICATION, CERTIFICATION) each on their own line, followed by the relevant paragraphs.',
  'Do not invent quantities, part numbers, prices or findings not implied by the answers. Do not include pricing or commercial terms. Do not use markdown symbols such as #, * or backticks.',
].join(' ')

export async function compileSpecification(
  input: CompileSpecificationInput,
): Promise<CompileSpecificationResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!input.answers.length) {
    return { ok: false, error: 'No answers provided to compile.' }
  }

  const answerBlock = input.answers
    .map((a, i) => `${i + 1}. ${a.question}\n   Answer: ${a.answer || '(not specified)'}`)
    .join('\n')

  const prompt = [
    'KNOWLEDGE BASE:',
    fireAlarmKbText(),
    '',
    'CONTEXT:',
    `System type: ${input.systemTypeName}`,
    `Type of work: ${input.workTypeLabel} (${input.workTypeCode})`,
    '',
    'ESTIMATOR ANSWERS:',
    answerBlock,
    '',
    'Compile the complete specification now.',
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: specSchema,
      system: COMPILE_SYSTEM_PROMPT,
      prompt,
    })
    return { ok: true, text: object.text.trim() }
  } catch (err) {
    console.error('[v0] compileSpecification failed:', err)
    return { ok: false, error: 'Could not compile the specification.' }
  }
}

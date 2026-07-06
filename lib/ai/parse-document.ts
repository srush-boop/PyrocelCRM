import 'server-only'
import mammoth from 'mammoth'
import { generateText } from 'ai'

// The maximum raw text we pass to the model. Specs are usually well under this;
// this guards against pathological inputs blowing up token usage.
const MAX_TEXT_CHARS = 60_000

export type ParsedDocument =
  | { kind: 'text'; text: string }
  // PDFs are passed straight to a multimodal model as a file part, which is far
  // more robust than server-side PDF text extraction (handles tables, scans,
  // multi-column layouts, etc.).
  | { kind: 'pdf'; data: Uint8Array; mediaType: 'application/pdf' }

export interface ParseResult {
  ok: boolean
  doc?: ParsedDocument
  fileName?: string
  error?: string
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * Turn an uploaded client-request file into something the model can read.
 * - .docx  -> extracted plain text (mammoth)
 * - .txt/.md/.csv -> decoded text
 * - .pdf   -> raw bytes for a multimodal file part
 * - .doc (legacy binary) -> unsupported, ask for .docx or PDF
 */
export async function parseDocumentFile(file: File): Promise<ParseResult> {
  const ext = extOf(file.name)
  const type = file.type || ''

  try {
    if (ext === 'pdf' || type === 'application/pdf') {
      const data = new Uint8Array(await file.arrayBuffer())
      return { ok: true, doc: { kind: 'pdf', data, mediaType: 'application/pdf' }, fileName: file.name }
    }

    if (ext === 'docx' || type.includes('officedocument.wordprocessingml')) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const { value } = await mammoth.extractRawText({ buffer })
      const text = value.trim()
      if (!text) return { ok: false, error: 'The document appears to be empty.' }
      return { ok: true, doc: { kind: 'text', text: clamp(text) }, fileName: file.name }
    }

    if (['txt', 'md', 'csv', 'text'].includes(ext) || type.startsWith('text/')) {
      const text = (await file.text()).trim()
      if (!text) return { ok: false, error: 'The file appears to be empty.' }
      return { ok: true, doc: { kind: 'text', text: clamp(text) }, fileName: file.name }
    }

    if (ext === 'doc') {
      return {
        ok: false,
        error: 'Legacy .doc files are not supported. Please save as .docx or PDF and try again.',
      }
    }

    return {
      ok: false,
      error: 'Unsupported file type. Please upload a PDF, Word (.docx) or text file.',
    }
  } catch (err) {
    console.error('[v0] parseDocumentFile failed:', err)
    return { ok: false, error: 'Could not read that file. Please try a different format.' }
  }
}

function clamp(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
}

// Model used to transcribe PDFs into plain text for AI grounding. Reads PDFs
// directly as a file part (handles tables, scans, multi-column layouts).
const EXTRACT_MODEL = 'openai/gpt-5.4-mini'

export interface ExtractResult {
  ok: boolean
  text?: string
  error?: string
}

/**
 * Extract readable plain text from an uploaded reference document, for storage
 * and later use as AI grounding. Unlike parseDocumentFile (which hands PDFs to
 * the caller as raw bytes), this always resolves to text:
 * - .docx / .txt / .md / .csv -> decoded/extracted text
 * - .pdf -> transcribed to text via a multimodal model
 * Returns ok:false (non-fatal) when nothing could be extracted.
 */
export async function extractDocumentText(file: File): Promise<ExtractResult> {
  const parsed = await parseDocumentFile(file)
  if (!parsed.ok || !parsed.doc) {
    return { ok: false, error: parsed.error ?? 'Could not read the file.' }
  }

  if (parsed.doc.kind === 'text') {
    return { ok: true, text: parsed.doc.text }
  }

  // PDF: transcribe via multimodal model.
  try {
    const { text } = await generateText({
      model: EXTRACT_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe this document into clean, readable plain text. Preserve headings, lists and table content as text. Do not summarise, comment, or add anything that is not in the document. Output only the transcription.',
            },
            { type: 'file', data: parsed.doc.data, mediaType: parsed.doc.mediaType },
          ],
        },
      ],
    })
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'No text could be extracted from the PDF.' }
    return { ok: true, text: clamp(trimmed) }
  } catch (err) {
    console.error('[v0] extractDocumentText (pdf) failed:', err)
    return { ok: false, error: 'Could not extract text from the PDF.' }
  }
}

export { MAX_TEXT_CHARS }

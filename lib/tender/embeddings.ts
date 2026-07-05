import 'server-only'
import { embed, embedMany } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TenderImportance } from './types'

// text-embedding-3-small returns 1536-dim vectors and is cheap + fast. Routed
// through the Vercel AI Gateway (zero-config), matching the rest of the CRM.
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

// Roughly cap each chunk so a single knowledge item is split into semantically
// searchable pieces without exceeding the embedding context.
const MAX_CHUNK_CHARS = 1500

/**
 * Splits text into chunks on paragraph boundaries, packing paragraphs together
 * up to MAX_CHUNK_CHARS. Long paragraphs are hard-split so nothing is dropped.
 */
export function chunkText(content: string): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_CHARS) {
      pushCurrent()
      for (let i = 0; i < para.length; i += MAX_CHUNK_CHARS) {
        chunks.push(para.slice(i, i + MAX_CHUNK_CHARS))
      }
      continue
    }
    if ((current + '\n\n' + para).length > MAX_CHUNK_CHARS) {
      pushCurrent()
    }
    current = current ? `${current}\n\n${para}` : para
  }
  pushCurrent()

  return chunks.length ? chunks : [content.trim()].filter(Boolean)
}

/** Embeds a single string (used for search queries). */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  })
  return embedding
}

export interface IndexSourceInput {
  sourceType: 'knowledge' | 'prompt' | 'winning_response' | 'completed_tender'
  sourceId: string
  title: string
  content: string
  importance?: TenderImportance
}

/**
 * (Re)indexes a source into tender_knowledge_chunks: removes any existing
 * chunks for the source, then chunks + embeds the new content and inserts it.
 * Uses the service-role client because chunk maintenance is a trusted
 * server-side operation. Failures are swallowed by callers so a save never
 * fails purely because indexing hiccuped — the item can be re-indexed later.
 */
export async function indexSource(input: IndexSourceInput): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('tender_knowledge_chunks')
    .delete()
    .eq('source_type', input.sourceType)
    .eq('source_id', input.sourceId)

  const body = `${input.title}\n\n${input.content}`.trim()
  const chunks = chunkText(body)
  if (chunks.length === 0) return

  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: chunks,
  })

  const rows = chunks.map((content, i) => ({
    source_type: input.sourceType,
    source_id: input.sourceId,
    title: input.title,
    content,
    importance: input.importance ?? 'normal',
    embedding: embeddings[i] as unknown as string,
  }))

  await admin.from('tender_knowledge_chunks').insert(rows)
}

/** Removes all chunks belonging to a source (on delete/deactivate). */
export async function removeSource(
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('tender_knowledge_chunks')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
}

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from './embeddings'
import type { TenderImportance } from './types'

export interface RetrievedChunk {
  id: string
  sourceType: string
  sourceId: string
  title: string
  content: string
  importance: TenderImportance
  similarity: number
}

interface MatchRow {
  id: string
  source_type: string
  source_id: string
  title: string
  content: string
  importance: TenderImportance
  similarity: number
}

/**
 * Retrieves the most relevant company-knowledge chunks for a question.
 *
 * Per the spec's RAG principle, all "critical" knowledge is ALWAYS included
 * regardless of similarity, then semantically similar chunks are added up to
 * `matchCount`. Results are de-duplicated and ordered critical-first, then by
 * similarity.
 */
export async function retrieveContext(
  query: string,
  matchCount = 8,
): Promise<RetrievedChunk[]> {
  const admin = createAdminClient()
  const embedding = await embedText(query)

  const [matched, critical] = await Promise.all([
    admin.rpc('match_tender_chunks', {
      query_embedding: embedding as unknown as string,
      match_count: matchCount,
      min_similarity: 0.15,
    }),
    admin
      .from('tender_knowledge_chunks')
      .select('id, source_type, source_id, title, content, importance')
      .eq('importance', 'critical')
      .limit(20),
  ])

  const byId = new Map<string, RetrievedChunk>()

  for (const row of (matched.data as MatchRow[] | null) ?? []) {
    byId.set(row.id, {
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      content: row.content,
      importance: row.importance,
      similarity: row.similarity,
    })
  }

  // Critical chunks are force-included (similarity 1 so they sort first).
  for (const row of (critical.data as Omit<MatchRow, 'similarity'>[] | null) ?? []) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.title,
        content: row.content,
        importance: row.importance,
        similarity: 1,
      })
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.importance === 'critical' && b.importance !== 'critical') return -1
    if (b.importance === 'critical' && a.importance !== 'critical') return 1
    return b.similarity - a.similarity
  })
}

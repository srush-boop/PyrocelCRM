import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from './embeddings'
import type {
  Tender,
  TenderEvidence,
  TenderKnowledgeItem,
  TenderPrompt,
  TenderQuestion,
  TenderSettings,
  TenderVaultEntry,
} from './types'

export async function getKnowledgeItems(): Promise<TenderKnowledgeItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_knowledge_items')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as TenderKnowledgeItem[]
}

export async function getEvidence(): Promise<TenderEvidence[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_evidence')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as TenderEvidence[]
}

export async function getPrompts(): Promise<TenderPrompt[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_prompts')
    .select('*')
    .order('name')
  return (data ?? []) as TenderPrompt[]
}

export async function getTenders(): Promise<Tender[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenders')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Tender[]
}

export async function getTender(id: string): Promise<Tender | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as Tender | null) ?? null
}

export async function getTenderQuestions(
  tenderId: string,
): Promise<TenderQuestion[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_questions')
    .select('*')
    .eq('tender_id', tenderId)
    .order('sort_order')
    .order('created_at')
  return (data ?? []) as TenderQuestion[]
}

// Saved winning responses across all tenders, for the Previous Responses page.
export async function getWinningResponses(): Promise<TenderQuestion[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_questions')
    .select('*')
    .eq('is_winning_response', true)
    .order('updated_at', { ascending: false })
  return (data ?? []) as TenderQuestion[]
}

// Completed tenders stored in the vault, newest first.
export async function getVaultEntries(): Promise<TenderVaultEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_vault')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as TenderVaultEntry[]
}

export async function getSettings(): Promise<TenderSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tender_settings')
    .select('*')
    .limit(1)
    .maybeSingle()
  return (data as TenderSettings | null) ?? null
}

export interface KnowledgeStats {
  knowledgeCount: number
  criticalCount: number
  evidenceCount: number
  promptCount: number
  tenderCount: number
  winningCount: number
  vaultCount: number
}

export async function getTenderStats(): Promise<KnowledgeStats> {
  const supabase = await createClient()
  const [k, crit, e, p, t, w, v] = await Promise.all([
    supabase.from('tender_knowledge_items').select('id', { count: 'exact', head: true }),
    supabase
      .from('tender_knowledge_items')
      .select('id', { count: 'exact', head: true })
      .eq('importance', 'critical'),
    supabase.from('tender_evidence').select('id', { count: 'exact', head: true }),
    supabase.from('tender_prompts').select('id', { count: 'exact', head: true }),
    supabase.from('tenders').select('id', { count: 'exact', head: true }),
    supabase
      .from('tender_questions')
      .select('id', { count: 'exact', head: true })
      .eq('is_winning_response', true),
    supabase.from('tender_vault').select('id', { count: 'exact', head: true }),
  ])
  return {
    knowledgeCount: k.count ?? 0,
    criticalCount: crit.count ?? 0,
    evidenceCount: e.count ?? 0,
    promptCount: p.count ?? 0,
    tenderCount: t.count ?? 0,
    winningCount: w.count ?? 0,
    vaultCount: v.count ?? 0,
  }
}

export interface SearchHit {
  sourceType: string
  sourceId: string
  title: string
  content: string
  similarity: number
}

/**
 * Semantic search across all indexed company knowledge. Embeds the query and
 * runs cosine KNN via match_tender_chunks, collapsing chunk hits to their best
 * source. Uses the admin client purely to call the retrieval RPC.
 */
export async function searchKnowledge(query: string): Promise<SearchHit[]> {
  if (!query.trim()) return []
  const admin = createAdminClient()
  const embedding = await embedText(query)
  const { data } = await admin.rpc('match_tender_chunks', {
    query_embedding: embedding as unknown as string,
    match_count: 20,
    min_similarity: 0.2,
  })

  const best = new Map<string, SearchHit>()
  for (const row of (data as
    | {
        source_type: string
        source_id: string
        title: string
        content: string
        similarity: number
      }[]
    | null) ?? []) {
    const key = `${row.source_type}:${row.source_id}`
    const existing = best.get(key)
    if (!existing || row.similarity > existing.similarity) {
      best.set(key, {
        sourceType: row.source_type,
        sourceId: row.source_id,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
      })
    }
  }
  return Array.from(best.values()).sort((a, b) => b.similarity - a.similarity)
}
